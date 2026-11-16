// 단답형 채점 (PRD v1.1 3.3)
// 정답 판정은 문항의 인정 답 목록과의 일치로만 한다. 정규화는 표기 차이만 지운다.

const PUNCTUATION = /["'“”‘’「」『』.,!?·()[\]{}〈〉<>]/g;
const WHITESPACE = /\s+/g;
const TRAILING_ENDING = /(이다|입니다|이에요|예요)$/;

export function normalizeAnswer(raw: string): string {
  const compact = raw.normalize("NFC").replace(WHITESPACE, "").replace(PUNCTUATION, "");
  return compact.replace(TRAILING_ENDING, "");
}

export function gradeShortAnswer(input: string, accepted: readonly string[]): boolean {
  const given = normalizeAnswer(input);
  if (given === "") return false;
  return accepted.some((answer) => normalizeAnswer(answer) === given);
}
