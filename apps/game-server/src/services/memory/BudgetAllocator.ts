// 컨텍스트 예산 할당기
// 액션 유형(BudgetProfile)에 따라 각 메모리 계층의 토큰 예산을 결정

import type { BudgetProfile, ContextBudget } from './types';

// 프로파일별 예산 설정 (토큰 단위)
const BUDGET_PROFILES: Record<BudgetProfile, ContextBudget> = {
  combat: {
    tier0: 25000, // 시스템 프롬프트, 캐릭터 시트, 전투 상태
    tier1: 30000, // 최근 전투 로그
    tier2: 15000, // 장면 요약
    tier3: 5000,  // 세션 요약
    total: 75000,
  },
  exploration: {
    tier0: 20000, // 시스템 프롬프트, 캐릭터 시트
    tier1: 35000, // 최근 대화/행동
    tier2: 15000, // 장면 요약
    tier3: 10000, // 세션 요약 (탐색은 과거 정보 중요)
    total: 80000,
  },
  roleplay: {
    tier0: 15000, // 시스템 프롬프트, 캐릭터 시트
    tier1: 40000, // 최근 대화 (롤플레이는 대화 맥락 중요)
    tier2: 15000, // 장면 요약
    tier3: 10000, // 세션 요약
    total: 80000,
  },
  skill_check: {
    tier0: 25000, // 시스템 프롬프트, 캐릭터 시트, 규칙
    tier1: 25000, // 최근 맥락
    tier2: 10000, // 장면 요약
    tier3: 5000,  // 세션 요약
    total: 65000,
  },
};

export class BudgetAllocator {
  // 프로파일에 따른 예산 할당
  allocate(profile: BudgetProfile): ContextBudget {
    return { ...BUDGET_PROFILES[profile] };
  }

  // 텍스트의 토큰 수 추정 (한/영 평균 3자/토큰)
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 3);
  }
}
