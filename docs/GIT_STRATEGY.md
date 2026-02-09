# Git 전략 (Branching & Workflow)

## 1. 브랜치 전략: Git Flow (Simplified)

```
main (production)
 └── develop (integration)
      ├── feature/phase1-monorepo-setup
      ├── feature/phase1-db-schema
      ├── feature/phase1-llm-provider
      ├── feature/phase1-rag-pipeline
      ├── feature/phase1-game-engine
      ├── feature/phase1-web-ui
      ├── feature/phase2-context-manager
      ├── feature/phase2-multiplayer
      ├── ...
      ├── fix/bug-description
      ├── hotfix/critical-fix
      └── release/v0.1.0
```

### 브랜치 규칙

| 브랜치 | 용도 | 보호 | 머지 방법 |
|--------|------|------|----------|
| `main` | 프로덕션 릴리즈 | protected, require PR + review | squash merge from `release/*` |
| `develop` | 통합/개발 | protected, require PR | merge commit from `feature/*` |
| `feature/*` | 기능 개발 | - | PR to `develop` |
| `fix/*` | 버그 수정 | - | PR to `develop` |
| `hotfix/*` | 긴급 프로덕션 수정 | - | PR to `main` + cherry-pick to `develop` |
| `release/*` | 릴리즈 준비 | - | PR to `main` + back-merge to `develop` |

### 브랜치 네이밍 컨벤션

```
feature/phase{N}-{short-description}
fix/{issue-number}-{short-description}
hotfix/{issue-number}-{short-description}
release/v{major}.{minor}.{patch}
```

예시:
- `feature/phase1-monorepo-setup`
- `feature/phase1-llm-provider-abstraction`
- `feature/phase2-context-manager`
- `fix/42-websocket-reconnect`
- `release/v0.1.0`

---

## 2. 커밋 컨벤션: Conventional Commits

### 포맷

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### 타입

| 타입 | 설명 | 예시 |
|------|------|------|
| `feat` | 새 기능 | `feat(game-engine): add dice rolling system` |
| `fix` | 버그 수정 | `fix(socket): handle reconnection timeout` |
| `docs` | 문서 변경 | `docs: add git strategy document` |
| `style` | 포맷팅 (코드 동작 변경 없음) | `style(web): fix eslint warnings` |
| `refactor` | 리팩토링 | `refactor(context): extract budget allocator` |
| `perf` | 성능 개선 | `perf(rag): add vector search caching` |
| `test` | 테스트 추가/수정 | `test(dice): add critical hit test cases` |
| `chore` | 빌드/도구 변경 | `chore: update turborepo config` |
| `ci` | CI/CD 변경 | `ci: add github actions workflow` |
| `build` | 빌드 시스템 변경 | `build: add docker-compose for local dev` |

### 스코프

| 스코프 | 대상 |
|--------|------|
| `web` | Next.js 프론트엔드 |
| `game-server` | Express + Socket.io 백엔드 |
| `shared-types` | 공유 타입 패키지 |
| `ui` | 공유 UI 컴포넌트 |
| `context` | 컨텍스트 관리 시스템 |
| `llm` | LLM 프로바이더 |
| `rag` | RAG 파이프라인 |
| `game-engine` | 게임 엔진 |
| `socket` | WebSocket 관련 |
| `db` | 데이터베이스/마이그레이션 |
| `infra` | AWS 인프라 |
| `lambda` | Lambda 함수 |

---

## 3. PR (Pull Request) 전략

### PR 템플릿

```markdown
## 변경 사항
<!-- 무엇이 변경되었는지 -->

## 관련 Phase / Task
<!-- Phase 1, Task: monorepo setup 등 -->

## 테스트
- [ ] 유닛 테스트 통과
- [ ] 통합 테스트 통과 (해당 시)
- [ ] 수동 테스트 완료

## 체크리스트
- [ ] 타입 에러 없음
- [ ] 린트 통과
- [ ] 빌드 성공
- [ ] 기존 기능 영향 없음
```

### PR 규칙
- `develop`으로의 PR: 최소 1명 리뷰 승인
- `main`으로의 PR: 최소 2명 리뷰 승인
- CI 통과 필수 (lint + type-check + test)
- feature 브랜치는 머지 후 삭제

---

## 4. 태그 & 릴리즈 전략

### 시맨틱 버저닝 (SemVer)

```
v{MAJOR}.{MINOR}.{PATCH}

MAJOR: 호환성 깨지는 변경
MINOR: 하위 호환 기능 추가
PATCH: 하위 호환 버그 수정
```

### 릴리즈 계획

| 버전 | Phase | 마일스톤 |
|------|-------|---------|
| `v0.1.0-alpha` | Phase 1 완료 | 1인 플레이, 규칙서 업로드, AI GM 기본 대화 |
| `v0.2.0-beta` | Phase 2 완료 | 4인 멀티플레이어, 컨텍스트 관리, 전투 시스템 |
| `v0.3.0-beta` | Phase 3 완료 | RAG 고도화, 세이브/로드, 고급 UI |
| `v1.0.0` | Phase 4 완료 | 프로덕션 배포 |

---

## 5. Phase별 Feature 브랜치 계획

### Phase 1 (기반 구축)
```
feature/phase1-monorepo-setup          # Turborepo + pnpm + 기본 설정
feature/phase1-shared-packages         # shared-types, ui, utils 패키지
feature/phase1-db-schema               # Supabase 스키마 + 마이그레이션
feature/phase1-auth                    # Supabase Auth 연동
feature/phase1-llm-provider            # LLM 프로바이더 추상화 + BYOK
feature/phase1-game-server-base        # Express + 기본 API
feature/phase1-rag-pipeline            # PDF 처리 + 임베딩 + 검색
feature/phase1-game-engine-v1          # GameEngine + DiceEngine
feature/phase1-web-chat-ui             # Next.js 채팅 UI + 캐릭터 생성
feature/phase1-context-manager-v1      # ContextManager v1 (기본)
```

### Phase 2 (컨텍스트 + 멀티플레이어)
```
feature/phase2-memory-hierarchy        # Tier 0-3 메모리 계층
feature/phase2-intervention-system     # GM 개입 판단 시스템
feature/phase2-socket-multiplayer      # Socket.io + 방 관리
feature/phase2-redis-state             # Redis 실시간 상태
feature/phase2-combat-system           # 전투 매니저 + 이니셔티브
feature/phase2-combat-ui               # 전투 UI + 캐릭터 시트
```

### Phase 3 (고도화)
```
feature/phase3-rag-advanced            # 리랭킹, 규칙 체이닝, 핫 캐시
feature/phase3-advanced-ui             # NarrativeLog, 다크모드, 애니메이션
feature/phase3-save-load               # 세이브/로드 + 캠페인
```

### Phase 4 (프로덕션)
```
feature/phase4-aws-infra               # CDK, ECS, CloudFront
feature/phase4-cicd                    # CI/CD 파이프라인
feature/phase4-security                # 보안 강화 + RLS
feature/phase4-monitoring              # 모니터링 + 로깅
```

---

## 6. CI/CD 파이프라인 (GitHub Actions)

### PR 검증 워크플로우
```yaml
on: pull_request
jobs:
  - lint (turbo run lint)
  - type-check (turbo run type-check)
  - test (turbo run test)
  - build (turbo run build)
```

### 배포 워크플로우
```yaml
on:
  push:
    branches: [main]
jobs:
  - build & test
  - deploy to staging (develop merge)
  - deploy to production (main merge, manual approval)
```

---

## 7. .gitignore 전략

핵심 제외 항목:
- `node_modules/`, `.turbo/`, `dist/`, `.next/`
- `.env`, `.env.local`, `.env.*.local` (환경 변수)
- `*.pem`, `*.key` (인증서/키)
- `.vscode/settings.json` (개인 IDE 설정)
- `supabase/.temp/` (로컬 Supabase 임시 파일)
