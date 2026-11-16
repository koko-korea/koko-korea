import type { BankItem, Rng } from "../src/engine/types";

const mc = (q: string, concept: string): BankItem => ({
  cat: "자음 체계",
  type: "mc",
  q,
  o: ["정답", "오답1", "오답2", "오답3", "오답4"],
  a: 0,
  e: `${q} 해설`,
  concept,
  t: { type: "mc", q: `${q} (동형)`, o: ["오답A", "정답", "오답B", "오답C", "오답D"], a: 1, e: "동형 해설" },
});

const sa = (q: string, accepted: string[]): BankItem => ({
  cat: "창제 원리",
  type: "sa",
  q,
  a: accepted,
  e: `${q} 해설`,
  concept: accepted[0]!,
  t: { type: "sa", q: `${q} (동형)`, a: ["이체"], e: "동형 해설" },
});

export const BANK: BankItem[] = [
  mc("비음으로만 묶인 것은?", "비음"),
  sa("획을 더하는 원리는?", ["가획", "가획의 원리"]),
  mc("원순 모음은?", "원순 모음"),
  mc("파찰음은?", "파찰음"),
  sa("아래아의 모양은?", ["ㆍ", "아래아"]),
];

/** 항상 같은 값을 내는 난수 — 0이면 섞기에서 매번 0번과 자리를 바꾼다 */
export const fixedRng =
  (value = 0): Rng =>
  () =>
    value;

/** 시드가 있는 결정적 난수 (mulberry32) */
export function seededRng(seed: number): Rng {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
