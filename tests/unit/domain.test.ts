import { describe, expect, it } from "vitest";
import { earnsTimeBonus, formatPoints, scoreUnits, unitsToPoints } from "@/domain/scoring";
import { computeDeadline, isTimedOut, remainingMs, SUBMIT_GRACE_MS } from "@/domain/timer";
import { nextCombo } from "@/domain/combo";
import { applyReviewResult, clampThreshold } from "@/domain/mastery";
import { buildRoundOrder, pickReviewQuestion, roundOf, shuffle } from "@/domain/ordering";
import { rankLeaderboard } from "@/domain/leaderboard";
import { checkNickname } from "@/domain/nickname";

/** 결정적 테스트용 의사 난수 */
function seededRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

describe("점수", () => {
  it("원문제 정답은 1점(2 units)", () => {
    expect(scoreUnits("original", true)).toBe(2);
    expect(unitsToPoints(2)).toBe(1);
  });
  it("동형 문제 정답은 0.5점(1 unit)", () => {
    expect(scoreUnits("variant", true)).toBe(1);
    expect(unitsToPoints(1)).toBe(0.5);
  });
  it("오답은 감점 없이 0점", () => {
    expect(scoreUnits("original", false)).toBe(0);
    expect(scoreUnits("variant", false)).toBe(0);
  });
  it("만점은 24점(원문제 12 + 동형 24×0.5)", () => {
    const units = 12 * scoreUnits("original", true) + 24 * scoreUnits("variant", true);
    expect(formatPoints(units)).toBe("24");
  });
  it("0.5 단위 점수를 표시한다", () => {
    expect(formatPoints(25)).toBe("12.5");
  });
  it("시간 보너스 연출은 시간 내 정답에만", () => {
    expect(earnsTimeBonus(true, false)).toBe(true);
    expect(earnsTimeBonus(true, true)).toBe(false);
    expect(earnsTimeBonus(false, false)).toBe(false);
  });
});

describe("타이머", () => {
  it("마감 시각은 제시 시각 + 제한 시간", () => {
    expect(computeDeadline(1000, 30)).toBe(31000);
  });
  it("마감 전 제출은 시간 초과가 아니다", () => {
    expect(isTimedOut(30000, 31000)).toBe(false);
  });
  it("허용 오차 이내 제출은 시간 초과가 아니다", () => {
    expect(isTimedOut(31000 + SUBMIT_GRACE_MS, 31000)).toBe(false);
  });
  it("마감 이후 제출은 시간 초과", () => {
    expect(isTimedOut(31000 + SUBMIT_GRACE_MS + 1, 31000)).toBe(true);
  });
  it("마감이 없으면(재도전) 시간 초과가 없다", () => {
    expect(isTimedOut(Number.MAX_SAFE_INTEGER, null)).toBe(false);
    expect(remainingMs(0, null)).toBeNull();
  });
  it("남은 시간은 0 아래로 내려가지 않는다", () => {
    expect(remainingMs(50000, 31000)).toBe(0);
  });
});

describe("콤보", () => {
  it("시간 내 정답이면 증가", () => {
    expect(nextCombo(2, true, false)).toBe(3);
  });
  it("오답이면 0으로 초기화", () => {
    expect(nextCombo(5, false, false)).toBe(0);
    expect(nextCombo(5, false, true)).toBe(0);
  });
  it("시간 초과 후 정답이면 유지", () => {
    expect(nextCombo(4, true, true)).toBe(4);
  });
});

describe("극복 완료", () => {
  it("기준 1이면 한 번 맞히면 극복", () => {
    const r = applyReviewResult({ status: "needs_review", streak: 0 }, true, 1);
    expect(r).toEqual({ status: "mastered", streak: 1, newlyMastered: true });
  });
  it("기준 2면 연속 2번 맞혀야 극복", () => {
    const first = applyReviewResult({ status: "needs_review", streak: 0 }, true, 2);
    expect(first.status).toBe("needs_review");
    const second = applyReviewResult(first, true, 2);
    expect(second.newlyMastered).toBe(true);
  });
  it("틀리면 연속 정답이 초기화된다", () => {
    const r = applyReviewResult({ status: "needs_review", streak: 1 }, false, 2);
    expect(r).toEqual({ status: "needs_review", streak: 0, newlyMastered: false });
  });
  it("이미 극복한 개념은 배지를 다시 주지 않고 상태도 잃지 않는다", () => {
    const right = applyReviewResult({ status: "mastered", streak: 1 }, true, 1);
    expect(right.newlyMastered).toBe(false);
    const wrong = applyReviewResult({ status: "mastered", streak: 1 }, false, 1);
    expect(wrong.status).toBe("mastered");
  });
  it("기준값은 1~3으로 제한된다", () => {
    expect(clampThreshold(0)).toBe(1);
    expect(clampThreshold(9)).toBe(3);
    expect(clampThreshold(Number.NaN)).toBe(1);
  });
});

describe("출제 순서", () => {
  const concepts = Array.from({ length: 12 }, (_, i) => ({
    conceptId: `c${i}`,
    originalId: `o${i}`,
    variantIds: [`a${i}`, `b${i}`] as const,
  }));

  it("36문항이 중복 없이 라운드 순서로 나온다", () => {
    const order = buildRoundOrder(concepts, seededRng(7));
    expect(order).toHaveLength(36);
    expect(new Set(order).size).toBe(36);
    expect(order.slice(0, 12).every((id) => id.startsWith("o"))).toBe(true);
    expect(order.slice(12, 24).every((id) => id.startsWith("a"))).toBe(true);
    expect(order.slice(24).every((id) => id.startsWith("b"))).toBe(true);
  });

  it("라운드 번호를 계산한다", () => {
    expect(roundOf(0, 12)).toBe(1);
    expect(roundOf(11, 12)).toBe(1);
    expect(roundOf(12, 12)).toBe(2);
    expect(roundOf(35, 12)).toBe(3);
  });

  it("섞기는 원본을 바꾸지 않고 같은 원소를 유지한다", () => {
    const src = [1, 2, 3, 4, 5];
    const out = shuffle(src, seededRng(3));
    expect(src).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("재도전은 맞힌 문항(다른 문항)을 먼저, 그다음 틀린 문항, 그리고 순환", () => {
    const candidates = [
      { questionId: "o", initiallyCorrect: false },
      { questionId: "a", initiallyCorrect: true },
      { questionId: "b", initiallyCorrect: true },
    ];
    expect(pickReviewQuestion(candidates, 0)).toBe("a");
    expect(pickReviewQuestion(candidates, 1)).toBe("b");
    expect(pickReviewQuestion(candidates, 2)).toBe("o");
    expect(pickReviewQuestion(candidates, 3)).toBe("a");
  });

  it("후보가 없으면 오류", () => {
    expect(() => pickReviewQuestion([], 0)).toThrow();
  });
});

describe("리더보드", () => {
  it("점수 내림차순, 최대 5명", () => {
    const rows = rankLeaderboard(
      [10, 30, 20, 50, 40, 60].map((units, i) => ({
        participationId: `p${i}`,
        nickname: `학생${i}`,
        units,
      })),
    );
    expect(rows.map((r) => r.units)).toEqual([60, 50, 40, 30, 20]);
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
  });
  it("동점은 공동 순위, 닉네임 순으로 표시", () => {
    const rows = rankLeaderboard([
      { participationId: "1", nickname: "다람쥐", units: 20 },
      { participationId: "2", nickname: "가오리", units: 20 },
      { participationId: "3", nickname: "나비", units: 10 },
    ]);
    expect(rows.map((r) => [r.nickname, r.rank])).toEqual([
      ["가오리", 1],
      ["다람쥐", 1],
      ["나비", 3],
    ]);
  });
});

describe("닉네임", () => {
  it("앞뒤 공백을 지우고 허용한다", () => {
    expect(checkNickname("  국어왕 ")).toEqual({ ok: true, value: "국어왕" });
  });
  it("너무 짧거나 길면 거부", () => {
    expect(checkNickname("가").ok).toBe(false);
    expect(checkNickname("가".repeat(13)).ok).toBe(false);
  });
  it("허용하지 않는 문자는 거부", () => {
    expect(checkNickname("<script>").ok).toBe(false);
  });
  it("문자열이 아니면 거부", () => {
    expect(checkNickname(undefined).ok).toBe(false);
  });
});
