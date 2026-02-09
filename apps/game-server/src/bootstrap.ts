// GameEngine 부트스트랩 — 세션별 GameEngine 인스턴스 팩토리

import { supabaseAdmin } from './lib/supabase';
import { decrypt } from './lib/crypto';
import { LLMRouter } from './services/llm/router';
import type { LLMProviderId, LLMMessage, LLMToolDefinition } from './services/llm/provider';
import { GameEngine } from './services/game/GameEngine';
import type { GMResponse } from './services/game/gmTools';
import { DiceEngine } from './services/game/DiceEngine';
import { ContextManager } from './services/context/ContextManager';

/**
 * 세션에 대한 GameEngine 인스턴스 생성
 *
 * 1. DB에서 사용자 API 키 로드 → 복호화
 * 2. LLMRouter 생성 → GameEngine이 기대하는 인터페이스로 래핑
 * 3. ContextManager, DiceEngine 조립
 * 4. GameEngine 반환
 */
export async function createGameEngineForSession(
  _sessionId: string,
  userId: string,
): Promise<GameEngine> {
  // 1. 사용자 API 키 로드
  const { data: keyRecords } = await supabaseAdmin
    .from('user_api_keys')
    .select('provider, encrypted_key, iv, auth_tag')
    .eq('user_id', userId);

  // 2. LLM 라우터 생성 (키가 있는 경우만)
  let llmWrapper: { call: (messages: unknown[], tools: unknown[]) => Promise<GMResponse> } | null =
    null;

  if (keyRecords && keyRecords.length > 0) {
    const apiKeyMap = new Map<LLMProviderId, string>();

    for (const record of keyRecords) {
      try {
        const decryptedKey = decrypt(record.encrypted_key, record.iv, record.auth_tag);
        apiKeyMap.set(record.provider as LLMProviderId, decryptedKey);
      } catch (err) {
        console.warn(`[bootstrap] ${record.provider} 키 복호화 실패:`, err);
      }
    }

    if (apiKeyMap.size > 0) {
      const llmRouter = new LLMRouter(apiKeyMap);

      // GameEngine이 기대하는 { call } 인터페이스로 래핑
      llmWrapper = {
        call: async (messages: unknown[], tools: unknown[]): Promise<GMResponse> => {
          const { provider, model } = llmRouter.getProvider('gm_response');

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
          });

          // Tool Use 응답 → GMResponse 변환
          if (response.toolCalls && response.toolCalls.length > 0) {
            const args = response.toolCalls[0].arguments;
            return {
              narrative: (args.narrative as string) || '',
              stateChanges: args.stateChanges as GMResponse['stateChanges'],
              diceRolls: args.diceRolls as GMResponse['diceRolls'],
              rulesApplied: args.rulesApplied as GMResponse['rulesApplied'],
              sceneTransition: args.sceneTransition as GMResponse['sceneTransition'],
            };
          }

          // Tool Use가 없는 경우: content를 내러티브로 사용
          return { narrative: response.content || '[GM 응답 없음]' };
        },
      };
    }
  }

  // 3. 나머지 컴포넌트 생성
  const contextManager = new ContextManager();
  const diceEngine = new DiceEngine();

  // 4. GameEngine 조립 및 반환 (MemoryHierarchy, InterventionManager는 null)
  return new GameEngine(contextManager, llmWrapper, diceEngine, null, null);
}
