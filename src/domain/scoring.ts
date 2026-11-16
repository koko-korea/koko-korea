/**
 * 점수 규칙 (PRD 3.1, 9.1)
 * 내부 단위: 0.5점 = 1 unit. 원문제 정답 2 units, 동형 정답 1 unit.
 * 오답과 시간 초과는 감점 없이 0 unit.
 * 시간 초과 후 정답도 점수는 부여한다(D-05). 시간 보너스는 연출만 있고 점수는 없다(D-06).
 */
export type QuestionType = "original" | "variant";
export type AttemptType = "initial" | "review";

export const UNITS_PER_CORRECT: Record<QuestionType, number> = {
  original: 2,
  variant: 1,
};

export function scoreUnits(questionType: QuestionType, isCorrect: boolean): number {
  return isCorrect ? UNITS_PER_CORRECT[questionType] : 0;
}

/** 화면 표시 점수 = units / 2 */
export function unitsToPoints(units: number): number {
  return units / 2;
}

/** 12 → "6", 25 → "12.5" */
export function formatPoints(units: number): string {
  const points = unitsToPoints(units);
  return Number.isInteger(points) ? String(points) : points.toFixed(1);
}

/** 시간 내 정답일 때만 보너스 연출을 보여준다. */
export function earnsTimeBonus(isCorrect: boolean, isTimeout: boolean): boolean {
  return isCorrect && !isTimeout;
}
