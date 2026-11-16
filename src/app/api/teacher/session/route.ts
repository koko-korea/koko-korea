import { handle, readJson } from "@/server/http";
import { AppError } from "@/server/errors";
import { allowRequest, clientKey } from "@/server/rate-limit";
import { loginTeacher, logoutTeacher, teacherPasswordConfigured, verifyTeacherToken } from "@/server/teacher-auth";
import { clearTeacherCookie, readTeacherToken, setTeacherCookie } from "@/server/teacher-session";

/** 로그인 여부 확인 */
export async function GET() {
  return handle(async () => ({
    loggedIn: verifyTeacherToken(await readTeacherToken()),
    passwordConfigured: teacherPasswordConfigured(),
  }));
}

/** 로그인 (비밀번호 추측을 막기 위해 IP당 1분 10회 제한) */
export async function POST(request: Request) {
  return handle(async () => {
    if (!allowRequest(`teacher-login:${clientKey(request)}`, 10, 60_000)) {
      throw new AppError(429, "RATE_LIMITED", "로그인 시도가 너무 많아요. 1분 뒤 다시 시도해 주세요.");
    }
    const body = await readJson(request);
    const token = loginTeacher(body.password);
    await setTeacherCookie(token);
    return { loggedIn: true };
  });
}

/** 로그아웃 */
export async function DELETE() {
  return handle(async () => {
    logoutTeacher(await readTeacherToken());
    await clearTeacherCookie();
    return { loggedIn: false };
  });
}
