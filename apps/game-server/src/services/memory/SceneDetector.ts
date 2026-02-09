// 장면 전환 감지기
// GM 응답의 sceneTransition, 상태 변경, 전투 종료, 메시지 수를 분석하여 장면 전환 감지

import type { SceneDetectionResult, SceneTransition, StateChangeInfo } from './types';

// 장면 전환 감지 파라미터
export interface SceneDetectParams {
  sceneTransition?: SceneTransition;
  stateChanges?: StateChangeInfo[];
  combatEnded?: boolean;
  messageCount: number;
  messageThreshold?: number;
}

// 기본 메시지 임계값
const DEFAULT_MESSAGE_THRESHOLD = 40;

export class SceneDetector {
  // 장면 전환 감지 (우선순위: scene_transition > location_change > combat_end > message_threshold)
  detect(params: SceneDetectParams): SceneDetectionResult {
    const { sceneTransition, stateChanges, combatEnded, messageCount, messageThreshold } = params;
    const threshold = messageThreshold ?? DEFAULT_MESSAGE_THRESHOLD;

    // 1. GM이 명시적으로 장면 전환을 선언한 경우
    if (sceneTransition && (sceneTransition.newLocation || sceneTransition.timeAdvance || sceneTransition.mood)) {
      return {
        detected: true,
        trigger: 'scene_transition',
        metadata: { sceneTransition },
      };
    }

    // 2. 상태 변경에 location_change가 포함된 경우
    if (stateChanges && stateChanges.some((c) => c.type === 'location_change')) {
      const locationChange = stateChanges.find((c) => c.type === 'location_change');
      return {
        detected: true,
        trigger: 'location_change',
        metadata: { locationChange },
      };
    }

    // 3. 전투 종료
    if (combatEnded) {
      return {
        detected: true,
        trigger: 'combat_end',
        metadata: { combatEnded: true },
      };
    }

    // 4. 메시지 임계값 초과
    if (messageCount >= threshold) {
      return {
        detected: true,
        trigger: 'message_threshold',
        metadata: { messageCount, threshold },
      };
    }

    // 아무것도 감지되지 않음
    return { detected: false };
  }
}
