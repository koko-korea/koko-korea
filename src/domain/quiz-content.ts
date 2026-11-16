/**
 * 퀴즈 세트 콘텐츠 구조와 공개 전 검증 (FR-001, FR-002)
 * 세트 = 개념 12개, 개념마다 [원문제, 동형1, 동형2], 문항마다 4지선다.
 * 임시저장은 빈칸을 허용하고, 공개할 때만 모두 채워졌는지 검사한다.
 */
export const CONCEPT_COUNT = 12;
export const QUESTIONS_PER_CONCEPT = 3;
export const OPTION_COUNT = 4;
export const TITLE_MAX = 60;
export const TEXT_MAX = 1000;

export interface ContentQuestion {
  body: string;
  options: string[];
  /** 정답 선택지 번호 1~4, 아직 고르지 않았으면 null */
  answer: number | null;
  explanation: string;
}

export interface ContentConcept {
  name: string;
  /** [원문제, 동형1, 동형2] */
  questions: ContentQuestion[];
}

export interface QuizContent {
  title: string;
  masteryThreshold: number;
  concepts: ContentConcept[];
}

export interface ContentIssue {
  /** 예: "concepts.3.questions.1.options.2" — 편집 화면에서 위치를 찾는 데 쓴다 */
  path: string;
  message: string;
}

export const QUESTION_LABELS = ["원문제", "동형 문제 1", "동형 문제 2"] as const;

export function emptyQuestion(): ContentQuestion {
  return { body: "", options: Array.from({ length: OPTION_COUNT }, () => ""), answer: null, explanation: "" };
}

export function emptyConcept(): ContentConcept {
  return { name: "", questions: Array.from({ length: QUESTIONS_PER_CONCEPT }, emptyQuestion) };
}

export function emptyContent(title = ""): QuizContent {
  return { title, masteryThreshold: 1, concepts: Array.from({ length: CONCEPT_COUNT }, emptyConcept) };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");

/**
 * 클라이언트가 보낸 값을 항상 12×3×4 모양으로 맞춘다(모자라면 빈칸, 넘치면 버림).
 * 저장 형식이 깨지지 않게 하기 위한 것으로, 내용 검증은 validateForPublish가 한다.
 */
export function normalizeContent(raw: unknown): QuizContent {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const concepts = Array.isArray(input.concepts) ? input.concepts : [];
  const threshold = Number(input.masteryThreshold);
  return {
    title: str(input.title, TITLE_MAX).trim(),
    masteryThreshold: Number.isInteger(threshold) && threshold >= 1 && threshold <= 3 ? threshold : 1,
    concepts: Array.from({ length: CONCEPT_COUNT }, (_, ci) => {
      const c = (concepts[ci] && typeof concepts[ci] === "object" ? concepts[ci] : {}) as Record<string, unknown>;
      const questions = Array.isArray(c.questions) ? c.questions : [];
      return {
        name: str(c.name, TITLE_MAX).trim(),
        questions: Array.from({ length: QUESTIONS_PER_CONCEPT }, (_, qi) => {
          const q = (questions[qi] && typeof questions[qi] === "object" ? questions[qi] : {}) as Record<
            string,
            unknown
          >;
          const options = Array.isArray(q.options) ? q.options : [];
          const answer = Number(q.answer);
          return {
            body: str(q.body, TEXT_MAX).trim(),
            options: Array.from({ length: OPTION_COUNT }, (_, oi) => str(options[oi], TEXT_MAX).trim()),
            answer: Number.isInteger(answer) && answer >= 1 && answer <= OPTION_COUNT ? answer : null,
            explanation: str(q.explanation, TEXT_MAX).trim(),
          };
        }),
      };
    }),
  };
}

/** 공개 전 검증: 빈칸, 정답 미선택, 중복 선택지를 모두 찾아 위치와 함께 돌려준다. */
export function validateForPublish(content: QuizContent): ContentIssue[] {
  const issues: ContentIssue[] = [];
  if (!content.title) issues.push({ path: "title", message: "세트 제목을 입력해 주세요." });

  content.concepts.forEach((concept, ci) => {
    const where = `개념 ${ci + 1}`;
    if (!concept.name) issues.push({ path: `concepts.${ci}.name`, message: `${where}: 개념 이름이 비어 있어요.` });
    concept.questions.forEach((q, qi) => {
      const base = `concepts.${ci}.questions.${qi}`;
      const label = `${where} ${QUESTION_LABELS[qi]}`;
      if (!q.body) issues.push({ path: `${base}.body`, message: `${label}: 문제가 비어 있어요.` });
      q.options.forEach((o, oi) => {
        if (!o) issues.push({ path: `${base}.options.${oi}`, message: `${label}: 선택지 ${oi + 1}이(가) 비어 있어요.` });
      });
      const filled = q.options.filter(Boolean);
      if (new Set(filled).size !== filled.length) {
        issues.push({ path: `${base}.options`, message: `${label}: 같은 선택지가 두 번 있어요.` });
      }
      if (q.answer === null) issues.push({ path: `${base}.answer`, message: `${label}: 정답을 골라 주세요.` });
      if (!q.explanation) issues.push({ path: `${base}.explanation`, message: `${label}: 해설이 비어 있어요.` });
    });
  });
  return issues;
}
