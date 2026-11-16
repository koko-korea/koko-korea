import "server-only";
import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDb, transaction } from "./db";
import { clock } from "./clock";
import { badRequest, conflict, notFound } from "./errors";
import { getLeaderboard } from "./quiz-service";
import {
  emptyContent,
  normalizeContent,
  validateForPublish,
  TITLE_MAX,
  type QuizContent,
} from "@/domain/quiz-content";
import type {
  ConceptAccuracy,
  QuizStatus,
  TeacherAnalytics,
  TeacherQuizDetail,
  TeacherQuizSummary,
} from "@/lib/api-types";

/**
 * 교사 기능 (FR-001~004, FR-040~043).
 * 로컬 개발 단계는 교사 한 명(D-01)이므로 모든 세트가 그 교사 소유다.
 * 여러 교사를 지원할 때 quiz_sets.teacher_id와 소유권 검사를 이 파일에 추가한다.
 */

interface SetRow {
  id: string;
  title: string;
  status: QuizStatus;
  join_code: string;
  is_sample: number;
  time_limit_seconds: number;
  mastery_threshold: number;
  updated_at: number;
}

function getSet(db: DatabaseSync, id: string): SetRow {
  const row = db.prepare("SELECT * FROM quiz_sets WHERE id = ?").get(id) as SetRow | undefined;
  if (!row) throw notFound("퀴즈 세트를 찾을 수 없어요.");
  return row;
}

function participantCount(db: DatabaseSync, setId: string): number {
  return (db.prepare("SELECT COUNT(*) AS n FROM participations WHERE quiz_set_id = ?").get(setId) as { n: number }).n;
}

const rate = (correct: number, total: number) => (total === 0 ? null : Math.round((correct / total) * 1000) / 10);

// ───────────────────────── 목록·생성 ─────────────────────────

export function listQuizSets(): TeacherQuizSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT s.*, COUNT(p.id) AS participants, SUM(CASE WHEN p.status = 'submitted' THEN 1 ELSE 0 END) AS submitted
       FROM quiz_sets s LEFT JOIN participations p ON p.quiz_set_id = s.id
       GROUP BY s.id ORDER BY s.updated_at DESC`,
    )
    .all() as unknown as (SetRow & { participants: number; submitted: number | null })[];
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    status: r.status,
    joinCode: r.join_code,
    isSample: r.is_sample === 1,
    participantCount: r.participants,
    submittedCount: r.submitted ?? 0,
    updatedAt: r.updated_at,
  }));
}

/** 헷갈리는 글자(0/O, 1/I/L)를 뺀 6자리 참여 코드 */
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function newJoinCode(db: DatabaseSync): string {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    if (!db.prepare("SELECT 1 FROM quiz_sets WHERE join_code = ?").get(code)) return code;
  }
  throw new Error("참여 코드를 만들지 못했어요.");
}

export function createQuizSet(rawTitle: unknown): string {
  const title = (typeof rawTitle === "string" ? rawTitle.trim() : "").slice(0, TITLE_MAX) || "새 퀴즈 세트";
  return transaction((db) => {
    const id = randomUUID();
    const now = clock.now();
    db.prepare(
      `INSERT INTO quiz_sets (id, title, status, time_limit_seconds, mastery_threshold, join_code, is_sample, created_at, updated_at)
       VALUES (?, ?, 'draft', 30, 1, ?, 0, ?, ?)`,
    ).run(id, title, newJoinCode(db), now, now);
    writeContent(db, id, emptyContent(title));
    return id;
  });
}

// ───────────────────────── 편집 ─────────────────────────

function readContent(db: DatabaseSync, set: SetRow): QuizContent {
  const content = emptyContent(set.title);
  content.masteryThreshold = set.mastery_threshold;
  const concepts = db
    .prepare("SELECT id, name FROM concepts WHERE quiz_set_id = ? ORDER BY display_order")
    .all(set.id) as { id: string; name: string }[];
  concepts.slice(0, content.concepts.length).forEach((c, ci) => {
    content.concepts[ci].name = c.name;
    const questions = db
      .prepare("SELECT * FROM questions WHERE concept_id = ? ORDER BY display_order")
      .all(c.id) as { body: string; options_json: string; correct_option_id: string; explanation: string }[];
    questions.slice(0, 3).forEach((q, qi) => {
      const options = JSON.parse(q.options_json) as { id: string; text: string }[];
      const answerIndex = options.findIndex((o) => o.id === q.correct_option_id);
      content.concepts[ci].questions[qi] = {
        body: q.body,
        options: options.map((o) => o.text),
        answer: answerIndex >= 0 ? answerIndex + 1 : null,
        explanation: q.explanation,
      };
    });
  });
  return content;
}

/** 임시저장 세트의 개념·문항을 통째로 바꾼다(참여자가 없는 상태에서만 호출). */
function writeContent(db: DatabaseSync, setId: string, content: QuizContent) {
  db.prepare("DELETE FROM concepts WHERE quiz_set_id = ?").run(setId);
  const insertConcept = db.prepare(
    "INSERT INTO concepts (id, quiz_set_id, name, display_order) VALUES (?, ?, ?, ?)",
  );
  const insertQuestion = db.prepare(
    `INSERT INTO questions (id, concept_id, question_type, body, options_json, correct_option_id, explanation, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  content.concepts.forEach((concept, ci) => {
    const conceptId = randomUUID();
    insertConcept.run(conceptId, setId, concept.name, ci);
    concept.questions.forEach((q, qi) => {
      // 선택지 ID는 무작위로 만들어 ID만 보고 정답 위치를 짐작할 수 없게 한다.
      const options = q.options.map((text) => ({ id: randomBytes(6).toString("hex"), text }));
      insertQuestion.run(
        randomUUID(),
        conceptId,
        qi === 0 ? "original" : "variant",
        q.body,
        JSON.stringify(options),
        q.answer === null ? "" : options[q.answer - 1].id,
        q.explanation,
        qi,
      );
    });
  });
}

function toDetail(db: DatabaseSync, set: SetRow): TeacherQuizDetail {
  const content = readContent(db, set);
  return {
    id: set.id,
    status: set.status,
    joinCode: set.join_code,
    isSample: set.is_sample === 1,
    timeLimitSeconds: set.time_limit_seconds,
    participantCount: participantCount(db, set.id),
    content,
    issues: validateForPublish(content),
  };
}

export function getQuizSetDetail(id: string): TeacherQuizDetail {
  const db = getDb();
  return toDetail(db, getSet(db, id));
}

/** 임시저장(D-14: 공개 전에만 편집). 빈칸이 있어도 저장한다. */
export function saveQuizContent(id: string, raw: unknown): TeacherQuizDetail {
  return transaction((db) => {
    const set = getSet(db, id);
    if (set.status !== "draft") {
      throw conflict("공개했거나 종료한 세트는 문항을 고칠 수 없어요. 먼저 공개를 취소해 주세요.", "NOT_DRAFT");
    }
    const content = normalizeContent(raw);
    const title = content.title || "새 퀴즈 세트";
    writeContent(db, id, content);
    db.prepare("UPDATE quiz_sets SET title = ?, mastery_threshold = ?, updated_at = ? WHERE id = ?").run(
      title,
      content.masteryThreshold,
      clock.now(),
      id,
    );
    return toDetail(db, getSet(db, id));
  });
}

/**
 * 상태 변경
 * - draft → published: 공개 전 검증 통과 필요
 * - published → closed: 신규 참여 차단
 * - closed → published: 다시 열기
 * - published/closed → draft: 참여자가 없을 때만(실수로 공개한 경우 되돌리기)
 */
export function setQuizStatus(id: string, next: unknown): TeacherQuizDetail {
  if (next !== "draft" && next !== "published" && next !== "closed") throw badRequest("잘못된 상태예요.");
  return transaction((db) => {
    const set = getSet(db, id);
    if (set.status === next) return toDetail(db, set);
    const now = clock.now();

    if (next === "published") {
      const issues = validateForPublish(readContent(db, set));
      if (issues.length > 0) {
        throw conflict(`아직 채우지 않은 곳이 ${issues.length}군데 있어요. 편집 화면에서 확인해 주세요.`, "INCOMPLETE");
      }
      db.prepare(
        "UPDATE quiz_sets SET status = 'published', published_at = COALESCE(published_at, ?), updated_at = ? WHERE id = ?",
      ).run(now, now, id);
    } else if (next === "closed") {
      if (set.status !== "published") throw conflict("공개 중인 세트만 종료할 수 있어요.", "BAD_TRANSITION");
      db.prepare("UPDATE quiz_sets SET status = 'closed', updated_at = ? WHERE id = ?").run(now, id);
    } else {
      if (participantCount(db, id) > 0) {
        throw conflict(
          "참여 기록이 있어서 편집 상태로 되돌릴 수 없어요. 기록을 먼저 삭제해 주세요.",
          "HAS_PARTICIPANTS",
        );
      }
      db.prepare("UPDATE quiz_sets SET status = 'draft', updated_at = ? WHERE id = ?").run(now, id);
    }
    return toDetail(db, getSet(db, id));
  });
}

// ───────────────────────── 분석 ─────────────────────────

export function getAnalytics(id: string): TeacherAnalytics {
  const db = getDb();
  const set = getSet(db, id);

  const concepts = db
    .prepare("SELECT id, name FROM concepts WHERE quiz_set_id = ? ORDER BY display_order")
    .all(id) as { id: string; name: string }[];
  const stats = db
    .prepare(
      `SELECT q.concept_id, q.question_type, COUNT(*) AS responses, SUM(a.is_correct) AS correct
       FROM answer_attempts a
       JOIN questions q ON q.id = a.question_id
       JOIN participations p ON p.id = a.participation_id
       WHERE p.quiz_set_id = ? AND a.attempt_type = 'initial'
       GROUP BY q.concept_id, q.question_type`,
    )
    .all(id) as { concept_id: string; question_type: "original" | "variant"; responses: number; correct: number }[];

  const accuracy: ConceptAccuracy[] = concepts.map((c) => {
    const rows = stats.filter((s) => s.concept_id === c.id);
    const sum = (type?: "original" | "variant") => {
      const picked = type ? rows.filter((r) => r.question_type === type) : rows;
      return {
        responses: picked.reduce((n, r) => n + r.responses, 0),
        correct: picked.reduce((n, r) => n + r.correct, 0),
      };
    };
    const all = sum();
    const original = sum("original");
    const variant = sum("variant");
    return {
      conceptId: c.id,
      name: c.name,
      responses: all.responses,
      correct: all.correct,
      rate: rate(all.correct, all.responses),
      originalRate: rate(original.correct, original.responses),
      variantRate: rate(variant.correct, variant.responses),
    };
  });

  const questionCount = (
    db
      .prepare("SELECT COUNT(*) AS n FROM questions q JOIN concepts c ON c.id = q.concept_id WHERE c.quiz_set_id = ?")
      .get(id) as { n: number }
  ).n;

  const participants = db
    .prepare(
      `SELECT p.id, p.nickname, p.status, p.current_index, p.last_activity_at, p.hidden_from_leaderboard,
              COALESCE(SUM(CASE WHEN a.attempt_type = 'initial' THEN a.score_units END), 0) AS units
       FROM participations p
       LEFT JOIN answer_attempts a ON a.participation_id = p.id
       WHERE p.quiz_set_id = ?
       GROUP BY p.id
       ORDER BY p.status DESC, p.last_activity_at DESC`,
    )
    .all(id) as {
    id: string;
    nickname: string;
    status: "in_progress" | "submitted";
    current_index: number;
    last_activity_at: number;
    hidden_from_leaderboard: number;
    units: number;
  }[];

  return {
    quiz: { id: set.id, title: set.title, status: set.status, joinCode: set.join_code, questionCount },
    participantCount: participants.length,
    inProgressCount: participants.filter((p) => p.status === "in_progress").length,
    submittedCount: participants.filter((p) => p.status === "submitted").length,
    concepts: accuracy,
    participants: participants.map((p) => ({
      id: p.id,
      nickname: p.nickname,
      status: p.status,
      answered: p.current_index,
      total: questionCount,
      units: p.units,
      lastActivityAt: p.last_activity_at,
      hidden: p.hidden_from_leaderboard === 1,
    })),
    leaderboard: getLeaderboard(id, null).entries,
  };
}

// ───────────────────────── 참여자 관리·기록 삭제 ─────────────────────────

function getParticipationSetId(db: DatabaseSync, participationId: string): string {
  const row = db.prepare("SELECT quiz_set_id FROM participations WHERE id = ?").get(participationId) as
    | { quiz_set_id: string }
    | undefined;
  if (!row) throw notFound("참여자를 찾을 수 없어요.");
  return row.quiz_set_id;
}

/** FR-043: 리더보드에서 숨기기. 정답률 분석에는 계속 포함된다. */
export function setParticipantHidden(participationId: string, hidden: unknown) {
  if (typeof hidden !== "boolean") throw badRequest("잘못된 요청이에요.");
  const db = getDb();
  getParticipationSetId(db, participationId);
  db.prepare("UPDATE participations SET hidden_from_leaderboard = ? WHERE id = ?").run(hidden ? 1 : 0, participationId);
}

/** FR-043: 참여자 한 명의 기록 삭제. 응답·오답 노트·극복 상태가 함께 지워진다. */
export function deleteParticipant(participationId: string) {
  transaction((db) => {
    getParticipationSetId(db, participationId);
    db.prepare("DELETE FROM participations WHERE id = ?").run(participationId);
  });
}

/**
 * FR-042: 세트의 학생 기록 전체 삭제(영구, D-13).
 * 참여·응답·점수·오답 노트·극복 상태·리더보드 데이터가 지워지고, 세트와 문항은 남는다.
 */
export function deleteQuizSetRecords(setId: string): { deleted: number } {
  return transaction((db) => {
    getSet(db, setId);
    const deleted = participantCount(db, setId);
    db.prepare("DELETE FROM participations WHERE quiz_set_id = ?").run(setId);
    return { deleted };
  });
}
