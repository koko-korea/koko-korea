/**
 * 출제 순서 규칙 (PRD 3.3, 3.4, D-11, D-18)
 */

/** 0 이상 1 미만의 난수를 돌려주는 함수. 테스트에서 고정값을 넣을 수 있게 주입받는다. */
export type Rng = () => number;

/** Fisher–Yates. 원본 배열은 바꾸지 않는다. */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface ConceptQuestions {
  conceptId: string;
  originalId: string;
  /** 동형 문제 2개, display_order 순 */
  variantIds: readonly [string, string];
}

/**
 * 라운드 방식 출제 순서.
 * 1라운드: 원문제 12개, 2라운드: 첫 번째 동형 12개, 3라운드: 두 번째 동형 12개.
 * 라운드마다 개념 순서를 따로 섞는다.
 */
export function buildRoundOrder(concepts: readonly ConceptQuestions[], rng: Rng): string[] {
  const round1 = shuffle(concepts, rng).map((c) => c.originalId);
  const round2 = shuffle(concepts, rng).map((c) => c.variantIds[0]);
  const round3 = shuffle(concepts, rng).map((c) => c.variantIds[1]);
  return [...round1, ...round2, ...round3];
}

/** 0부터 시작하는 문항 위치를 1~3 라운드 번호로 바꾼다. */
export function roundOf(index: number, conceptCount: number): number {
  return Math.floor(index / conceptCount) + 1;
}

export interface ReviewCandidate {
  questionId: string;
  /** 최초 풀이에서 맞혔는지 */
  initiallyCorrect: boolean;
}

/**
 * 재도전 문항 선택.
 * ① 최초 풀이 때 맞힌 문항(틀린 문항과 다른 문항으로 이해 확인) → ② 틀린 문항 → ③ 순환.
 * reviewCount(지금까지 이 개념에서 재도전한 횟수)로 순환하므로 문항이 2개 이상이면
 * 연속해서 같은 문항이 나오지 않는다.
 */
export function pickReviewQuestion(
  candidates: readonly ReviewCandidate[],
  reviewCount: number,
): string {
  if (candidates.length === 0) {
    throw new Error("재도전할 문항이 없습니다.");
  }
  const ordered = [
    ...candidates.filter((c) => c.initiallyCorrect),
    ...candidates.filter((c) => !c.initiallyCorrect),
  ];
  return ordered[reviewCount % ordered.length].questionId;
}
