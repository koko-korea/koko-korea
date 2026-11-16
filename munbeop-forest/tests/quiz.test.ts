import { describe, expect, it } from "vitest";
import { QuizRun, TIME_LIMIT_MS, bankLimits, drawQuestions, shuffle } from "../src/engine/quiz";
import { BANK, fixedRng, seededRng } from "./fixtures";

/** 화면 보기 중 정답 위치 */
function correctOption(run: QuizRun): number {
  const cur = run.current()!;
  if (cur.body.type !== "mc") throw new Error("선다형이 아님");
  const answer = cur.body.a;
  return cur.optionOrder.findIndex((original) => original === answer);
}

function wrongOption(run: QuizRun): number {
  return (correctOption(run) + 1) % 5;
}

describe("출제 (수용 기준 2)", () => {
  it("선다형 N개 + 단답형 M개를 뽑는다", () => {
    const order = drawQuestions(BANK, { mc: 2, sa: 1 }, seededRng(1));
    expect(order).toHaveLength(3);
    expect(new Set(order).size).toBe(3);
    expect(order.filter((i) => BANK[i]!.type === "mc")).toHaveLength(2);
    expect(order.filter((i) => BANK[i]!.type === "sa")).toHaveLength(1);
  });

  it("은행보다 많이 요청하면 있는 만큼만", () => {
    expect(drawQuestions(BANK, { mc: 99, sa: 99 }, seededRng(2))).toHaveLength(5);
    expect(bankLimits(BANK)).toEqual({ mc: 3, sa: 2 });
  });

  it("시드가 다르면 순서가 달라질 수 있다 (무작위)", () => {
    const orders = new Set(
      [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => drawQuestions(BANK, { mc: 3, sa: 2 }, seededRng(seed)).join(",")),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("선다형 보기 순서를 섞고, 섞인 화면 번호로 채점한다", () => {
    const run = new QuizRun(BANK, [0], seededRng(3));
    const order = run.current()!.optionOrder;
    expect([...order].sort()).toEqual([0, 1, 2, 3, 4]);
    run.show(0);
    expect(run.submit(correctOption(run), 1000).correct).toBe(true);
  });

  it("shuffle은 원본을 바꾸지 않는다", () => {
    const src = [1, 2, 3];
    shuffle(src, fixedRng(0));
    expect(src).toEqual([1, 2, 3]);
  });
});

describe("점수 (수용 기준 4)", () => {
  it("한 번에 정답 1점, 동형 정답 0.5점, 동형 오답 0점", () => {
    const run = new QuizRun(BANK, [0, 2, 3], seededRng(4));
    // 1번: 한 번에 정답
    run.show(0);
    expect(run.submit(correctOption(run), 1_000)).toMatchObject({ correct: true, next: "next" });
    // 2번: 오답 → 동형 정답
    run.show(10_000);
    expect(run.submit(wrongOption(run), 12_000)).toMatchObject({ correct: false, next: "twin", correctAnswer: "정답" });
    expect(run.current()!.stage).toBe("twin");
    run.show(20_000);
    expect(run.submit(correctOption(run), 23_000)).toMatchObject({ correct: true, stage: "twin", next: "next" });
    // 3번: 오답 → 동형 오답
    run.show(30_000);
    run.submit(wrongOption(run), 31_000);
    run.show(40_000);
    expect(run.submit(wrongOption(run), 41_000).next).toBe("finished");

    const result = run.result();
    expect(result.score).toBe(1.5);
    expect(result.maxScore).toBe(3);
    expect(result.outcomes.map((o) => o.outcome)).toEqual(["first", "twin", "wrong"]);
    expect(result.stats).toEqual([
      [0, true],
      [2, false],
      [3, false],
    ]);
  });

  it("단답형은 인정 답 목록으로 채점", () => {
    const run = new QuizRun(BANK, [1], fixedRng(0));
    run.show(0);
    expect(run.submit("가획의 원리입니다.", 5_000).correct).toBe(true);
    expect(run.result().score).toBe(1);
  });
});

describe("시간 (수용 기준 3, v1.1 풀이 시간 정의)", () => {
  it("null 제출은 시간 초과 → 오답 처리 후 동형 문제", () => {
    const run = new QuizRun(BANK, [0], fixedRng(0));
    run.show(0);
    const res = run.submit(null, TIME_LIMIT_MS);
    expect(res).toMatchObject({ correct: false, timedOut: true, next: "twin" });
  });

  it("1분이 지난 뒤 정답을 내도 시간 초과", () => {
    const run = new QuizRun(BANK, [0], fixedRng(0));
    run.show(0);
    expect(run.submit(correctOption(run), TIME_LIMIT_MS + 5).timedOut).toBe(true);
  });

  it("해설 읽는 시간(제출~다음 표시)은 풀이 시간에 넣지 않는다", () => {
    const run = new QuizRun(BANK, [0, 2], seededRng(5));
    run.show(0);
    run.submit(wrongOption(run), 8_000); // 8초
    // 해설을 100초 동안 읽음
    run.show(108_000);
    run.submit(correctOption(run), 111_000); // 동형 3초
    run.show(500_000);
    run.submit(correctOption(run), 504_000); // 4초
    expect(run.result().elapsedMs).toBe(15_000);
  });

  it("문제 하나의 시간은 최대 60초로 센다", () => {
    const run = new QuizRun(BANK, [0], fixedRng(0));
    run.show(0);
    run.submit(null, 90_000);
    run.show(100_000);
    run.submit(null, 400_000);
    expect(run.result().elapsedMs).toBe(2 * TIME_LIMIT_MS);
  });

  it("show를 여러 번 불러도 처음 시각을 유지 (다시 그려도 시간이 늘지 않음)", () => {
    const run = new QuizRun(BANK, [0], fixedRng(0));
    run.show(0);
    run.show(30_000);
    expect(run.remainingMs(40_000)).toBe(20_000);
  });

  it("보여 주기 전에는 제출할 수 없다", () => {
    const run = new QuizRun(BANK, [0], fixedRng(0));
    expect(() => run.submit(0, 0)).toThrow();
  });
});

describe("진행 상태", () => {
  it("끝나기 전 result()는 오류, 끝난 뒤 current()는 null", () => {
    const run = new QuizRun(BANK, [1], fixedRng(0));
    expect(() => run.result()).toThrow();
    run.show(0);
    run.submit("가획", 1);
    expect(run.isFinished).toBe(true);
    expect(run.current()).toBeNull();
  });

  it("없는 문제 번호나 빈 목록은 거부", () => {
    expect(() => new QuizRun(BANK, [], fixedRng(0))).toThrow();
    expect(() => new QuizRun(BANK, [99], fixedRng(0))).toThrow();
  });
});
