/**
 * 개념 극복 규칙 (FR-031, D-08)
 * 재도전에서 mastery_threshold만큼 연속으로 맞히면 '극복 완료'.
 * 이미 극복한 개념은 다시 틀려도 극복 상태를 잃지 않으며 배지는 한 번만 지급한다.
 */
export type MasteryStatus = "needs_review" | "mastered";

export interface MasteryState {
  status: MasteryStatus;
  streak: number;
}

export interface MasteryUpdate extends MasteryState {
  newlyMastered: boolean;
}

export const MIN_THRESHOLD = 1;
export const MAX_THRESHOLD = 3;

export function clampThreshold(value: number): number {
  if (!Number.isFinite(value)) return MIN_THRESHOLD;
  return Math.min(MAX_THRESHOLD, Math.max(MIN_THRESHOLD, Math.round(value)));
}

export function applyReviewResult(
  state: MasteryState,
  isCorrect: boolean,
  threshold: number,
): MasteryUpdate {
  const streak = isCorrect ? state.streak + 1 : 0;
  if (state.status === "mastered") {
    return { status: "mastered", streak, newlyMastered: false };
  }
  const reached = streak >= clampThreshold(threshold);
  return {
    status: reached ? "mastered" : "needs_review",
    streak,
    newlyMastered: reached,
  };
}
