import "server-only";
import { AppError } from "./errors";

/** 라우트 핸들러 공통 처리: AppError는 상태 코드와 사용자 메시지로, 그 외 오류는 500으로 바꾼다. */
export async function handle(fn: () => Promise<unknown> | unknown): Promise<Response> {
  try {
    const data = await fn();
    return Response.json(data ?? { ok: true });
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    // 학생 답안 등 개인 데이터를 로그에 남기지 않도록 오류 이름과 메시지만 기록한다.
    console.error("[api] unexpected error:", error instanceof Error ? error.message : "unknown");
    return Response.json(
      { error: { code: "INTERNAL", message: "잠시 문제가 생겼어요. 다시 시도해 주세요." } },
      { status: 500 },
    );
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  } catch {
    throw new AppError(400, "BAD_JSON", "잘못된 요청입니다.");
  }
}
