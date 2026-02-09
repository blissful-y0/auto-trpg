# AI TRPG 게임 마스터 자동화 서비스 - 구현 계획서

> 이 문서는 실제 구현 순서와 태스크 단위로 정리된 실행 계획입니다.
> 검토 후 수정/승인 부탁드립니다.

---

## Phase 1: 기반 구축 (MVP Alpha) — v0.1.0-alpha

### 목표
1인 플레이어가 AI GM과 대화하며 업로드한 규칙서를 참조하는 기본 게임 루프 검증

### Task 1.1: 모노레포 초기화
**브랜치**: `feature/phase1-monorepo-setup`
**예상 결과물**:
- [x] Turborepo + pnpm workspace 설정
- [x] TypeScript 기본 설정 (tsconfig base)
- [x] ESLint + Prettier 설정
- [x] docker-compose.yml (Supabase, Redis)
- [x] 디렉토리 스캐폴딩 (apps/, packages/, functions/, supabase/, infrastructure/)
- [x] Git 초기화 + .gitignore
- [x] .env.example

### Task 1.2: 공유 패키지
**브랜치**: `feature/phase1-shared-packages`
**의존성**: Task 1.1
**예상 결과물**:
- [ ] `packages/shared-types/` — 전체 도메인 타입 정의
  - GameSession, Character, Message, GameEvent, RulebookChunk 등
  - LLM 프로바이더 타입, Socket 이벤트 타입
- [ ] `packages/utils/` — 공통 유틸리티
  - 토큰 카운터, ID 생성기, 날짜 포맷터
- [ ] `packages/ui/` — 공유 UI 컴포넌트 기본 구조

### Task 1.3: 데이터베이스 스키마
**브랜치**: `feature/phase1-db-schema`
**의존성**: Task 1.1
**예상 결과물**:
- [ ] Supabase 마이그레이션 파일들:
  - `001_profiles.sql` — 사용자 프로필
  - `002_rulebooks.sql` — 규칙서 + 청크 + 임베딩
  - `003_game_sessions.sql` — 세션, 참가자, 캐릭터
  - `004_messages_events.sql` — 메시지, 이벤트 로그
  - `005_context_tables.sql` — 장면/세션 요약, 스냅샷
  - `006_user_api_keys.sql` — BYOK API 키 (암호화)
- [ ] RLS (Row Level Security) 정책
- [ ] pgvector 확장 + 인덱스 (IVFFlat, GIN)

### Task 1.4: 인증 시스템
**브랜치**: `feature/phase1-auth`
**의존성**: Task 1.2, 1.3
**예상 결과물**:
- [ ] Supabase Auth 클라이언트 설정
- [ ] Next.js 미들웨어 (인증 체크)
- [ ] 로그인/회원가입 페이지 (이메일 + OAuth)
- [ ] 프로필 페이지 기본

### Task 1.5: LLM 프로바이더 추상화 + BYOK
**브랜치**: `feature/phase1-llm-provider`
**의존성**: Task 1.2, 1.3
**예상 결과물**:
- [ ] `LLMProvider` 인터페이스 (generateText, generateStream, countTokens)
- [ ] `ClaudeProvider` 구현체
- [ ] `OpenAIProvider` 구현체
- [ ] `GeminiProvider` 구현체
- [ ] `LLMRouter` — 작업별 모델 라우팅
- [ ] `KeyManager` — AES-256-GCM 암호화/복호화
- [ ] API 키 등록/검증/삭제 API 엔드포인트
- [ ] 테스트: 각 프로바이더 mock 테스트, 암호화 라운드트립 테스트

### Task 1.6: 게임 서버 기본 구조
**브랜치**: `feature/phase1-game-server-base`
**의존성**: Task 1.2
**예상 결과물**:
- [ ] Express 서버 + 미들웨어 (CORS, 인증, 에러 핸들링)
- [ ] REST API 라우트:
  - `POST /api/sessions` — 세션 생성
  - `GET /api/sessions/:id` — 세션 조회
  - `POST /api/sessions/:id/characters` — 캐릭터 생성
  - `POST /api/rulebooks/upload` — 규칙서 업로드 (S3 presigned URL)
  - `GET /api/rulebooks` — 규칙서 목록
- [ ] 환경 설정 (config)
- [ ] 헬스체크 엔드포인트

### Task 1.7: RAG 파이프라인
**브랜치**: `feature/phase1-rag-pipeline`
**의존성**: Task 1.3, 1.5
**예상 결과물**:
- [ ] 규칙서 업로드 → S3 저장 플로우
- [ ] 텍스트 추출 (Python Lambda 또는 로컬 스크립트)
  - PyMuPDF로 디지털 PDF 처리
- [ ] 시맨틱 청커 (256-512 토큰, 구조 경계 존중)
- [ ] 임베딩 생성 (OpenAI text-embedding-3-small)
- [ ] pgvector 저장 + 검색 함수
- [ ] 하이브리드 검색 (벡터 + tsvector)
- [ ] 검색 API 엔드포인트
- [ ] 테스트: 청킹 단위 테스트, 검색 정확도 테스트

### Task 1.8: 게임 엔진 v1
**브랜치**: `feature/phase1-game-engine-v1`
**의존성**: Task 1.5, 1.6
**예상 결과물**:
- [ ] `GameEngine` — 게임 루프 코디네이터
  - 액션 수신 → 분류 → LLM 호출 → 상태 변경 → 응답
- [ ] `DiceEngine` — 주사위 시스템
  - d4, d6, d8, d10, d12, d20, d100
  - 수정치(modifier) 적용
  - 유리/불리 (advantage/disadvantage)
- [ ] LLM 구조화 출력 (Tool Use) 스키마 정의
  - GM 응답: narrative + stateChanges + diceRolls + rulesApplied
- [ ] 테스트: DiceEngine 유닛, GameEngine 통합 (mock LLM)

### Task 1.9: 컨텍스트 매니저 v1
**브랜치**: `feature/phase1-context-manager-v1`
**의존성**: Task 1.5, 1.7
**예상 결과물**:
- [ ] `ContextManager` v1:
  - 시스템 프롬프트 (GM 페르소나 + 지시사항)
  - RAG로 검색된 규칙 삽입
  - 캐릭터 시트 삽입
  - 최근 10-20개 메시지 (슬라이딩 윈도우)
- [ ] 토큰 카운팅 + 예산 체크
- [ ] 프롬프트 조립 함수
- [ ] 테스트: 프롬프트 조립 + 토큰 예산 검증

### Task 1.10: Next.js 프론트엔드 기본
**브랜치**: `feature/phase1-web-ui`
**의존성**: Task 1.2, 1.4
**예상 결과물**:
- [ ] Next.js 15 App Router 설정
- [ ] Tailwind CSS + 다크모드 기본
- [ ] 레이아웃 (사이드바 + 메인 콘텐츠)
- [ ] 페이지:
  - 대시보드 (세션 목록)
  - 세션 생성 페이지
  - 게임 세션 페이지 (채팅 UI)
  - 캐릭터 생성 폼
  - 규칙서 관리 (업로드 + 목록)
  - 설정 (API 키 관리)
- [ ] 컴포넌트:
  - ChatPanel (메시지 표시 + 입력)
  - CharacterSheet (스탯 표시)
  - DiceRoller (주사위 UI)
- [ ] Zustand 스토어:
  - gameStore (세션 상태)
  - chatStore (메시지)
  - userStore (인증 상태)
- [ ] HTTP 클라이언트 (fetch wrapper)

---

## Phase 2: 컨텍스트 관리 + 멀티플레이어 (MVP Beta) — v0.2.0-beta

### 목표
완전한 계층적 메모리 시스템, 4인 멀티플레이어, 수시간 세션 유지

### Task 2.1: 메모리 계층 시스템
**브랜치**: `feature/phase2-memory-hierarchy`
**의존성**: Phase 1 완료
**예상 결과물**:
- [ ] `MemoryHierarchy` — Tier 0/1/2/3 관리
- [ ] `BudgetAllocator` — 상황별 토큰 예산 프로파일
  - 전투/탐험/롤플레이/스킬체크별 동적 할당
- [ ] `Summarizer` — LLM 기반 요약 생성
  - 장면 요약 (Tier 1→2): 10:1 압축
  - 세션 요약 (Tier 2→3): 200-400 단어
  - 저비용 모델 사용 (Haiku/Flash/4o-mini)
- [ ] `StateTracker` — 게임 상태 변경 추적 + 스냅샷
- [ ] 장면 전환 감지 로직
- [ ] 메모리 검색 (RAG + 임베딩)
- [ ] 테스트: 예산 할당, 요약 품질, 상태 일관성

### Task 2.2: GM 개입 판단 시스템
**브랜치**: `feature/phase2-intervention-system`
**의존성**: Phase 1 완료
**예상 결과물**:
- [ ] `InterventionRules` — 1단계 규칙 기반 사전 필터
  - 즉시 개입 (bypass): @GM, 전투 턴, 주사위, NPC 언급
  - 즉시 패스 (no intervention): OOC, PC간 대화, 이모트
- [ ] `InterventionClassifier` — 2단계 LLM 분류기
  - shouldIntervene, reason, urgency, interventionType
  - 저비용 모델 (Haiku/Flash)
- [ ] urgency 기반 개입 타이밍 조절
- [ ] GM 적극성 레벨 설정 (소극적/보통/적극적)
- [ ] 테스트: 규칙 필터 100% 유닛, 분류기 시나리오 테스트

### Task 2.3: Socket.io 멀티플레이어
**브랜치**: `feature/phase2-socket-multiplayer`
**의존성**: Phase 1 완료
**예상 결과물**:
- [ ] Socket.io 서버 설정 + 인증 미들웨어
- [ ] 방 관리 (최대 4 플레이어 + GM + 옵저버)
- [ ] 이벤트 핸들러:
  - `player:action` — 플레이어 액션
  - `gm:response` — GM 응답 (스트리밍)
  - `game:stateUpdate` — 상태 변경 브로드캐스트
  - `player:join/leave` — 참가/퇴장
  - `dice:roll` — 주사위 결과
- [ ] 턴 기반 액션 큐
- [ ] 재연결 처리 (상태 복원)
- [ ] Socket.io 클라이언트 (Next.js)
- [ ] Redis Pub/Sub 연동

### Task 2.4: Redis 실시간 상태
**브랜치**: `feature/phase2-redis-state`
**의존성**: Task 2.3
**예상 결과물**:
- [ ] Redis 키 패턴 구현:
  - `trpg:session:{id}:state`
  - `trpg:session:{id}:combat`
  - `trpg:session:{id}:characters`
  - `trpg:session:{id}:queue`
- [ ] Redis ↔ Supabase 주기적 영속화 (5분)
- [ ] 세션 시작 시 Redis 로드, 종료 시 flush
- [ ] TTL 관리 (비활성 세션 자동 정리)

### Task 2.5: 전투 시스템
**브랜치**: `feature/phase2-combat-system`
**의존성**: Task 2.1, 2.3
**예상 결과물**:
- [ ] `CombatManager`:
  - 이니셔티브 롤 + 순서 관리
  - 턴 진행 (타이머 옵션)
  - 공격/피해 계산
  - 상태이상 (conditions) 추적
  - 전투 종료 판정
- [ ] LLM 전투 프롬프트 (전투 규칙 + 상태)
- [ ] `CombatTracker` UI 컴포넌트
- [ ] 캐릭터 시트 실시간 업데이트

---

## Phase 3: 고도화 + 고급 기능 (Beta) — v0.3.0-beta

### Task 3.1: RAG 고도화
- [ ] 리랭킹 (cross-encoder 또는 LLM 기반)
- [ ] 규칙 체이닝 (관련 규칙 사전 로드)
- [ ] 핫 캐시 (자주 사용 규칙)
- [ ] 카테고리 사전 분류 (COMBAT, MAGIC, SKILLS 등)
- [ ] OCR 지원 (스캔 PDF)

### Task 3.2: 고급 UI
- [ ] NarrativeLog (이야기 타임라인)
- [ ] 주사위 애니메이션
- [ ] 다크모드 완성
- [ ] 반응형 디자인 (모바일)
- [ ] 낙관적 업데이트
- [ ] 에러 처리 UI

### Task 3.3: 세이브/로드 + 캠페인
- [ ] 세이브: 전체 상태 스냅샷 (Redis → Supabase)
- [ ] 자동 저장 (5분 간격)
- [ ] 로드: 스냅샷 → Redis → 클라이언트 복원
- [ ] 세션 일시정지/재개
- [ ] 멀티 세션 캠페인 (세션 간 상태 이어가기)
- [ ] 캠페인 대시보드

---

## Phase 4: 프로덕션 강화 — v1.0.0

### Task 4.1: AWS 인프라
- [ ] CDK 스택 (ECS Fargate, Lambda, CloudFront, ALB)
- [ ] CI/CD 파이프라인 (GitHub Actions)
- [ ] 환경 분리 (staging / production)

### Task 4.2: 보안 강화
- [ ] RLS 정책 전수 검토
- [ ] 프롬프트 인젝션 방어
- [ ] 레이트 리미팅
- [ ] API 키 rotation

### Task 4.3: 모니터링
- [ ] CloudWatch 대시보드
- [ ] Sentry 에러 트래킹
- [ ] LLM 비용 추적 대시보드
- [ ] 토큰 사용량 모니터링

### Task 4.4: 최종 마무리
- [ ] 랜딩 페이지
- [ ] 부하 테스트 (k6)
- [ ] 성능 최적화
- [ ] 문서화

---

## 의존성 그래프 (Phase 1)

```
Task 1.1 (모노레포)
  ├── Task 1.2 (공유 패키지)
  │     ├── Task 1.4 (인증) ← Task 1.3
  │     ├── Task 1.5 (LLM) ← Task 1.3
  │     ├── Task 1.6 (서버)
  │     └── Task 1.10 (프론트엔드) ← Task 1.4
  ├── Task 1.3 (DB 스키마)
  │     ├── Task 1.4 (인증)
  │     ├── Task 1.5 (LLM)
  │     └── Task 1.7 (RAG) ← Task 1.5
  └── ...
       Task 1.8 (게임엔진) ← Task 1.5, 1.6
       Task 1.9 (컨텍스트) ← Task 1.5, 1.7

통합: Task 1.8 + 1.9 + 1.10 → Phase 1 완료
```

---

## 검증 체크리스트

### Phase 1 완료 검증
- [ ] D&D 5e SRD PDF 업로드 성공
- [ ] 업로드한 규칙서 청킹 + 임베딩 완료
- [ ] 캐릭터 생성 (이름, 종족, 클래스, 스탯)
- [ ] AI GM과 5턴 이상 대화
- [ ] GM 응답에서 규칙서 참조 확인 (rulesApplied 필드)
- [ ] 주사위 굴림 동작
- [ ] 세션 생성/조회 API 동작

### Phase 2 완료 검증
- [ ] 4개 브라우저 동시 접속 + 같은 세션 참여
- [ ] 플레이어 간 메시지 실시간 전달
- [ ] 전투 이니셔티브 + 턴 진행
- [ ] 50턴 후 GM이 초반 사건 기억
- [ ] 장면 요약 생성 확인
- [ ] GM 개입/비개입 적절성 (OOC 무시, NPC 즉시 응답)

### Phase 3 완료 검증
- [ ] 세이브 후 서버 재시작 → 로드 → 상태 일치
- [ ] 캠페인 (세션 2개 이상 연결)
- [ ] 다크모드 + 모바일 반응형

### Phase 4 완료 검증
- [ ] k6: 10세션 × 4명 동시 부하
- [ ] Sentry 에러 트래킹 동작
- [ ] LLM 비용 대시보드 표시
