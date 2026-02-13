# 코드 품질 리스크 리뷰 (토큰 효율/보안/유지보수/성능)

> 작성일: 2026-02-12
> 대상: `apps/game-server`, `apps/web`, `supabase/migrations`
> 목적: "왜 문제인지"와 "실제 운영에서 어떤 일이 벌어지는지"를 근거 중심으로 기록

---

## 1) 요약

이번 코드 리뷰에서 가장 큰 리스크는 다음 5가지입니다.

1. 실시간 경로의 호출 제한 부재 (비용 폭증/지연/가용성 저하)
2. 토큰 예산 로직이 시스템 컨텍스트 과증가를 제대로 제어하지 못함
3. 메모리 검색 쿼리와 스키마 불일치 (DB 기반 회상 실패 가능)
4. 비프로덕션 환경의 고정 암호화 시크릿 fallback
5. 규칙서 삭제 시 S3 오브젝트 미삭제 (데이터 수명관리 실패)

---

## 2) 상세 리스크 기록

### R1. 실시간 이벤트 호출 제한 부재 (가장 우선)

#### 코드 근거

- HTTP 레벨: rate limit 미들웨어 없음
  - `apps/game-server/src/index.ts:27`
- 소켓 이벤트에서 고비용 처리 직접 진입
  - `apps/game-server/src/socket/EventHandlers.ts:226` (`player:action`)
  - `apps/game-server/src/socket/EventHandlers.ts:432` (`chat:message`)
  - `apps/game-server/src/socket/EventHandlers.ts:564` (`combat:action`)
  - `apps/game-server/src/socket/EventHandlers.ts:116` (`processWithGameEngine`)
- 큐는 "순서 보장"만 있고, 길이 제한/유저 quota/백프레셔 없음
  - `apps/game-server/src/socket/ActionQueue.ts:5`

#### 왜 문제인가

인증/멤버십 체크는 "누가 호출 가능한가"를 통제할 뿐, "얼마나 자주 호출 가능한가"를 통제하지 못합니다.
LLM 호출/DB 조회/게임엔진 처리처럼 비싼 작업이 호출량 제한 없이 노출되면, 정상 사용자 한 명의 오작동 클라이언트만으로도 큐가 누적되고 전체 세션 지연이 증가합니다.

#### 실생활 예시

- **예시 A (매크로 남용):** 한 사용자가 초당 10~20회 `player:action` 전송
  - 결과: ActionQueue backlog 증가 -> 응답 지연 증가 -> 체감 렉 발생
  - 부수효과: LLM API 호출량 급증으로 비용 급등
- **예시 B (클라이언트 버그):** 프론트 버그로 동일 이벤트 재전송 루프 발생
  - 결과: 공격 의도 없이도 장애 유사 현상 발생

#### 운영 영향

- 보안: OWASP API4(무제한 자원 소비) 유형
- 성능: tail latency 급상승, 타 세션까지 영향
- 비용: 토큰/외부 API 비용 통제 실패

---

### R2. ContextManager 토큰 예산 제어 취약

#### 코드 근거

- 기본 예산 상수 및 체크
  - `apps/game-server/src/services/context/ContextManager.ts:92`
  - `apps/game-server/src/services/context/ContextManager.ts:180`
- trim 로직이 시스템 메시지는 유지하고 채팅만 줄임
  - `apps/game-server/src/services/context/ContextManager.ts:279`
  - `apps/game-server/src/services/context/ContextManager.ts:281`

#### 왜 문제인가

시스템/캐릭터/요약(Tier2/3) 블록이 커지면, 채팅만 줄이는 방식은 근본 제어가 안 됩니다.
즉, 대화 맥락이 과도하게 손실되거나, 시스템 블록이 예산을 대부분 차지해 품질/비용이 악화됩니다.

#### 실생활 예시

- **예시 A (장기 캠페인):** 캐릭터/요약이 누적되어 시스템 블록이 비대해짐
  - 결과: 최신 대화가 잘려 모델이 맥락을 놓침
  - 현상: "방금 한 말"을 못 따라가거나 반복 응답 증가
- **예시 B (비용 악화):** 호출당 입력 토큰이 계속 높은 상태로 유지
  - 결과: 기능은 동작해도 비용과 지연이 지속 상승

#### 운영 영향

- 토큰 경제성 악화
- 응답 품질 저하(문맥 손실)
- 디버깅 난이도 상승(왜 잘렸는지 추적 어려움)

---

### R3. MemoryRetriever 쿼리/스키마 불일치

#### 코드 근거

- 조회 컬럼 고정: `summary, key_events, embedding`
  - `apps/game-server/src/services/memory/MemoryRetriever.ts:150`
- `session_summaries`는 `key_decisions`, `plot_points` 사용
  - `supabase/migrations/005_context_tables.sql:30`
  - `supabase/migrations/005_context_tables.sql:34`
  - `supabase/migrations/005_context_tables.sql:35`

#### 왜 문제인가

테이블별 컬럼 구조가 다른데 동일 select를 사용하면, 특정 경로에서 조회 실패 또는 빈 결과 폴백이 발생할 수 있습니다.
이 경우 인메모리 폴백 의존도가 올라가고, 프로세스 재시작 이후 문맥 회상 품질이 떨어질 수 있습니다.

#### 실생활 예시

- **예시 A (재시작 이후 회상 손실):** 배포/재시작 후 과거 세션 요약 검색이 약해짐
  - 결과: 장기 스토리 기억 일관성 붕괴
- **예시 B (간헐 실패):** 특정 세션에서만 회상이 비정상적으로 빈약
  - 결과: 재현 어려운 품질 이슈로 운영팀 대응 시간 증가

#### 운영 영향

- 유지보수성 저하 (스키마-코드 드리프트)
- 성능/비용 간접 악화 (불필요 재생성/재요약)

---

### R4. 암호화 시크릿 fallback 정책 위험

#### 코드 근거

- 비프로덕션에서 시크릿 미설정 시 고정 문자열 사용
  - `apps/game-server/src/config/index.ts:32`

#### 왜 문제인가

`NODE_ENV` 설정 실수(예: staging이 production 아님) 상태에서 고정 시크릿이 사용될 수 있습니다.
보안은 "의도"가 아니라 "실제 런타임 값"으로 깨지므로, 운영 환경 분류가 어긋나면 즉시 취약해집니다.

#### 실생활 예시

- **예시 A (스테이징 공개 접근):** 스테이징이 외부 접근 가능 + 고정 시크릿 사용
  - 결과: 키 암호화 신뢰도 하락, 사고 시 영향 범위 확대
- **예시 B (환경변수 누락 배포):** 배포 파이프라인에서 시크릿 주입 실패
  - 결과: 실패로 멈춰야 할 배포가 "약한 설정"으로 살아남음

#### 운영 영향

- 보안 거버넌스 위반 가능성
- 사고시 포렌식/책임소재 복잡화

---

### R5. 규칙서 삭제 시 S3 오브젝트 누락 삭제

#### 코드 근거

- DB/연결 테이블 삭제 후 S3 삭제 TODO
  - `apps/game-server/src/routes/rulebooks.ts:207`
  - `apps/game-server/src/routes/rulebooks.ts:241`

#### 왜 문제인가

애플리케이션 관점에서는 삭제 완료처럼 보이지만, 실제 파일은 남아 데이터 수명주기 관리가 깨집니다.

#### 실생활 예시

- **예시 A (비용 누적):** 사용자가 규칙서를 자주 교체 -> 스토리지 비용 증가
- **예시 B (컴플라이언스):** 삭제 요청 처리 후 원본이 남아 정책 위반 이슈 발생

#### 운영 영향

- 저장 비용 증가
- 데이터 삭제 정책 미준수 리스크

---

### R6. 웹 계층 `any` 사용으로 계약 안정성 저하 (중요)

#### 코드 근거

- `apps/web/app/(game)/session/[id]/page.tsx:46`
- `apps/web/app/(game)/session/[id]/page.tsx:101`

#### 왜 문제인가

API 응답 스키마가 변해도 컴파일 타임 방어가 약해지고, 런타임에서만 깨질 확률이 올라갑니다.

#### 실생활 예시

- **예시 A (백엔드 필드명 변경):** 프론트가 조용히 잘못 표시하거나 빈 데이터 렌더
- **예시 B (null/undefined 케이스):** 특정 사용자에서만 재현되는 간헐 버그 증가

#### 운영 영향

- 유지보수 비용 증가
- QA 누수 증가

---

## 3) 우선순위 제안

### P0 (즉시)

1. R1 호출 제한: HTTP + Socket 레벨 제한(유저/세션/이벤트)
2. R2 컨텍스트 예산: 시스템 블록 포함한 하드 캡 정책

### P1 (단기)

3. R3 스키마 정합성 수정
4. R4 시크릿 fallback 제거(명시적 dev 플래그 없으면 fail-fast)
5. R5 S3 삭제 로직 및 실패 보상처리

### P2 (중기)

6. R6 프론트 `any` 축소 및 API 계약 타입화

---

## 4) 외부 레퍼런스 (문제 정의/완화 근거)

- OWASP API Security Top 10 2023 - API4 Unrestricted Resource Consumption
  - https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/
- express-rate-limit Usage (Express 공식 생태계)
  - https://express-rate-limit.mintlify.app/quickstart/usage
- Socket.IO FAQ - Prevent flooding from single connection
  - https://socket.io/docs/v3/faq/
- Anthropic Prompt Caching (토큰/지연 최적화)
  - https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching

---

## 5) 메모

- 본 문서는 "실제 운영 리스크" 관점 문서이며, 코드 스타일/사소한 린트 이슈는 의도적으로 제외했습니다.
- 라인 참조는 작성 시점 기준이며, 이후 리팩터링 시 오프셋이 바뀔 수 있습니다.
