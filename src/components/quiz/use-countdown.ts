"use client";

import { useEffect, useState } from "react";

/**
 * 서버가 정한 마감 시각까지 남은 시간(ms).
 * 서버 시각과 기기 시각의 차이(offset)를 보정해 표시만 한다. 실제 판정은 서버가 한다.
 */
export function useCountdown(deadlineAt: number | null, clockOffsetMs: number): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadlineAt === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [deadlineAt]);

  if (deadlineAt === null) return null;
  return Math.max(0, deadlineAt - (now + clockOffsetMs));
}
