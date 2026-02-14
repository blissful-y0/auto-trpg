// GameEngine 부트스트랩 — 세션별 GameEngine 인스턴스 팩토리

import { supabaseAdmin } from './lib/supabase';
import { decrypt } from './lib/crypto';
import { LLMRouter } from './services/llm/router';
import type { LLMProviderId, LLMMessage, LLMToolDefinition } from './services/llm/provider';
import { GameEngine } from './services/game/GameEngine';
import type { GMResponse } from './services/game/gmTools';
import { DiceEngine } from './services/game/DiceEngine';
import { ContextManager } from './services/context/ContextManager';
import { MemoryHierarchy } from './services/memory/MemoryHierarchy';
import { BudgetAllocator } from './services/memory/BudgetAllocator';
import { Summarizer } from './services/memory/Summarizer';
import type { SummarizerLLM } from './services/memory/Summarizer';
import { StateTracker } from './services/memory/StateTracker';
import { SceneDetector } from './services/memory/SceneDetector';
import { MemoryRetriever } from './services/memory/MemoryRetriever';
import { Embedder, RuleRetriever } from './services/rag';

/**
 * 세션에 대한 GameEngine 인스턴스 생성
 *
 * 1. DB에서 사용자 API 키 로드 → 복호화
 * 2. LLMRouter 생성 → GameEngine이 기대하는 인터페이스로 래핑
 * 3. ContextManager, MemoryHierarchy, DiceEngine 조립
 * 4. GameEngine 반환
 */
export async function createGameEngineForSession(
  sessionId: string,
  userId: string,
): Promise<GameEngine> {
  // 소프트 삭제된 세션 제외
  const { data: sessionRow } = await supabaseAdmin
    .from('game_sessions')
    .select('primary_provider, settings')
    .eq('id', sessionId)
    .is('deleted_at', null)
    .single();

  const settings =
    sessionRow?.settings &&
    typeof sessionRow.settings === 'object' &&
    !Array.isArray(sessionRow.settings)
      ? (sessionRow.settings as Record<string, unknown>)
      : null;
  const llmSettings =
    settings?.llm && typeof settings.llm === 'object' && !Array.isArray(settings.llm)
      ? (settings.llm as Record<string, unknown>)
      : null;

  const preferredProvider =
    (sessionRow?.primary_provider as LLMProviderId | undefined) ??
    (llmSettings?.provider as LLMProviderId | undefined);
  const preferredModel =
    typeof llmSettings?.model === 'string' && llmSettings.model.length > 0
      ? llmSettings.model
      : undefined;

  // 1. 사용자 API 키 로드
  // 소프트 삭제된 API 키 제외
  const { data: keyRecords } = await supabaseAdmin
    .from('user_api_keys')
    .select('provider, encrypted_key, iv, auth_tag')
    .eq('user_id', userId)
    .is('deleted_at', null);

  // 2. LLM 라우터 생성 (키가 있는 경우만)
  const apiKeyMap = new Map<LLMProviderId, string>();
  let llmWrapper: { call: (messages: unknown[], tools: unknown[]) => Promise<GMResponse> } | null =
    null;
  let llmRouter: LLMRouter | null = null;

  if (keyRecords && keyRecords.length > 0) {
    for (const record of keyRecords) {
      try {
        const decryptedKey = decrypt(record.encrypted_key, record.iv, record.auth_tag);
        apiKeyMap.set(record.provider as LLMProviderId, decryptedKey);
      } catch (err) {
        console.warn(`[bootstrap] ${record.provider} 키 복호화 실패:`, err);
      }
    }

    if (apiKeyMap.size > 0) {
      llmRouter = new LLMRouter(apiKeyMap);

      // GameEngine이 기대하는 { call } 인터페이스로 래핑
      llmWrapper = {
        call: async (messages: unknown[], tools: unknown[]): Promise<GMResponse> => {
          const { provider, model } = llmRouter!.getProviderForTask('gm_response', {
            preferredProvider,
            preferredModel,
          });

          // GM_TOOLS → LLMToolDefinition 변환
          const toolDefs = (
            tools as Array<{
              name: string;
              description: string;
              parameters: Record<string, unknown>;
            }>
          ).map(
            (t) =>
              ({
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              }) as LLMToolDefinition,
          );

          const response = await provider.generateWithTools({
            messages: messages as LLMMessage[],
            tools: toolDefs,
            model,
            maxTokens: 4096,
            temperature: 0.8,
            toolChoice: 'required',
          });

          // 토큰 사용량 추출
          const tokenUsage = {
            promptTokens: response.usage.promptTokens,
            completionTokens: response.usage.completionTokens,
            totalTokens: response.usage.totalTokens,
            model,
            provider: provider.providerId,
          };

          // Tool Use 응답 → GMResponse 변환
          if (response.toolCalls && response.toolCalls.length > 0) {
            const args = response.toolCalls[0].arguments;
            return {
              narrative: (args.narrative as string) || '',
              stateChanges: args.stateChanges as GMResponse['stateChanges'],
              diceRolls: args.diceRolls as GMResponse['diceRolls'],
              rulesApplied: args.rulesApplied as GMResponse['rulesApplied'],
              sceneTransition: args.sceneTransition as GMResponse['sceneTransition'],
              tokenUsage,
            };
          }

          // Tool Use가 없는 경우: content에서 JSON 파싱 시도
          const content = response.content || '';
          if (content.trim().startsWith('{')) {
            try {
              const jsonStr = content.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
              const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
              if (typeof parsed.narrative === 'string') {
                return {
                  narrative: parsed.narrative,
                  stateChanges: parsed.stateChanges as GMResponse['stateChanges'],
                  diceRolls: parsed.diceRolls as GMResponse['diceRolls'],
                  rulesApplied: parsed.rulesApplied as GMResponse['rulesApplied'],
                  sceneTransition: parsed.sceneTransition as GMResponse['sceneTransition'],
                  tokenUsage,
                };
              }
            } catch {
              // JSON 파싱 실패 시 content를 그대로 내러티브로 사용
            }
          }
          return { narrative: content || '[GM 응답 없음]', tokenUsage };
        },
      };
    }
  }

  // 3. MemoryHierarchy 컴포넌트 생성
  const hasOpenAIEmbedding = Boolean(process.env.OPENAI_API_KEY) || apiKeyMap.has('openai');
  const ruleRetriever = hasOpenAIEmbedding
    ? new RuleRetriever(
        supabaseAdmin,
        new Embedder({
          apiKey: apiKeyMap.get('openai') ?? process.env.OPENAI_API_KEY,
        }),
      )
    : null;

  const memoryRetriever = new MemoryRetriever(supabaseAdmin);
  const budgetAllocator = new BudgetAllocator();
  const stateTracker = new StateTracker();
  const sceneDetector = new SceneDetector();

  // Summarizer: LLMRouter가 있으면 실제 LLM 연동, 없으면 폴백
  const summarizerLLM: SummarizerLLM = llmRouter
    ? createSummarizerAdapter(llmRouter)
    : createFallbackSummarizer();

  const { model: summarizerModel } = llmRouter
    ? llmRouter.getProviderForTask('summarize')
    : { model: 'fallback' };

  const summarizer = new Summarizer(summarizerLLM, summarizerModel);

  // 임베딩 생성기 (LLMRouter가 embedding 태스크를 지원하면 연결)
  const embeddingGenerator = llmRouter
    ? async (text: string) => llmRouter!.generateEmbedding(text)
    : undefined;

  const memoryHierarchy = new MemoryHierarchy(
    budgetAllocator,
    summarizer,
    stateTracker,
    sceneDetector,
    memoryRetriever,
    embeddingGenerator,
  );

  // 4. ContextManager + GameEngine 조립
  const contextManager = new ContextManager(
    memoryHierarchy,
    supabaseAdmin,
    ruleRetriever ?? undefined,
  );
  const diceEngine = new DiceEngine();

  return new GameEngine(contextManager, llmWrapper, diceEngine, memoryHierarchy, null);
}

// LLMRouter → SummarizerLLM 어댑터
function createSummarizerAdapter(router: LLMRouter): SummarizerLLM {
  return {
    generateText: async (request) => {
      const { provider, model } = router.getProviderForTask('summarize');
      const messages = request.messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant',
        content: m.content,
      }));
      const response = await provider.generateText({
        messages,
        model: request.model ?? model,
        maxTokens: request.maxTokens ?? 500,
        temperature: request.temperature ?? 0.3,
      });
      return { content: response.content };
    },
  };
}

// LLM 미연동 시 폴백 Summarizer (입력 텍스트를 간단 축약)
function createFallbackSummarizer(): SummarizerLLM {
  return {
    generateText: async (request) => {
      const userMsg = request.messages.find((m) => m.role === 'user');
      const text = userMsg?.content ?? '';
      // 최대 200자로 잘라서 폴백 요약
      const truncated = text.length > 200 ? text.slice(0, 200) + '...' : text;
      return {
        content: JSON.stringify({
          summary: truncated,
          keyEvents: [],
        }),
      };
    },
  };
}
