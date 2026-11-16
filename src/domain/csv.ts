/**
 * 문항 CSV 가져오기·내보내기 (FR-004)
 * 열: concept_order, concept_name, question_type(original|variant), body,
 *     option_1, option_2, option_3, option_4, correct_option(1~4), explanation
 * 한 개념에 original 1행 + variant 2행. 동형 문제는 파일에 나온 순서대로 동형1, 동형2가 된다.
 */
import {
  CONCEPT_COUNT,
  OPTION_COUNT,
  emptyContent,
  type ContentQuestion,
  type QuizContent,
} from "./quiz-content";

export const CSV_HEADER = [
  "concept_order",
  "concept_name",
  "question_type",
  "body",
  "option_1",
  "option_2",
  "option_3",
  "option_4",
  "correct_option",
  "explanation",
] as const;

export interface CsvRowError {
  /** 파일의 줄 번호(머리글 = 1행) */
  line: number;
  message: string;
}

export type CsvImportResult =
  | { ok: true; concepts: QuizContent["concepts"] }
  | { ok: false; errors: CsvRowError[] };

/** RFC 4180 방식 CSV 해석: 큰따옴표, 따옴표 안 쉼표·줄바꿈, "" 이스케이프, BOM, CRLF를 처리한다. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // 완전히 빈 줄은 버린다.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/** 편집 중인 콘텐츠를 CSV로 내보낸다(엑셀에서 한글이 깨지지 않도록 BOM 포함). */
export function contentToCsv(content: QuizContent): string {
  const lines = [CSV_HEADER.join(",")];
  content.concepts.forEach((concept, ci) => {
    concept.questions.forEach((q, qi) => {
      lines.push(
        [
          String(ci + 1),
          concept.name,
          qi === 0 ? "original" : "variant",
          q.body,
          ...Array.from({ length: OPTION_COUNT }, (_, oi) => q.options[oi] ?? ""),
          q.answer === null ? "" : String(q.answer),
          q.explanation,
        ]
          .map(csvEscape)
          .join(","),
      );
    });
  });
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/**
 * CSV 표를 12개념 × 3문항 구조로 바꾼다. 오류가 하나라도 있으면 아무것도 적용하지 않도록
 * 모든 오류를 줄 번호와 함께 돌려준다.
 */
export function csvToConcepts(rows: string[][]): CsvImportResult {
  const errors: CsvRowError[] = [];
  if (rows.length === 0) return { ok: false, errors: [{ line: 1, message: "파일이 비어 있어요." }] };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = CSV_HEADER.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    return { ok: false, errors: [{ line: 1, message: `머리글에 없는 열: ${missing.join(", ")}` }] };
  }
  const col = (name: (typeof CSV_HEADER)[number]) => header.indexOf(name);

  const groups = new Map<number, { name: string; original: ContentQuestion[]; variants: ContentQuestion[]; line: number }>();

  rows.slice(1).forEach((cells, i) => {
    const line = i + 2;
    const get = (name: (typeof CSV_HEADER)[number]) => (cells[col(name)] ?? "").trim();
    const order = Number(get("concept_order"));
    if (!Number.isInteger(order) || order < 1 || order > CONCEPT_COUNT) {
      errors.push({ line, message: `concept_order는 1~${CONCEPT_COUNT} 사이 숫자여야 해요.` });
      return;
    }
    const type = get("question_type").toLowerCase();
    if (type !== "original" && type !== "variant") {
      errors.push({ line, message: "question_type은 original 또는 variant여야 해요." });
      return;
    }
    const answerText = get("correct_option");
    const answer = Number(answerText);
    if (!Number.isInteger(answer) || answer < 1 || answer > OPTION_COUNT) {
      errors.push({ line, message: `correct_option은 1~${OPTION_COUNT} 사이 숫자여야 해요.` });
    }
    const question: ContentQuestion = {
      body: get("body"),
      options: [get("option_1"), get("option_2"), get("option_3"), get("option_4")],
      answer: Number.isInteger(answer) && answer >= 1 && answer <= OPTION_COUNT ? answer : null,
      explanation: get("explanation"),
    };
    if (!question.body) errors.push({ line, message: "body(문제)가 비어 있어요." });
    question.options.forEach((o, oi) => {
      if (!o) errors.push({ line, message: `option_${oi + 1}이(가) 비어 있어요.` });
    });
    if (!question.explanation) errors.push({ line, message: "explanation(해설)이 비어 있어요." });

    const name = get("concept_name");
    const group = groups.get(order) ?? { name, original: [], variants: [], line };
    if (!group.name && name) group.name = name;
    if (name && group.name && name !== group.name) {
      errors.push({ line, message: `개념 ${order}의 이름이 앞 줄('${group.name}')과 달라요.` });
    }
    (type === "original" ? group.original : group.variants).push(question);
    groups.set(order, group);
  });

  for (let order = 1; order <= CONCEPT_COUNT; order++) {
    const g = groups.get(order);
    if (!g) {
      errors.push({ line: 1, message: `개념 ${order}의 문항이 없어요.` });
      continue;
    }
    if (!g.name) errors.push({ line: g.line, message: `개념 ${order}의 concept_name이 비어 있어요.` });
    if (g.original.length !== 1) {
      errors.push({ line: g.line, message: `개념 ${order}: original은 1개여야 해요(지금 ${g.original.length}개).` });
    }
    if (g.variants.length !== 2) {
      errors.push({ line: g.line, message: `개념 ${order}: variant는 2개여야 해요(지금 ${g.variants.length}개).` });
    }
  }

  if (errors.length > 0) return { ok: false, errors: errors.sort((a, b) => a.line - b.line) };

  const concepts = emptyContent().concepts.map((_, ci) => {
    const g = groups.get(ci + 1)!;
    return { name: g.name, questions: [g.original[0], g.variants[0], g.variants[1]] };
  });
  return { ok: true, concepts };
}
