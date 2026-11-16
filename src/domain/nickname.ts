/**
 * 닉네임 규칙 (FR-003): 2~12자, 한글·영문·숫자·공백·_·- 만 허용.
 */
export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;

const ALLOWED = /^[가-힣ㄱ-ㅎㅏ-ㅣA-Za-z0-9 _-]+$/;

export type NicknameCheck = { ok: true; value: string } | { ok: false; message: string };

export function normalizeNickname(raw: string): string {
  return raw.normalize("NFC").trim().replace(/\s+/g, " ");
}

export function checkNickname(raw: unknown): NicknameCheck {
  if (typeof raw !== "string") return { ok: false, message: "닉네임을 입력해 주세요." };
  const value = normalizeNickname(raw);
  const length = [...value].length;
  if (length < NICKNAME_MIN || length > NICKNAME_MAX) {
    return { ok: false, message: `닉네임은 ${NICKNAME_MIN}~${NICKNAME_MAX}자로 입력해 주세요.` };
  }
  if (!ALLOWED.test(value)) {
    return { ok: false, message: "한글, 영문, 숫자, 공백, _, - 만 쓸 수 있어요." };
  }
  return { ok: true, value };
}
