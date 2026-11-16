// 출제·채점·점수·풀이 시간 (PRD 3.3, 4장, v1.1)
import { gradeShortAnswer } from "./grading";
import type { BankItem, QuestionBody, Rng } from "./types";

export const TIME_LIMIT_MS = 60_000;
export const POINTS_FIRST_TRY = 1;
export const POINTS_TWIN = 0.5;

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export interface BankLimits {
  mc: number;
  sa: number;
}

export function bankLimits(bank: readonly BankItem[]): BankLimits {
  return {
    mc: bank.filter((item) => item.type === "mc").length,
    sa: bank.filter((item) => item.type === "sa").length,
  };
}

/**
 * 선다형 mc개 + 단답형 sa개를 무작위로 뽑아 섞은 문제 은행 번호 목록.
 * 요청 수가 은행보다 많으면 있는 만큼만 뽑는다.
 */
export function drawQuestions(
  bank: readonly BankItem[],
  counts: BankLimits,
  rng: Rng,
): number[] {
  const indexesOf = (type: "mc" | "sa") =>
    bank.flatMap((item, index) => (item.type === type ? [index] : []));
  const mc = shuffle(indexesOf("mc"), rng).slice(0, Math.max(0, counts.mc));
  const sa = shuffle(indexesOf("sa"), rng).slice(0, Math.max(0, counts.sa));
  return shuffle([...mc, ...sa], rng);
}

export type Stage = "main" | "twin";

/** 화면에 내보낼 현재 문제. 선다형 보기는 `optionOrder` 순서로 보여 준다. */
export interface Presented {
  /** 이번 퀴즈에서 몇 번째 문제인지 (0부터) */
  position: number;
  bankIndex: number;
  stage: Stage;
  body: QuestionBody;
  /** 화면의 i번째 보기 = body.o[optionOrder[i]] (단답형은 빈 배열) */
  optionOrder: number[];
}

/** 선다형은 화면 보기 번호(0부터), 단답형은 입력 글자, 시간 초과는 null */
export type Answer = number | string | null;

export type Outcome = "first" | "twin" | "wrong";

export interface SubmitResult {
  correct: boolean;
  timedOut: boolean;
  stage: Stage;
  /** 화면에 보여 줄 정답 (선다형은 보기 글자, 단답형은 첫 번째 인정 답) */
  correctAnswer: string;
  /** 다음 단계: 동형 문제 / 다음 문제 / 끝 */
  next: "twin" | "next" | "finished";
}

export interface AnswerRecord {
  bankIndex: number;
  stage: Stage;
  answer: Answer;
  correct: boolean;
  timedOut: boolean;
  elapsedMs: number;
}

export interface QuizResult {
  score: number;
  maxScore: number;
  /** 풀이 시간 합 (ms) — 문제 표시~제출, 해설 읽는 시간 제외 */
  elapsedMs: number;
  /** 문제 순서대로의 결과 */
  outcomes: { bankIndex: number; outcome: Outcome }[];
  /** 교사 전송용 [문제 은행 번호, 한 번에 맞혔는지] */
  stats: [number, boolean][];
  records: AnswerRecord[];
}

function correctAnswerText(body: QuestionBody): string {
  return body.type === "mc" ? (body.o[body.a] ?? "") : (body.a[0] ?? "");
}

/**
 * 한 학생의 퀴즈 진행.
 * 흐름: show(now) → submit(answer, now) → (오답이면 동형 문제) show → submit → … → result()
 * 풀이 시간은 show~submit 사이만 잰다. submit 뒤 해설을 읽다 다음 show를 부르기까지는 세지 않는다.
 */
export class QuizRun {
  private position = 0;
  private stage: Stage = "main";
  private optionOrder: number[] = [];
  private shownAt: number | null = null;
  private finished = false;
  private readonly outcomes: { bankIndex: number; outcome: Outcome }[] = [];
  private readonly records: AnswerRecord[] = [];

  constructor(
    private readonly bank: readonly BankItem[],
    private readonly order: readonly number[],
    private readonly rng: Rng,
  ) {
    if (order.length === 0) throw new Error("출제할 문제가 없어요.");
    for (const index of order) {
      if (!bank[index]) throw new Error(`문제 은행에 없는 번호예요: ${index}`);
    }
    this.prepareStage();
  }

  get total(): number {
    return this.order.length;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  /** 현재 문제. 끝났으면 null */
  current(): Presented | null {
    if (this.finished) return null;
    return {
      position: this.position,
      bankIndex: this.bankIndex(),
      stage: this.stage,
      body: this.body(),
      optionOrder: this.optionOrder.slice(),
    };
  }

  /** 문제가 화면에 나온 시각을 기록한다. 이미 나와 있으면 처음 시각을 유지한다. */
  show(now: number): void {
    if (this.finished) throw new Error("퀴즈가 이미 끝났어요.");
    if (this.shownAt === null) this.shownAt = now;
  }

  /** 남은 시간 (ms). 아직 보여 주지 않았으면 제한 시간 전체 */
  remainingMs(now: number): number {
    if (this.shownAt === null) return TIME_LIMIT_MS;
    return Math.max(0, TIME_LIMIT_MS - (now - this.shownAt));
  }

  submit(answer: Answer, now: number): SubmitResult {
    if (this.finished) throw new Error("퀴즈가 이미 끝났어요.");
    if (this.shownAt === null) throw new Error("문제를 보여 준 뒤에 제출할 수 있어요.");

    const spent = Math.max(0, now - this.shownAt);
    const timedOut = answer === null || spent >= TIME_LIMIT_MS;
    const elapsedMs = Math.min(spent, TIME_LIMIT_MS);
    const body = this.body();
    const correct = !timedOut && this.grade(body, answer);
    const stage = this.stage;

    this.records.push({ bankIndex: this.bankIndex(), stage, answer, correct, timedOut, elapsedMs });

    let next: SubmitResult["next"];
    if (stage === "main" && !correct) {
      this.stage = "twin";
      this.prepareStage();
      next = "twin";
    } else {
      const outcome: Outcome = correct ? (stage === "main" ? "first" : "twin") : "wrong";
      this.outcomes.push({ bankIndex: this.bankIndex(), outcome });
      this.position += 1;
      if (this.position >= this.order.length) {
        this.finished = true;
        next = "finished";
      } else {
        this.stage = "main";
        this.prepareStage();
        next = "next";
      }
    }

    return { correct, timedOut, stage, correctAnswer: correctAnswerText(body), next };
  }

  result(): QuizResult {
    if (!this.finished) throw new Error("퀴즈가 아직 끝나지 않았어요.");
    const score = this.outcomes.reduce(
      (sum, { outcome }) =>
        sum + (outcome === "first" ? POINTS_FIRST_TRY : outcome === "twin" ? POINTS_TWIN : 0),
      0,
    );
    return {
      score,
      maxScore: this.order.length * POINTS_FIRST_TRY,
      elapsedMs: this.records.reduce((sum, record) => sum + record.elapsedMs, 0),
      outcomes: this.outcomes.slice(),
      stats: this.outcomes.map(({ bankIndex, outcome }) => [bankIndex, outcome === "first"]),
      records: this.records.slice(),
    };
  }

  private bankIndex(): number {
    return this.order[this.position]!;
  }

  private body(): QuestionBody {
    const item = this.bank[this.bankIndex()]!;
    return this.stage === "main" ? item : item.t;
  }

  private prepareStage(): void {
    const body = this.body();
    this.optionOrder = body.type === "mc" ? shuffle(body.o.map((_, i) => i), this.rng) : [];
    this.shownAt = null;
  }

  private grade(body: QuestionBody, answer: Answer): boolean {
    if (body.type === "mc") {
      if (typeof answer !== "number") return false;
      return this.optionOrder[answer] === body.a;
    }
    return typeof answer === "string" && gradeShortAnswer(answer, body.a);
  }
}
