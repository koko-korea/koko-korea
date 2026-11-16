import "server-only";
import { createHash, randomBytes, randomInt, randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { getDb, transaction } from "./db";
import { clock } from "./clock";
import { AppError, badRequest, conflict, notFound } from "./errors";
import { scoreUnits, earnsTimeBonus, UNITS_PER_CORRECT, type QuestionType } from "@/domain/scoring";
import { computeDeadline, isTimedOut } from "@/domain/timer";
import { nextCombo } from "@/domain/combo";
import { applyReviewResult, clampThreshold, type MasteryStatus } from "@/domain/mastery";
import {
  buildRoundOrder,
  pickReviewQuestion,
  roundOf,
  shuffle,
  type ConceptQuestions,
  type Rng,
} from "@/domain/ordering";
import { rankLeaderboard } from "@/domain/leaderboard";
import { checkNickname } from "@/domain/nickname";
import type {
  AnswerResult,
  ConceptSummary,
  LeaderboardData,
  PlayState,
  QuizInfo,
  ResultSummary,
  ReviewQuestion,
  ReviewResult,
  ShownOption,
  WrongNoteConcept,
} from "@/lib/api-types";

// ───────────────────────── 행 타입 ─────────────────────────

interface QuizSetRow {
  id: string;
  title: string;
  status: "draft" | "published" | "closed";
  time_limit_seconds: number;
  mastery_threshold: number;
  join_code: string;
  is_sample: number;
}

export interface ParticipationRow {
  id: string;
  quiz_set_id: string;
  nickname: string;
  status: "in_progress" | "submitted";
  question_order_json: string;
  current_index: number;
  combo: number;
  max_combo: number;
  sound_enabled: number;
}

interface QuestionRow {
  id: string;
  concept_id: string;
  question_type: QuestionType;
  body: string;
  options_json: string;
  correct_option_id: string;
  explanation: string;
  display_order: number;
}

interface DeliveryRow {
  id: string;
  participation_id: string;
  question_id: string;
  attempt_type: "initial" | "review";
  option_order_json: string;
  served_at: number;
  deadline_at: number | null;
  answered: number;
}

interface AnswerRow {
  question_id: string;
  selected_option_id: string;
  is_correct: number;
  is_timeout: number;
  score_units: number;
}

interface MasteryRow {
  status: MasteryStatus;
  review_streak: number;
  review_count: number;
}

const ROUND_COUNT = 3;

// ───────────────────────── 공통 도우미 ─────────────────────────

const cryptoRng: Rng = () => randomInt(0, 2 ** 32) / 2 ** 32;

function row<T>(value: unknown): T | undefined {
  return value as T | undefined;
}

function rows<T>(value: unknown[]): T[] {
  return value as T[];
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseOptions(q: QuestionRow): ShownOption[] {
  return JSON.parse(q.options_json) as ShownOption[];
}

function orderedOptions(q: QuestionRow, delivery: DeliveryRow): ShownOption[] {
  const byId = new Map(parseOptions(q).map((o) => [o.id, o]));
  const order = JSON.parse(delivery.option_order_json) as string[];
  return order.map((id) => byId.get(id)).filter((o): o is ShownOption => Boolean(o));
}

function getQuizSetRow(db: DatabaseSync, setId: string): QuizSetRow {
  const set = row<QuizSetRow>(db.prepare("SELECT * FROM quiz_sets WHERE id = ?").get(setId));
  if (!set) throw notFound("퀴즈를 찾을 수 없습니다.");
  return set;
}

function getQuestion(db: DatabaseSync, questionId: string): QuestionRow {
  const q = row<QuestionRow>(db.prepare("SELECT * FROM questions WHERE id = ?").get(questionId));
  if (!q) throw notFound("문항을 찾을 수 없습니다.");
  return q;
}

function getConceptName(db: DatabaseSync, conceptId: string): string {
  const c = row<{ name: string }>(db.prepare("SELECT name FROM concepts WHERE id = ?").get(conceptId));
  return c?.name ?? "";
}

function reloadParticipation(db: DatabaseSync, id: string): ParticipationRow {
  const p = row<ParticipationRow>(db.prepare("SELECT * FROM participations WHERE id = ?").get(id));
  if (!p) throw new AppError(401, "NO_PARTICIPATION", "참여 정보가 없습니다. 다시 참여해 주세요.");
  return p;
}

function totalInitialUnits(db: DatabaseSync, participationId: string): number {
  const r = row<{ total: number }>(
    db
      .prepare(
        "SELECT COALESCE(SUM(score_units), 0) AS total FROM answer_attempts WHERE participation_id = ? AND attempt_type = 'initial'",
      )
      .get(participationId),
  );
  return r?.total ?? 0;
}

function touch(db: DatabaseSync, participationId: string) {
  db.prepare("UPDATE participations SET last_activity_at = ? WHERE id = ?").run(clock.now(), participationId);
}

function requireSubmitted(p: ParticipationRow) {
  if (p.status !== "submitted") {
    throw conflict("아직 퀴즈를 다 풀지 않았어요.", "NOT_FINISHED");
  }
}

function toQuizInfo(db: DatabaseSync, set: QuizSetRow): QuizInfo {
  const counts = row<{ concepts: number; questions: number }>(
    db
      .prepare(
        `SELECT COUNT(DISTINCT c.id) AS concepts, COUNT(q.id) AS questions
         FROM concepts c LEFT JOIN questions q ON q.concept_id = c.id
         WHERE c.quiz_set_id = ?`,
      )
      .get(set.id),
  );
  return {
    id: set.id,
    title: set.title,
    status: set.status,
    conceptCount: counts?.concepts ?? 0,
    questionCount: counts?.questions ?? 0,
    timeLimitSeconds: set.time_limit_seconds,
    isSample: set.is_sample === 1,
  };
}

// ───────────────────────── 참여 ─────────────────────────

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase();
}

export function findQuizByCode(code: string): QuizInfo | null {
  const db = getDb();
  const set = row<QuizSetRow>(
    db.prepare("SELECT * FROM quiz_sets WHERE join_code = ?").get(normalizeJoinCode(code)),
  );
  if (!set || set.status === "draft") return null;
  return toQuizInfo(db, set);
}

export function findParticipationByToken(
  setId: string,
  token: string | undefined,
): ParticipationRow | null {
  if (!token) return null;
  const db = getDb();
  return (
    row<ParticipationRow>(
      db
        .prepare("SELECT * FROM participations WHERE quiz_set_id = ? AND token_hash = ?")
        .get(setId, hashToken(token)),
    ) ?? null
  );
}

function loadConceptStructure(db: DatabaseSync, setId: string): ConceptQuestions[] {
  const concepts = rows<{ id: string }>(
    db.prepare("SELECT id FROM concepts WHERE quiz_set_id = ? ORDER BY display_order").all(setId),
  );
  const result: ConceptQuestions[] = [];
  for (const c of concepts) {
    const qs = rows<{ id: string; question_type: QuestionType }>(
      db
        .prepare("SELECT id, question_type FROM questions WHERE concept_id = ? ORDER BY display_order")
        .all(c.id),
    );
    const originals = qs.filter((q) => q.question_type === "original");
    const variants = qs.filter((q) => q.question_type === "variant");
    if (originals.length !== 1 || variants.length !== 2) {
      throw new AppError(500, "QUIZ_INCOMPLETE", "퀴즈 문항 구성이 올바르지 않아요. 선생님께 알려 주세요.");
    }
    result.push({
      conceptId: c.id,
      originalId: originals[0].id,
      variantIds: [variants[0].id, variants[1].id],
    });
  }
  if (result.length === 0) {
    throw new AppError(500, "QUIZ_INCOMPLETE", "퀴즈에 문항이 없어요. 선생님께 알려 주세요.");
  }
  return result;
}

/** 명단 없이 닉네임만으로 참여한다. 원본 토큰은 쿠키로만 돌려주고 서버에는 해시만 저장한다. */
export function joinQuiz(
  setId: string,
  rawNickname: unknown,
): { participationId: string; token: string; nickname: string } {
  const check = checkNickname(rawNickname);
  if (!check.ok) throw badRequest(check.message, "INVALID_NICKNAME");

  return transaction((db) => {
    const set = getQuizSetRow(db, setId);
    if (set.status === "closed") throw conflict("종료된 퀴즈예요.", "QUIZ_CLOSED");
    if (set.status !== "published") throw notFound("퀴즈를 찾을 수 없습니다.");

    const taken = db
      .prepare("SELECT 1 FROM participations WHERE quiz_set_id = ? AND nickname = ?")
      .get(setId, check.value);
    if (taken) throw conflict("이미 사용 중인 닉네임이에요. 다른 닉네임을 써 주세요.", "NICKNAME_TAKEN");

    const order = buildRoundOrder(loadConceptStructure(db, setId), cryptoRng);
    const token = randomBytes(32).toString("base64url");
    const id = randomUUID();
    const now = clock.now();
    db.prepare(
      `INSERT INTO participations (id, quiz_set_id, nickname, token_hash, status, question_order_json, started_at, last_activity_at)
       VALUES (?, ?, ?, ?, 'in_progress', ?, ?, ?)`,
    ).run(id, setId, check.value, hashToken(token), JSON.stringify(order), now, now);
    return { participationId: id, token, nickname: check.value };
  });
}

export function getQuizInfo(setId: string): QuizInfo {
  const db = getDb();
  return toQuizInfo(db, getQuizSetRow(db, setId));
}

// ───────────────────────── 최초 풀이 ─────────────────────────

function createDelivery(
  db: DatabaseSync,
  participationId: string,
  question: QuestionRow,
  attemptType: "initial" | "review",
  timeLimitSeconds: number | null,
): DeliveryRow {
  const now = clock.now();
  const delivery: DeliveryRow = {
    id: randomUUID(),
    participation_id: participationId,
    question_id: question.id,
    attempt_type: attemptType,
    option_order_json: JSON.stringify(shuffle(parseOptions(question), cryptoRng).map((o) => o.id)),
    served_at: now,
    deadline_at: timeLimitSeconds === null ? null : computeDeadline(now, timeLimitSeconds),
    answered: 0,
  };
  db.prepare(
    `INSERT INTO question_deliveries (id, participation_id, question_id, attempt_type, option_order_json, served_at, deadline_at, answered)
     VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
  ).run(
    delivery.id,
    delivery.participation_id,
    delivery.question_id,
    delivery.attempt_type,
    delivery.option_order_json,
    delivery.served_at,
    delivery.deadline_at,
  );
  return delivery;
}

/**
 * 현재 문항을 돌려준다. 새로고침해도 같은 제시 기록(같은 마감 시각, 같은 선택지 순서)을 재사용하므로
 * 새로고침으로 타이머를 되돌릴 수 없다.
 */
export function getPlayState(participationId: string): PlayState {
  return transaction((db) => {
    const p = reloadParticipation(db, participationId);
    if (p.status === "submitted") return { status: "submitted", nickname: p.nickname };

    const set = getQuizSetRow(db, p.quiz_set_id);
    const order = JSON.parse(p.question_order_json) as string[];
    const question = getQuestion(db, order[p.current_index]);

    let delivery = row<DeliveryRow>(
      db
        .prepare(
          `SELECT * FROM question_deliveries
           WHERE participation_id = ? AND question_id = ? AND attempt_type = 'initial' AND answered = 0
           ORDER BY served_at DESC LIMIT 1`,
        )
        .get(p.id, question.id),
    );
    if (!delivery) {
      delivery = createDelivery(db, p.id, question, "initial", set.time_limit_seconds);
    }
    touch(db, p.id);

    const conceptCount = order.length / ROUND_COUNT;
    return {
      status: "in_progress",
      nickname: p.nickname,
      index: p.current_index,
      total: order.length,
      round: roundOf(p.current_index, conceptCount),
      roundCount: ROUND_COUNT,
      conceptName: getConceptName(db, question.concept_id),
      questionType: question.question_type,
      deliveryId: delivery.id,
      body: question.body,
      options: orderedOptions(question, delivery),
      deadlineAt: delivery.deadline_at ?? 0,
      serverNow: clock.now(),
      timeLimitSeconds: set.time_limit_seconds,
      combo: p.combo,
      scoreUnits: totalInitialUnits(db, p.id),
      soundEnabled: p.sound_enabled === 1,
    };
  });
}

function getDeliveryFor(db: DatabaseSync, participationId: string, deliveryId: unknown): DeliveryRow {
  if (typeof deliveryId !== "string") throw badRequest("잘못된 요청입니다.");
  const d = row<DeliveryRow>(
    db
      .prepare("SELECT * FROM question_deliveries WHERE id = ? AND participation_id = ?")
      .get(deliveryId, participationId),
  );
  if (!d) throw notFound("문항을 찾을 수 없습니다.");
  return d;
}

function existingAnswer(db: DatabaseSync, deliveryId: string): AnswerRow | undefined {
  return row<AnswerRow>(db.prepare("SELECT * FROM answer_attempts WHERE delivery_id = ?").get(deliveryId));
}

/**
 * 답안 제출. 정답 여부·점수·시간 초과는 모두 서버가 판정한다.
 * 같은 제시 기록에 대한 재전송은 처음 확정된 결과를 그대로 돌려준다(중복 점수 방지).
 */
export function submitAnswer(participationId: string, deliveryId: unknown, optionId: unknown): AnswerResult {
  return transaction((db) => {
    const delivery = getDeliveryFor(db, participationId, deliveryId);
    if (delivery.attempt_type !== "initial") throw badRequest("잘못된 요청입니다.");
    const question = getQuestion(db, delivery.question_id);

    const previous = existingAnswer(db, delivery.id);
    if (previous) {
      const p = reloadParticipation(db, participationId);
      return {
        isCorrect: previous.is_correct === 1,
        isTimeout: previous.is_timeout === 1,
        timeBonus: earnsTimeBonus(previous.is_correct === 1, previous.is_timeout === 1),
        correctOptionId: question.correct_option_id,
        explanation: question.explanation,
        scoreUnits: previous.score_units,
        totalUnits: totalInitialUnits(db, p.id),
        combo: p.combo,
        finished: p.status === "submitted",
      };
    }

    const p = reloadParticipation(db, participationId);
    if (p.status === "submitted") throw conflict("이미 제출을 마쳤어요.", "ALREADY_SUBMITTED");
    const order = JSON.parse(p.question_order_json) as string[];
    if (order[p.current_index] !== delivery.question_id) {
      throw conflict("화면이 최신 상태가 아니에요. 새로고침해 주세요.", "STALE_QUESTION");
    }
    if (typeof optionId !== "string" || !parseOptions(question).some((o) => o.id === optionId)) {
      throw badRequest("선택지를 골라 주세요.", "INVALID_OPTION");
    }

    const now = clock.now();
    const isTimeout = isTimedOut(now, delivery.deadline_at);
    const isCorrect = optionId === question.correct_option_id;
    const units = scoreUnits(question.question_type, isCorrect);
    const combo = nextCombo(p.combo, isCorrect, isTimeout);
    const nextIndex = p.current_index + 1;
    const finished = nextIndex >= order.length;

    db.prepare(
      `INSERT INTO answer_attempts (id, participation_id, question_id, delivery_id, selected_option_id, is_correct, is_timeout, score_units, attempt_type, submitted_at, elapsed_ms)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'initial', ?, ?)`,
    ).run(
      randomUUID(),
      p.id,
      question.id,
      delivery.id,
      optionId,
      isCorrect ? 1 : 0,
      isTimeout ? 1 : 0,
      units,
      now,
      now - delivery.served_at,
    );
    db.prepare("UPDATE question_deliveries SET answered = 1 WHERE id = ?").run(delivery.id);
    db.prepare(
      `UPDATE participations
       SET current_index = ?, combo = ?, max_combo = MAX(max_combo, ?), status = ?, submitted_at = ?, last_activity_at = ?
       WHERE id = ?`,
    ).run(nextIndex, combo, combo, finished ? "submitted" : "in_progress", finished ? now : null, now, p.id);

    if (!isCorrect) {
      db.prepare(
        `INSERT OR IGNORE INTO concept_mastery (participation_id, concept_id, status) VALUES (?, ?, 'needs_review')`,
      ).run(p.id, question.concept_id);
    }

    return {
      isCorrect,
      isTimeout,
      timeBonus: earnsTimeBonus(isCorrect, isTimeout),
      correctOptionId: question.correct_option_id,
      explanation: question.explanation,
      scoreUnits: units,
      totalUnits: totalInitialUnits(db, p.id),
      combo,
      finished,
    };
  });
}

export function setSoundEnabled(participationId: string, enabled: unknown) {
  if (typeof enabled !== "boolean") throw badRequest("잘못된 요청입니다.");
  getDb()
    .prepare("UPDATE participations SET sound_enabled = ? WHERE id = ?")
    .run(enabled ? 1 : 0, participationId);
}

// ───────────────────────── 결과 ─────────────────────────

interface InitialAnswerJoined extends AnswerRow {
  concept_id: string;
  concept_name: string;
  concept_order: number;
  question_type: QuestionType;
}

function initialAnswers(db: DatabaseSync, participationId: string): InitialAnswerJoined[] {
  return rows<InitialAnswerJoined>(
    db
      .prepare(
        `SELECT a.*, q.concept_id, q.question_type, c.name AS concept_name, c.display_order AS concept_order
         FROM answer_attempts a
         JOIN questions q ON q.id = a.question_id
         JOIN concepts c ON c.id = q.concept_id
         WHERE a.participation_id = ? AND a.attempt_type = 'initial'
         ORDER BY c.display_order, q.display_order`,
      )
      .all(participationId),
  );
}

function masteryMap(db: DatabaseSync, participationId: string): Map<string, MasteryRow> {
  const list = rows<MasteryRow & { concept_id: string }>(
    db.prepare("SELECT * FROM concept_mastery WHERE participation_id = ?").all(participationId),
  );
  return new Map(list.map((m) => [m.concept_id, m]));
}

export function getResult(participationId: string): ResultSummary {
  const db = getDb();
  const p = reloadParticipation(db, participationId);
  requireSubmitted(p);

  const answers = initialAnswers(db, p.id);
  const mastery = masteryMap(db, p.id);
  const byConcept = new Map<string, ConceptSummary>();
  let maxUnits = 0;
  for (const a of answers) {
    maxUnits += UNITS_PER_CORRECT[a.question_type];
    const summary =
      byConcept.get(a.concept_id) ??
      ({ conceptId: a.concept_id, name: a.concept_name, correct: 0, total: 0, mastery: "perfect" } as ConceptSummary);
    summary.total += 1;
    if (a.is_correct === 1) summary.correct += 1;
    byConcept.set(a.concept_id, summary);
  }
  for (const summary of byConcept.values()) {
    const m = mastery.get(summary.conceptId);
    if (m) summary.mastery = m.status;
  }

  return {
    nickname: p.nickname,
    totalUnits: answers.reduce((sum, a) => sum + a.score_units, 0),
    maxUnits,
    correctCount: answers.filter((a) => a.is_correct === 1).length,
    wrongCount: answers.filter((a) => a.is_correct === 0).length,
    timeoutCount: answers.filter((a) => a.is_timeout === 1).length,
    questionCount: answers.length,
    maxCombo: p.max_combo,
    badgeCount: [...mastery.values()].filter((m) => m.status === "mastered").length,
    concepts: [...byConcept.values()],
  };
}

// ───────────────────────── 오답 노트·재도전 ─────────────────────────

export function getWrongNotes(participationId: string): WrongNoteConcept[] {
  const db = getDb();
  const p = reloadParticipation(db, participationId);
  requireSubmitted(p);
  const set = getQuizSetRow(db, p.quiz_set_id);
  const threshold = clampThreshold(set.mastery_threshold);
  const mastery = masteryMap(db, p.id);

  const wrong = rows<{
    concept_id: string;
    concept_name: string;
    question_id: string;
    question_type: QuestionType;
    body: string;
    options_json: string;
    correct_option_id: string;
    explanation: string;
    selected_option_id: string;
  }>(
    db
      .prepare(
        `SELECT q.concept_id, c.name AS concept_name, q.id AS question_id, q.question_type, q.body, q.options_json,
                q.correct_option_id, q.explanation, a.selected_option_id
         FROM answer_attempts a
         JOIN questions q ON q.id = a.question_id
         JOIN concepts c ON c.id = q.concept_id
         WHERE a.participation_id = ? AND a.attempt_type = 'initial' AND a.is_correct = 0
         ORDER BY c.display_order, q.display_order`,
      )
      .all(p.id),
  );

  const groups = new Map<string, WrongNoteConcept>();
  for (const w of wrong) {
    const m = mastery.get(w.concept_id);
    const group =
      groups.get(w.concept_id) ??
      ({
        conceptId: w.concept_id,
        name: w.concept_name,
        status: m?.status ?? "needs_review",
        streak: m?.review_streak ?? 0,
        threshold,
        items: [],
      } as WrongNoteConcept);
    const options = JSON.parse(w.options_json) as ShownOption[];
    const textOf = (id: string) => options.find((o) => o.id === id)?.text ?? "";
    group.items.push({
      questionId: w.question_id,
      questionType: w.question_type,
      body: w.body,
      selectedText: textOf(w.selected_option_id),
      correctText: textOf(w.correct_option_id),
      explanation: w.explanation,
    });
    groups.set(w.concept_id, group);
  }
  return [...groups.values()];
}

function getMasteryRow(db: DatabaseSync, participationId: string, conceptId: unknown): MasteryRow {
  if (typeof conceptId !== "string") throw badRequest("잘못된 요청입니다.");
  const m = row<MasteryRow>(
    db
      .prepare("SELECT * FROM concept_mastery WHERE participation_id = ? AND concept_id = ?")
      .get(participationId, conceptId),
  );
  if (!m) throw notFound("오답 노트에 없는 개념이에요.");
  return m;
}

/** 오답 개념의 재도전 문항을 하나 내준다. 기존 문항을 재사용하고 선택지는 새로 섞는다. */
export function startReview(participationId: string, conceptId: unknown): ReviewQuestion {
  return transaction((db) => {
    const p = reloadParticipation(db, participationId);
    requireSubmitted(p);
    const m = getMasteryRow(db, p.id, conceptId);
    const set = getQuizSetRow(db, p.quiz_set_id);
    const cid = conceptId as string;

    const candidates = rows<{ question_id: string; is_correct: number }>(
      db
        .prepare(
          `SELECT a.question_id, a.is_correct
           FROM answer_attempts a JOIN questions q ON q.id = a.question_id
           WHERE a.participation_id = ? AND a.attempt_type = 'initial' AND q.concept_id = ?
           ORDER BY q.display_order`,
        )
        .all(p.id, cid),
    ).map((c) => ({ questionId: c.question_id, initiallyCorrect: c.is_correct === 1 }));

    const question = getQuestion(db, pickReviewQuestion(candidates, m.review_count));
    // 같은 문항의 답하지 않은 재도전 기록이 있으면 선택지를 다시 섞으면서 새로 만든다.
    db.prepare(
      `DELETE FROM question_deliveries
       WHERE participation_id = ? AND question_id = ? AND attempt_type = 'review' AND answered = 0`,
    ).run(p.id, question.id);
    const delivery = createDelivery(db, p.id, question, "review", null);
    touch(db, p.id);

    return {
      deliveryId: delivery.id,
      conceptId: cid,
      conceptName: getConceptName(db, cid),
      body: question.body,
      options: orderedOptions(question, delivery),
      streak: m.review_streak,
      threshold: clampThreshold(set.mastery_threshold),
      status: m.status,
    };
  });
}

/** 재도전 답안. 점수는 따로 기록하고 최초 점수·리더보드에는 더하지 않는다(D-09). */
export function submitReview(participationId: string, deliveryId: unknown, optionId: unknown): ReviewResult {
  return transaction((db) => {
    const delivery = getDeliveryFor(db, participationId, deliveryId);
    if (delivery.attempt_type !== "review") throw badRequest("잘못된 요청입니다.");
    const question = getQuestion(db, delivery.question_id);
    const p = reloadParticipation(db, participationId);
    const set = getQuizSetRow(db, p.quiz_set_id);
    const threshold = clampThreshold(set.mastery_threshold);
    const m = getMasteryRow(db, p.id, question.concept_id);

    const previous = existingAnswer(db, delivery.id);
    if (previous) {
      return {
        isCorrect: previous.is_correct === 1,
        correctOptionId: question.correct_option_id,
        explanation: question.explanation,
        status: m.status,
        streak: m.review_streak,
        threshold,
        newlyMastered: false,
      };
    }
    if (typeof optionId !== "string" || !parseOptions(question).some((o) => o.id === optionId)) {
      throw badRequest("선택지를 골라 주세요.", "INVALID_OPTION");
    }

    const now = clock.now();
    const isCorrect = optionId === question.correct_option_id;
    db.prepare(
      `INSERT INTO answer_attempts (id, participation_id, question_id, delivery_id, selected_option_id, is_correct, is_timeout, score_units, attempt_type, submitted_at, elapsed_ms)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'review', ?, ?)`,
    ).run(
      randomUUID(),
      p.id,
      question.id,
      delivery.id,
      optionId,
      isCorrect ? 1 : 0,
      scoreUnits(question.question_type, isCorrect),
      now,
      now - delivery.served_at,
    );
    db.prepare("UPDATE question_deliveries SET answered = 1 WHERE id = ?").run(delivery.id);

    const update = applyReviewResult({ status: m.status, streak: m.review_streak }, isCorrect, threshold);
    db.prepare(
      `UPDATE concept_mastery
       SET status = ?, review_streak = ?, review_count = review_count + 1,
           mastered_at = COALESCE(mastered_at, ?), badge_awarded_at = COALESCE(badge_awarded_at, ?)
       WHERE participation_id = ? AND concept_id = ?`,
    ).run(
      update.status,
      update.streak,
      update.newlyMastered ? now : null,
      update.newlyMastered ? now : null,
      p.id,
      question.concept_id,
    );
    touch(db, p.id);

    return {
      isCorrect,
      correctOptionId: question.correct_option_id,
      explanation: question.explanation,
      status: update.status,
      streak: update.streak,
      threshold,
      newlyMastered: update.newlyMastered,
    };
  });
}

// ───────────────────────── 리더보드 ─────────────────────────

export function getLeaderboard(setId: string, viewerParticipationId: string | null): LeaderboardData {
  const db = getDb();
  const entries = rows<{ id: string; nickname: string; units: number }>(
    db
      .prepare(
        `SELECT p.id, p.nickname, COALESCE(SUM(a.score_units), 0) AS units
         FROM participations p
         LEFT JOIN answer_attempts a ON a.participation_id = p.id AND a.attempt_type = 'initial'
         WHERE p.quiz_set_id = ? AND p.status = 'submitted' AND p.hidden_from_leaderboard = 0
         GROUP BY p.id`,
      )
      .all(setId),
  );
  const ranked = rankLeaderboard(
    entries.map((e) => ({ participationId: e.id, nickname: e.nickname, units: e.units })),
  );
  return {
    submittedCount: entries.length,
    entries: ranked.map((r) => ({
      rank: r.rank,
      nickname: r.nickname,
      units: r.units,
      isMe: r.participationId === viewerParticipationId,
    })),
  };
}
