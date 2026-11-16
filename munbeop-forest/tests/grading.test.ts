import { describe, expect, it } from "vitest";
import { gradeShortAnswer, normalizeAnswer } from "../src/engine/grading";

describe("normalizeAnswer", () => {
  it("공백·따옴표·마침표·괄호를 지운다", () => {
    expect(normalizeAnswer(" ‘합용 병서’. ")).toBe("합용병서");
    expect(normalizeAnswer("(비음)")).toBe("비음");
  });

  it("끝의 ‘이다/입니다/이에요/예요’를 지운다", () => {
    expect(normalizeAnswer("가획입니다.")).toBe("가획");
    expect(normalizeAnswer("비음이에요")).toBe("비음");
    expect(normalizeAnswer("상형이다")).toBe("상형");
  });

  it("NFD로 들어온 한글을 NFC로 맞춘다", () => {
    expect(normalizeAnswer("가획".normalize("NFD"))).toBe("가획");
  });
});

describe("gradeShortAnswer — 인정 답 목록과 일치할 때만 정답 (v1.1)", () => {
  const accepted = ["가획", "가획의 원리"];

  it("인정 답과 표기만 다르면 정답", () => {
    expect(gradeShortAnswer("가획", accepted)).toBe(true);
    expect(gradeShortAnswer("가획의원리입니다.", accepted)).toBe(true);
    expect(gradeShortAnswer("“가획”", accepted)).toBe(true);
  });

  it("목록에 없는 표현은 정답으로 추측하지 않는다", () => {
    expect(gradeShortAnswer("가획 원리", accepted)).toBe(false);
    expect(gradeShortAnswer("가획법", accepted)).toBe(false);
  });

  it("빈 답은 오답", () => {
    expect(gradeShortAnswer("  ", accepted)).toBe(false);
    expect(gradeShortAnswer(".", accepted)).toBe(false);
  });

  it("옛한글 정답은 이름으로도 인정할 수 있다", () => {
    expect(gradeShortAnswer("아래아", ["ㆍ", "아래아"])).toBe(true);
    expect(gradeShortAnswer("ㆍ", ["ㆍ", "아래아"])).toBe(true);
  });
});
