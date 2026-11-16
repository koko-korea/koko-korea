import "server-only";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { SAMPLE_CONCEPTS, SAMPLE_JOIN_CODE, SAMPLE_TITLE } from "./seed/sample-quiz";

/**
 * 로컬 개발용 SQLite (D-17: 우선 로컬 개발, 배포 시 PostgreSQL로 이전).
 * 모든 시각은 UTC epoch 밀리초 정수로 저장한다.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS quiz_sets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft','published','closed')),
  time_limit_seconds INTEGER NOT NULL DEFAULT 30,
  mastery_threshold INTEGER NOT NULL DEFAULT 1,
  join_code TEXT NOT NULL UNIQUE,
  is_sample INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER
);

CREATE TABLE IF NOT EXISTS concepts (
  id TEXT PRIMARY KEY,
  quiz_set_id TEXT NOT NULL REFERENCES quiz_sets(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  question_type TEXT NOT NULL CHECK (question_type IN ('original','variant')),
  body TEXT NOT NULL,
  options_json TEXT NOT NULL,
  correct_option_id TEXT NOT NULL,
  explanation TEXT NOT NULL,
  display_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS participations (
  id TEXT PRIMARY KEY,
  quiz_set_id TEXT NOT NULL REFERENCES quiz_sets(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('in_progress','submitted')),
  question_order_json TEXT NOT NULL,
  current_index INTEGER NOT NULL DEFAULT 0,
  combo INTEGER NOT NULL DEFAULT 0,
  max_combo INTEGER NOT NULL DEFAULT 0,
  hidden_from_leaderboard INTEGER NOT NULL DEFAULT 0,
  sound_enabled INTEGER NOT NULL DEFAULT 1,
  started_at INTEGER NOT NULL,
  submitted_at INTEGER,
  last_activity_at INTEGER NOT NULL,
  UNIQUE (quiz_set_id, nickname)
);

CREATE TABLE IF NOT EXISTS question_deliveries (
  id TEXT PRIMARY KEY,
  participation_id TEXT NOT NULL REFERENCES participations(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  attempt_type TEXT NOT NULL CHECK (attempt_type IN ('initial','review')),
  option_order_json TEXT NOT NULL,
  served_at INTEGER NOT NULL,
  deadline_at INTEGER,
  answered INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS answer_attempts (
  id TEXT PRIMARY KEY,
  participation_id TEXT NOT NULL REFERENCES participations(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  delivery_id TEXT NOT NULL UNIQUE REFERENCES question_deliveries(id) ON DELETE CASCADE,
  selected_option_id TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  is_timeout INTEGER NOT NULL,
  score_units INTEGER NOT NULL,
  attempt_type TEXT NOT NULL CHECK (attempt_type IN ('initial','review')),
  submitted_at INTEGER NOT NULL,
  elapsed_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS concept_mastery (
  participation_id TEXT NOT NULL REFERENCES participations(id) ON DELETE CASCADE,
  concept_id TEXT NOT NULL REFERENCES concepts(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('needs_review','mastered')),
  review_streak INTEGER NOT NULL DEFAULT 0,
  review_count INTEGER NOT NULL DEFAULT 0,
  mastered_at INTEGER,
  badge_awarded_at INTEGER,
  PRIMARY KEY (participation_id, concept_id)
);

CREATE TABLE IF NOT EXISTS teacher_sessions (
  token_hash TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_deliveries_participation ON question_deliveries(participation_id);
CREATE INDEX IF NOT EXISTS idx_answers_participation ON answer_attempts(participation_id, attempt_type);
CREATE INDEX IF NOT EXISTS idx_participations_set ON participations(quiz_set_id, status);
`;

type GlobalWithDb = typeof globalThis & { __kokoDb?: DatabaseSync };

function resolveDbPath(): string {
  const configured = process.env.KOKO_DB_PATH;
  if (configured) return configured;
  const dir = path.join(process.cwd(), "data");
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "koko.db");
}

function seedSample(db: DatabaseSync) {
  const exists = db.prepare("SELECT 1 FROM quiz_sets WHERE join_code = ?").get(SAMPLE_JOIN_CODE);
  if (exists) return;

  const now = Date.now();
  const setId = randomUUID();
  db.prepare(
    `INSERT INTO quiz_sets (id, title, status, time_limit_seconds, mastery_threshold, join_code, is_sample, created_at, updated_at, published_at)
     VALUES (?, ?, 'published', 30, 1, ?, 1, ?, ?, ?)`,
  ).run(setId, SAMPLE_TITLE, SAMPLE_JOIN_CODE, now, now, now);

  const insertConcept = db.prepare(
    "INSERT INTO concepts (id, quiz_set_id, name, display_order) VALUES (?, ?, ?, ?)",
  );
  const insertQuestion = db.prepare(
    `INSERT INTO questions (id, concept_id, question_type, body, options_json, correct_option_id, explanation, display_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  SAMPLE_CONCEPTS.forEach((concept, conceptIndex) => {
    const conceptId = randomUUID();
    insertConcept.run(conceptId, setId, concept.name, conceptIndex);
    concept.questions.forEach((q, qIndex) => {
      // 선택지 ID는 무작위로 만들어 ID만 보고 정답 위치를 짐작할 수 없게 한다.
      const options = q.options.map((text) => ({ id: randomBytes(6).toString("hex"), text }));
      insertQuestion.run(
        randomUUID(),
        conceptId,
        qIndex === 0 ? "original" : "variant",
        q.body,
        JSON.stringify(options),
        options[q.answer - 1].id,
        q.explanation,
        qIndex,
      );
    });
  });
}

export function getDb(): DatabaseSync {
  const g = globalThis as GlobalWithDb;
  if (!g.__kokoDb) {
    const db = new DatabaseSync(resolveDbPath());
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    db.exec(SCHEMA);
    transactionOn(db, () => seedSample(db));
    g.__kokoDb = db;
  }
  return g.__kokoDb;
}

/** 테스트용: 연결을 닫고 다음 getDb()에서 새로 연다. */
export function resetDbForTests() {
  const g = globalThis as GlobalWithDb;
  g.__kokoDb?.close();
  g.__kokoDb = undefined;
}

function transactionOn<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

/** 부분 저장이 생기지 않도록 여러 쓰기를 하나의 트랜잭션으로 묶는다. */
export function transaction<T>(fn: (db: DatabaseSync) => T): T {
  const db = getDb();
  return transactionOn(db, () => fn(db));
}
