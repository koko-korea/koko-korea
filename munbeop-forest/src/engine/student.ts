// 학번·이름 검사 (PRD 화면 2)

export type Sex = "m" | "f";

export interface StudentId {
  grade: number;
  classNo: number;
  number: number;
}

/** "2101" → 2학년 1반 1번. 형식이 틀리면 null */
export function parseStudentId(sid: string): StudentId | null {
  const match = /^([1-3])([1-9])(\d{2})$/.exec(sid);
  if (!match) return null;
  const number = Number(match[3]);
  if (number === 0) return null;
  return { grade: Number(match[1]), classNo: Number(match[2]), number };
}

export function describeStudentId(sid: string): string | null {
  const parsed = parseStudentId(sid);
  return parsed ? `${parsed.grade}학년 ${parsed.classNo}반 ${parsed.number}번` : null;
}

/** 이름: 한글 2~5자 */
export function isValidName(name: string): boolean {
  return /^[가-힣]{2,5}$/.test(name.normalize("NFC"));
}
