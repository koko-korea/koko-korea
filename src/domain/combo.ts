/**
 * 콤보 규칙 (PRD 9.4, D-07)
 * - 시간 내 정답: +1
 * - 시간 초과 후 정답: 유지 (시간 초과는 콤보에 영향 없음)
 * - 오답(시간 내/초과 무관): 0으로 초기화
 */
export function nextCombo(prev: number, isCorrect: boolean, isTimeout: boolean): number {
  if (!isCorrect) return 0;
  if (isTimeout) return prev;
  return prev + 1;
}
