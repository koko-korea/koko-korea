// PRD 3.2 문제 은행 데이터 형식

export type Category =
  | "음운"
  | "모음 체계"
  | "자음 체계"
  | "창제 정신"
  | "창제 원리"
  | "말소리와 문자";

interface BodyBase {
  /** 문제 */
  q: string;
  /** 해설 */
  e: string;
  /** 문제에 붙는 표 (선택) */
  tbl?: string[][];
}

/** 5지 선다형 */
export interface McBody extends BodyBase {
  type: "mc";
  /** 보기 5개 */
  o: string[];
  /** 정답 보기 번호 (0부터) */
  a: number;
}

/** 단답형 — `a`는 인정 답 목록 (PRD v1.1 3.3) */
export interface SaBody extends BodyBase {
  type: "sa";
  a: string[];
}

export type QuestionBody = McBody | SaBody;

/** 원래 문제 + 동형 문제(`t`) 한 쌍. 동형 문제는 원래 문제와 같은 유형이다. */
export type BankItem = QuestionBody & {
  cat: Category;
  /** 정답 칭찬 대사에 쓰는 핵심 개념 */
  concept: string;
  t: QuestionBody;
};

/** 0 이상 1 미만의 난수를 돌려주는 함수 (테스트에서 고정값을 넣기 위해 주입) */
export type Rng = () => number;
