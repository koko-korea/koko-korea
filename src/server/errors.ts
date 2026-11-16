/** 사용자에게 보여줄 메시지와 HTTP 상태를 함께 가진 오류 (PRD 8. API 공통 규칙) */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (message = "찾을 수 없습니다.") => new AppError(404, "NOT_FOUND", message);
export const badRequest = (message: string, code = "BAD_REQUEST") => new AppError(400, code, message);
export const conflict = (message: string, code = "CONFLICT") => new AppError(409, code, message);
