# Auto TRPG 프로젝트 종합 리뷰 결과

> **리뷰 일시**: 2026-02-12
> **리뷰 방법**: 5인 AI 전문가 팀 (Tech Architect, PM, UI/UX Designer, Devil's Advocate, QA Engineer)
> **검증 범위**: 전체 코드베이스 (100+ 파일), Git 히스토리 (71커밋), DB 마이그레이션 (11개)

---

## 1. 프로젝트 현황 대시보드

| Phase | 기능 완성도 | 프로덕션 준비도 | 상태 |
|-------|:---------:|:------------:|:----:|
| Phase 1 (기반 구축) | 97% | 70% | ✅ 거의 완료 |
| Phase 2 (컨텍스트+멀티플레이어) | 92% | 65% | ✅ 거의 완료 |
| Phase 3 (고도화) | 70% | 50% | 🔄 진행 중 |
| Phase 4 (프로덕션) | 0% | 0% | ❌ 미착수 |
| **전체** | **~72%** | **~50%** | 🔄 |

### 전문가별 평가 점수

| 영역 | 점수 | 평가자 |
|------|------|--------|
| 아키텍처 품질 | 4.5/5 | Tech Architect |
| UI/UX 완성도 | 85% (B+) | UI/UX Designer |
| 코드 품질 | 6.5/10 | QA Engineer |
| 프로덕션 준비도 | 40% | Devil's Advocate |
| 전체 진행률 | 71.25% | PM |

---

## 2. Phase별 상세 상태

### Phase 1 (기반 구축) — 97%

| Task | 상태 | 비고 |
|------|------|------|
| 1.1 모노레포 초기화 | ✅ | Turborepo + pnpm |
| 1.2 공유 패키지 | 🔄 90% | packages/ui 비어있음 |
| 1.3 DB 스키마 | ✅ 초과달성 | 11개 마이그레이션 |
| 1.4 인증 시스템 | ✅ | OAuth 미구현 |
| 1.5 LLM 프로바이더 | ✅ | Claude/OpenAI/Gemini + BYOK |
| 1.6 게임 서버 | ✅ 초과달성 | 세이브포인트, 캠페인 API 추가 |
| 1.7 RAG 파이프라인 | ✅ 초과달성 | Phase 3 고급 기능까지 포함 |
| 1.8 게임 엔진 | ✅ | DiceEngine + GameEngine + CombatManager |
| 1.9 컨텍스트 매니저 | ✅ | Tier 0-3 + BudgetAllocator |
| 1.10 프론트엔드 | ✅ 초과달성 | 6개 패널 + 다크모드 + 반응형 |

### Phase 2 (컨텍스트+멀티플레이어) — 92%

| Task | 상태 | 비고 |
|------|------|------|
| 2.1 메모리 계층 | ✅ | MemoryHierarchy + Summarizer + StateTracker |
| 2.2 GM 개입 판단 | ✅ | 2단계 파이프라인 (규칙→LLM) |
| 2.3 Socket.io | 🔄 80% | 기본 완료, Pub/Sub 미완성 |
| 2.4 Redis 상태 | 🔄 90% | TTL 관리 미확인 |
| 2.5 전투 시스템 | 🔄 70% | 파일 존재, 세부 기능 미검증 |

### Phase 3 (고도화) — 70%

| Task | 상태 | 비고 |
|------|------|------|
| 3.1 RAG 고도화 | ✅ 95% | 리랭킹, 체이닝, 핫캐시 완료. OCR 미구현 |
| 3.2 고급 UI | 🔄 50-70% | NarrativeLog ✅, 주사위 애니메이션 ❌ |
| 3.3 세이브/로드 | ✅ | SaveManager + AutoSave + 캠페인 |
| Token Economy | ✅ | 계획 외 추가 기능 |

### Phase 4 (프로덕션) — 0%

모두 미착수: AWS 인프라, 보안 강화, 모니터링, 부하 테스트, 문서화

---

## 3. 치명적 결함 (P0 — 즉시 수정 필요)

### 3.1 LLM API 에러 처리 전무
- **위치**: `apps/game-server/src/services/llm/claude.ts`, `openai.ts`
- **문제**: try-catch 없이 직접 호출. 네트워크 오류, rate limit → 서버 크래시
- **수정**: 재시도 로직 + exponential backoff + 사용자 알림
- **예상 시간**: 4h

### 3.2 stateChanges 검증 부재
- **위치**: `apps/game-server/src/services/game/GameEngine.ts` (processAction)
- **문제**: LLM이 생성한 stateChanges를 검증 없이 적용. HP -9999 등 hallucination 위험
- **수정**: 범위 검증 (HP 0-max), characterId 존재 확인, 값 정규화
- **예상 시간**: 3h

### 3.3 Socket.io Rate Limiting 없음
- **위치**: `apps/game-server/src/socket/EventHandlers.ts`
- **문제**: 이벤트에 rate limit 전무. 악의적 사용자 → LLM API 비용 폭탄
- **수정**: express-rate-limit + Socket.io 레벨 throttling
- **예상 시간**: 4h

### 3.4 void DB 저장 패턴
- **위치**: `apps/game-server/src/socket/EventHandlers.ts` (line ~239-250)
- **문제**: `void supabaseAdmin.from('messages').insert(...)` — 에러 무시 패턴
- **수정**: await 처리 + 에러 핸들링 강화
- **예상 시간**: 3h

### 3.5 console.log 프로덕션 방치
- **위치**: 22개 파일 (game-server 18, web 4)
- **주요 파일**:
  - `apps/game-server/src/socket/EventHandlers.ts`
  - `apps/game-server/src/services/memory/MemoryHierarchy.ts`
  - `apps/game-server/src/services/redis/PersistenceManager.ts`
  - `apps/game-server/src/bootstrap.ts`
  - `apps/web/lib/hooks/useGameSocket.ts`
- **수정**: 로깅 라이브러리 (Winston/Pino) 도입 + console.log 제거
- **예상 시간**: 4h

### 3.6 ContextManager RAG 스텁
- **위치**: `apps/game-server/src/services/context/ContextManager.ts` (getRelevantRules)
- **문제**: 빈 문자열 반환 (스텁). GM이 규칙서를 참조하지 못함
- **수정**: RuleRetriever.searchEnhanced 호출로 교체
- **예상 시간**: 4h

### 3.7 ESLint 미설정
- **위치**: 프로젝트 루트
- **문제**: ESLint 설정 파일 없음. 코드 스타일 일관성 보장 불가
- **수정**: eslint + @typescript-eslint 설정
- **예상 시간**: 4h

**P0 총 예상 시간: ~26h**

---

## 4. 높은 위험 (P1 — 1-2주 내 수정)

### 4.1 캐릭터 생성 폼 미구현
- 계획서 Task 1.10에 명시되었으나 독립적인 UI 미발견
- 사용자가 캐릭터를 생성할 수 없음
- **예상 시간**: 8h

### 4.2 규칙서 업로드 페이지 미구현
- `/rulebooks/upload` 라우트만 존재, 실제 업로드 UI 없음
- **예상 시간**: 6h

### 4.3 web any 타입 (6개 파일)
- `apps/web/app/(game)/session/[id]/page.tsx`
- `apps/web/app/(dashboard)/rulebooks/page.tsx`
- `apps/web/app/(dashboard)/campaigns/new/page.tsx`
- `apps/web/app/(dashboard)/settings/page.tsx`
- `apps/web/app/(dashboard)/dashboard/sessions/new/page.tsx`
- `apps/web/app/(dashboard)/dashboard/page.tsx`
- **예상 시간**: 3h

### 4.4 토큰 카운팅 부정확
- **위치**: `claude.ts:139-147`, `openai.ts:147-155`
- 간단한 근사치 사용. 실제 tokenizer와 20-30% 오차
- tiktoken 또는 공식 tokenizer 도입 필요
- **예상 시간**: 4h

### 4.5 프롬프트 인젝션 방어 전무
- 사용자 입력이 그대로 LLM 시스템 프롬프트에 삽입
- sanitization 없음
- **예상 시간**: 4h

### 4.6 Redis 영속화 실패 시 복구 불가
- **위치**: `PersistenceManager.ts:139-193`
- dirty 플래그가 실패해도 초기화 → 변경사항 영구 손실
- 재시도 큐 구현 필요
- **예상 시간**: 4h

### 4.7 접근성 부족 (60%)
- aria-label 누락 (아이콘 전용 버튼)
- 키보드 네비게이션 제한적
- WCAG AA 색상 대비 미검증
- **예상 시간**: 8h

**P1 총 예상 시간: ~37h**

---

## 5. 중기 개선 (P2 — 2-4주)

### 테스트
- web 유닛 테스트 작성 (현재 0개) — 40h
- 통합 테스트 (LLM/DB/Socket) — 15h
- E2E 테스트 (Playwright) — 16h
- 커버리지 측정 설정 (@vitest/coverage-v8) — 2h
- 현재 추정 커버리지: ~40%, 목표: 80%

### 인프라
- Redis Pub/Sub + Socket.io Adapter (수평 확장) — 8h
- Redis TTL 관리 강화 — 4h
- GitHub Actions CI/CD — 6h

### UI/UX
- 캠페인 상세 페이지 — 8h
- OAuth 로그인 (Google, GitHub) — 6h
- 검색/필터링/정렬 (목록 페이지) — 8h
- 페이지네이션 — 4h

---

## 6. 장기 로드맵 (P3 — Phase 4)

### Phase 4 진입 권장 시점
- P0 + P1 완료 후 (약 2-3주 후)

### 권장 일정
| 마일스톤 | 목표일 | 내용 |
|----------|--------|------|
| P0 완료 | 2월 3주차 | 7개 치명적 결함 수정 |
| P1 완료 | 2월 4주차 | 누락 페이지 + 품질 보강 |
| Phase 4.1 | 3월 1-2주차 | AWS CDK + ECS Fargate + CI/CD |
| Phase 4.2 | 3월 2주차 | 보안 강화 (RLS, rate limit) |
| Phase 4.3 | 3월 3주차 | 모니터링 (CloudWatch, Sentry) |
| Phase 4.4 | 3월 3-4주차 | 랜딩 페이지, 문서화, 부하 테스트 |
| v1.0.0 | 3월 15일 | 프로덕션 출시 |

---

## 7. 아키텍처 강점 (유지해야 할 것)

1. **우수한 모듈화**: services/ 계층 분리 (LLM, Context, Memory, Intervention, RAG, Game, Redis, Socket)
2. **멀티 프로바이더 LLM**: Claude/OpenAI/Gemini 동일 인터페이스 + BYOK
3. **4단계 메모리 계층**: Tier 0→1→2→3 + BudgetAllocator + SceneDetector
4. **고급 RAG**: 하이브리드 검색 + 리랭킹 + 규칙 체이닝 + 핫 캐시
5. **디자인 시스템**: CSS 변수, 5단계 배경, 다크/라이트, 골드 액센트, 3개 폰트
6. **TypeScript strict**: noUnusedLocals, noUnusedParameters, game-server any 0개
7. **세이브/로드**: 자동 세이브 + 수동 세이브 + 일시정지 + 캠페인 연결

---

## 8. 숨겨진 위험 (주의 사항)

### 시장/제품 리스크
- BYOK 모델의 사용자 마찰 (API 키 직접 발급 필요)
- 한국어 시장 크기 제한 (글로벌 TRPG 시장의 5% 미만)
- RAG 품질 미검증 (D&D 5e SRD 실제 업로드 테스트 없음)

### 기술 리스크
- 단일 기여자 (버스 팩터 = 1)
- 메모리 누수 가능성 (타이머 정리 불완전, 세션당 GameEngine 인스턴스)
- ENCRYPTION_SECRET 개발 환경 fallback (staging 미체크)

### 비용 리스크
- LLM API 비용 폭증 가능 (rate limiting 없음)
- Redis 메모리 비용 (세션당 1-5MB, TTL 미흡)

---

## 9. 테스트 현황

### game-server: 168+ 테스트 (✅ 전부 통과)
| 모듈 | 테스트 수 |
|------|:---------:|
| ConditionTracker | 22 |
| DiceEngine | 21 |
| CombatManager | 20 |
| InterventionRules | 18 |
| KeyManager | 17 |
| SemanticChunker | 16 |
| ContextManager | 13 |
| GameEngine | 12 |
| RoomManager | 11 |
| PersistenceManager | 10 |
| BudgetAllocator | 9 |
| TokenCost | 9 |

### 미테스트 영역
- apps/web: **0개** (심각)
- packages/utils: **0개**
- functions/embedding-worker: **0개**
- LLM 프로바이더 통합: **0개**
- Socket 통합: **0개**
- Supabase DB 연동: **0개**

---

## 10. 커밋 히스토리 요약

- **총 커밋**: 71개
- **활발 기간**: 최근 2주 (94%)
- **PR**: 13개 머지
- **기여자**: 1명
- **브랜치 전략**: feature/, fix/ 분리
- **커밋 메시지**: conventional commits (한국어)

### 주요 마일스톤
1. 2026-02-09: Phase 1-2 완료 (43커밋)
2. 2026-02-10: 세이브/로드 시스템
3. 2026-02-11: RAG 고도화
4. 2026-02-12: Token Economy + 리뷰

---

*이 문서는 프로젝트의 현재 상태를 기록한 스냅샷입니다. 작업 진행에 따라 업데이트하세요.*
