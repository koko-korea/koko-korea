import "server-only";
import { cookies } from "next/headers";
import { AppError } from "./errors";
import { findParticipationByToken, type ParticipationRow } from "./quiz-service";

/**
 * 학생 세션: 로그인 없이 퀴즈 세트별 참여 토큰을 HttpOnly 쿠키에 보관한다.
 * 브라우저 스크립트는 토큰을 읽을 수 없고, 서버는 토큰의 해시만 저장한다.
 */
const COOKIE_PREFIX = "koko_p_";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function cookieName(setId: string) {
  return `${COOKIE_PREFIX}${setId}`;
}

export async function setParticipationCookie(setId: string, token: string) {
  const store = await cookies();
  store.set(cookieName(setId), token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function currentParticipation(setId: string): Promise<ParticipationRow | null> {
  const store = await cookies();
  return findParticipationByToken(setId, store.get(cookieName(setId))?.value);
}

export async function requireParticipation(setId: string): Promise<ParticipationRow> {
  const p = await currentParticipation(setId);
  if (!p) throw new AppError(401, "NO_PARTICIPATION", "참여 정보가 없어요. 참여 코드로 다시 들어와 주세요.");
  return p;
}
