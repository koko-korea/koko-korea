/**
 * 타이머 규칙 (PRD 3.2, FR-011)
 * 서버가 문항 제시 시각(served_at)과 마감 시각(deadline_at)을 기록하고,
 * 제출 수신 시각과 deadline_at을 비교해서만 시간 초과를 판정한다.
 */

/** 네트워크 지연을 감안한 허용 오차(ms). 학생에게 불리하지 않도록 아주 짧게 둔다. */
export const SUBMIT_GRACE_MS = 500;

export function computeDeadline(servedAt: number, timeLimitSeconds: number): number {
  return servedAt + timeLimitSeconds * 1000;
}

/** deadlineAt이 null이면(재도전 등) 시간 제한이 없다. */
export function isTimedOut(receivedAt: number, deadlineAt: number | null): boolean {
  if (deadlineAt === null) return false;
  return receivedAt > deadlineAt + SUBMIT_GRACE_MS;
}

export function remainingMs(now: number, deadlineAt: number | null): number | null {
  if (deadlineAt === null) return null;
  return Math.max(0, deadlineAt - now);
}
