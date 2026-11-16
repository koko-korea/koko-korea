import "server-only";
import { cookies } from "next/headers";
import { AppError } from "./errors";
import { TEACHER_SESSION_MS, verifyTeacherToken } from "./teacher-auth";

const COOKIE = "koko_teacher";

export async function setTeacherCookie(token: string) {
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TEACHER_SESSION_MS / 1000,
  });
}

export async function readTeacherToken(): Promise<string | undefined> {
  return (await cookies()).get(COOKIE)?.value;
}

export async function clearTeacherCookie() {
  (await cookies()).delete(COOKIE);
}

/**
 * 교사 API 보호: 세션 확인 + 데이터를 바꾸는 요청은 같은 사이트에서 온 것인지(Origin) 확인한다.
 */
export async function requireTeacher(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    if (origin && host && new URL(origin).host !== host) {
      throw new AppError(403, "BAD_ORIGIN", "허용되지 않은 요청이에요.");
    }
  }
  if (!verifyTeacherToken(await readTeacherToken())) {
    throw new AppError(401, "TEACHER_LOGIN_REQUIRED", "교사 로그인이 필요해요.");
  }
}
