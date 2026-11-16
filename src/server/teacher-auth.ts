import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import { clock } from "./clock";
import { AppError } from "./errors";

/**
 * 교사 인증 (D-01, 로컬 개발 단계): 환경 변수 TEACHER_PASSWORD 하나로 로그인한다.
 * 로그인하면 무작위 세션 토큰을 HttpOnly 쿠키로 주고, 서버에는 토큰 해시와 만료 시각만 저장한다.
 */
export const TEACHER_SESSION_MS = 12 * 60 * 60 * 1000;

const sha256 = (value: string) => createHash("sha256").update(value).digest();

export function teacherPasswordConfigured(): boolean {
  return Boolean(process.env.TEACHER_PASSWORD);
}

export function loginTeacher(password: unknown): string {
  const expected = process.env.TEACHER_PASSWORD;
  if (!expected) {
    throw new AppError(
      503,
      "TEACHER_PASSWORD_MISSING",
      "교사 비밀번호가 설정되지 않았어요. .env.local에 TEACHER_PASSWORD를 넣고 서버를 다시 시작해 주세요.",
    );
  }
  // 길이가 달라도 같은 시간이 걸리도록 해시끼리 비교한다.
  const ok = typeof password === "string" && timingSafeEqual(sha256(password), sha256(expected));
  if (!ok) throw new AppError(401, "WRONG_PASSWORD", "비밀번호가 맞지 않아요.");

  const db = getDb();
  const now = clock.now();
  db.prepare("DELETE FROM teacher_sessions WHERE expires_at <= ?").run(now);
  const token = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO teacher_sessions (token_hash, created_at, expires_at) VALUES (?, ?, ?)").run(
    sha256(token).toString("hex"),
    now,
    now + TEACHER_SESSION_MS,
  );
  return token;
}

export function verifyTeacherToken(token: string | undefined): boolean {
  if (!token) return false;
  const row = getDb()
    .prepare("SELECT expires_at FROM teacher_sessions WHERE token_hash = ?")
    .get(sha256(token).toString("hex")) as { expires_at: number } | undefined;
  return Boolean(row && row.expires_at > clock.now());
}

export function logoutTeacher(token: string | undefined) {
  if (!token) return;
  getDb().prepare("DELETE FROM teacher_sessions WHERE token_hash = ?").run(sha256(token).toString("hex"));
}
