import { describe, expect, it } from "vitest";
import {
  emptyContent,
  normalizeContent,
  validateForPublish,
  type QuizContent,
} from "@/domain/quiz-content";
import { contentToCsv, csvToConcepts, parseCsv } from "@/domain/csv";

function fullContent(): QuizContent {
  const c = emptyContent("테스트 세트");
  c.concepts.forEach((concept, ci) => {
    concept.name = `개념${ci + 1}`;
    concept.questions.forEach((q, qi) => {
      q.body = `문제 ${ci + 1}-${qi + 1}, "따옴표"와 쉼표`;
      q.options = ["가", "나", "다", `라\n줄바꿈`];
      q.answer = (qi % 4) + 1;
      q.explanation = `해설 ${ci + 1}-${qi + 1}`;
    });
  });
  return c;
}

describe("콘텐츠 정규화", () => {
  it("빈 입력도 12×3×4 모양으로 맞춘다", () => {
    const c = normalizeContent(null);
    expect(c.concepts).toHaveLength(12);
    expect(c.concepts.every((x) => x.questions.length === 3)).toBe(true);
    expect(c.concepts[0].questions[0].options).toHaveLength(4);
    expect(c.masteryThreshold).toBe(1);
  });
  it("잘못된 정답 번호와 기준값은 기본값으로", () => {
    const c = normalizeContent({ masteryThreshold: 9, concepts: [{ questions: [{ answer: 7 }] }] });
    expect(c.masteryThreshold).toBe(1);
    expect(c.concepts[0].questions[0].answer).toBeNull();
  });
  it("넘치는 개념은 버린다", () => {
    const c = normalizeContent({ concepts: Array.from({ length: 20 }, () => ({ name: "x" })) });
    expect(c.concepts).toHaveLength(12);
  });
});

describe("공개 전 검증", () => {
  it("빈 세트는 오류가 많다", () => {
    const issues = validateForPublish(emptyContent());
    expect(issues.length).toBeGreaterThan(36);
    expect(issues[0].path).toBe("title");
  });
  it("모두 채우면 오류 없음", () => {
    expect(validateForPublish(fullContent())).toEqual([]);
  });
  it("정답 미선택과 중복 선택지를 찾는다", () => {
    const c = fullContent();
    c.concepts[2].questions[1].answer = null;
    c.concepts[4].questions[0].options = ["가", "가", "다", "라"];
    const paths = validateForPublish(c).map((i) => i.path);
    expect(paths).toContain("concepts.2.questions.1.answer");
    expect(paths).toContain("concepts.4.questions.0.options");
  });
});

describe("CSV", () => {
  it("따옴표·쉼표·줄바꿈·BOM·CRLF를 처리한다", () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n\r\n');
    expect(rows).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"\nthere'],
    ]);
  });

  it("내보낸 CSV를 다시 가져오면 같은 내용", () => {
    const content = fullContent();
    const result = csvToConcepts(parseCsv(contentToCsv(content)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.concepts).toEqual(content.concepts);
  });

  it("행 순서가 섞여 있어도 개념 번호와 유형으로 맞춘다", () => {
    const rows = parseCsv(contentToCsv(fullContent()));
    const [header, ...body] = rows;
    const result = csvToConcepts([header, ...body.reverse()]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.concepts[0].questions[0].body).toContain("문제 1-1");
      // 동형 순서는 파일에 나온 순서를 따른다(뒤집었으므로 1-3이 먼저)
      expect(result.concepts[0].questions[1].body).toContain("문제 1-3");
    }
  });

  it("머리글이 없으면 오류", () => {
    const result = csvToConcepts([["foo", "bar"]]);
    expect(result.ok).toBe(false);
  });

  it("개념 누락·개수 오류·정답 번호 오류를 줄 번호와 함께 알려 준다", () => {
    const rows = parseCsv(contentToCsv(fullContent()));
    rows[2][8] = "5"; // 2번째 데이터 행 정답 번호 오류 → 3번째 줄
    const trimmed = rows.filter((r) => r[0] !== "12"); // 개념 12 제거
    const result = csvToConcepts(trimmed);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.some((e) => e.line === 3 && e.message.includes("correct_option"))).toBe(true);
      expect(result.errors.some((e) => e.message.includes("개념 12"))).toBe(true);
    }
  });

  it("original이 두 개면 오류", () => {
    const rows = parseCsv(contentToCsv(fullContent()));
    rows[2][2] = "original";
    const result = csvToConcepts(rows);
    expect(result.ok).toBe(false);
  });
});
