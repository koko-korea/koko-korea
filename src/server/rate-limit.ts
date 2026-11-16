import "server-only";

/**
 * 간단한 메모리 기반 요청 제한 (FR-003, 10.4).
 * 서버 한 대 기준이며, 여러 대로 배포할 때는 공용 저장소 기반으로 바꾼다.
 */
const buckets = new Map<string, number[]>();

export function allowRequest(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);
  return true;
}

export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}
