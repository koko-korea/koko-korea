import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/server/db";
import { clock } from "@/server/clock";
import { AppError } from "@/server/errors";
import { SUBMIT_GRACE_MS } from "@/domain/timer";
import { SAMPLE_JOIN_CODE } from "@/server/seed/sample-quiz";
import {
  findParticipationByToken,
  findQuizByCode,
  getLeaderboard,
  getPlayState,
  getResult,
  getWrongNotes,
  joinQuiz,
  startReview,
  submitAnswer,
  submitReview,
} from "@/server/quiz-service";
import type { PlayStateInProgress } from "@/lib/api-types";

let now = 1_700_000_000_000;

beforeEach(() => {
  resetDbForTests();
  now = 1_700_000_000_000;
  clock.now = () => now;
});

afterEach(() => {
  resetDbForTests();
});

function sampleSetId() {
  const quiz = findQuizByCode(SAMPLE_JOIN_CODE);
  if (!quiz) throw new Error("견본 퀴즈가 없습니다");
  return quiz.id;
}

function correctOptionFor(deliveryId: string): string {
  const r = getDb()
    .prepare(
      "SELECT q.correct_option_id AS id FROM question_deliveries d JOIN questions q ON q.id = d.question_id WHERE d.id = ?",
    )
    .get(deliveryId) as { id: string };
  return r.id;
}

function wrongOptionFor(state: { deliveryId: string; options: { id: string }[] }): string {
  const correct = correctOptionFor(state.deliveryId);
  return state.options.find((o) => o.id !== correct)!.id;
}

function current(participationId: string): PlayStateInProgress {
  const s = getPlayState(participationId);
  if (s.status !== "in_progress") throw new Error("이미 제출됨");
  return s;
}

/** answerFn(index)가 true면 정답, false면 오답으로 36문항을 모두 푼다. */
function playAll(participationId: string, answerFn: (index: number) => boolean) {
  for (let i = 0; i < 36; i++) {
    const s = current(participationId);
    const option = answerFn(s.index) ? correctOptionFor(s.deliveryId) : wrongOptionFor(s);
    submitAnswer(participationId, s.deliveryId, option);
  }
}

describe("익명 참여", () => {
  it("견본 퀴즈가 자동으로 만들어진다 (12개념 36문항)", () => {
    const quiz = findQuizByCode(" koko01 ");
    expect(quiz).toMatchObject({ conceptCount: 12, questionCount: 36, status: "published" });
  });

  it("없는 코드는 null", () => {
    expect(findQuizByCode("NOPE99")).toBeNull();
  });

  it("닉네임만으로 참여하고, 토큰으로 다시 찾을 수 있다", () => {
    const setId = sampleSetId();
    const { participationId, token } = joinQuiz(setId, "국어왕");
    expect(findParticipationByToken(setId, token)?.id).toBe(participationId);
    expect(findParticipationByToken(setId, "wrong-token")).toBeNull();
    expect(findParticipationByToken(setId, undefined)).toBeNull();
  });

  it("서버에는 토큰 원본이 아니라 해시만 저장된다", () => {
    const setId = sampleSetId();
    const { participationId, token } = joinQuiz(setId, "국어왕");
    const stored = getDb()
      .prepare("SELECT token_hash FROM participations WHERE id = ?")
      .get(participationId) as { token_hash: string };
    expect(stored.token_hash).not.toBe(token);
    expect(stored.token_hash).toHaveLength(64);
  });

  it("같은 세트에서 중복 닉네임은 거부된다", () => {
    const setId = sampleSetId();
    joinQuiz(setId, "국어왕");
    expect(() => joinQuiz(setId, " 국어왕 ")).toThrowError(AppError);
  });

  it("잘못된 닉네임은 거부된다", () => {
    expect(() => joinQuiz(sampleSetId(), "a")).toThrowError(/닉네임/);
  });
});

describe("최초 풀이", () => {
  it("라운드 순서: 1~12 원문제, 13~36 동형", () => {
    const { participationId } = joinQuiz(sampleSetId(), "학생1");
    const types: string[] = [];
    const rounds: number[] = [];
    for (let i = 0; i < 36; i++) {
      const s = current(participationId);
      types.push(s.questionType);
      rounds.push(s.round);
      submitAnswer(participationId, s.deliveryId, correctOptionFor(s.deliveryId));
    }
    expect(types.slice(0, 12).every((t) => t === "original")).toBe(true);
    expect(types.slice(12).every((t) => t === "variant")).toBe(true);
    expect(rounds[0]).toBe(1);
    expect(rounds[12]).toBe(2);
    expect(rounds[35]).toBe(3);
  });

  it("문항 상태에는 정답 정보가 들어 있지 않다", () => {
    const { participationId } = joinQuiz(sampleSetId(), "학생1");
    const s = current(participationId);
    const json = JSON.stringify(s);
    expect(json).not.toContain("correct");
    expect(json).not.toContain("explanation");
    expect(s.options).toHaveLength(4);
  });

  it("새로고침해도 같은 문항·마감 시각·선택지 순서가 유지된다", () => {
    const { participationId } = joinQuiz(sampleSetId(), "학생1");
    const first = current(participationId);
    now += 10_000;
    const again = current(participationId);
    expect(again.deliveryId).toBe(first.deliveryId);
    expect(again.deadlineAt).toBe(first.deadlineAt);
    expect(again.options).toEqual(first.options);
  });

  it("만점은 24점(48 units), 원문제 1점·동형 0.5점", () => {
    const setId = sampleSetId();
    const { participationId } = joinQuiz(setId, "만점이");
    playAll(participationId, () => true);
    const result = getResult(participationId);
    expect(result.totalUnits).toBe(48);
    expect(result.maxUnits).toBe(48);
    expect(result.correctCount).toBe(36);
    expect(result.maxCombo).toBe(36);
  });

  it("원문제만 맞히면 12점, 동형만 맞히면 12점", () => {
    const setId = sampleSetId();
    const a = joinQuiz(setId, "원문제만").participationId;
    playAll(a, (i) => i < 12);
    expect(getResult(a).totalUnits).toBe(24);

    const b = joinQuiz(setId, "동형만").participationId;
    playAll(b, (i) => i >= 12);
    expect(getResult(b).totalUnits).toBe(24);
  });

  it("시간 초과 후 정답: 감점 없이 점수 부여, 보너스 없음, 콤보 유지", () => {
    const { participationId } = joinQuiz(sampleSetId(), "느림보");
    const s1 = current(participationId);
    submitAnswer(participationId, s1.deliveryId, correctOptionFor(s1.deliveryId));

    const s2 = current(participationId);
    now = s2.deadlineAt + SUBMIT_GRACE_MS + 1;
    const r = submitAnswer(participationId, s2.deliveryId, correctOptionFor(s2.deliveryId));
    expect(r).toMatchObject({ isCorrect: true, isTimeout: true, timeBonus: false, scoreUnits: 2, combo: 1 });
  });

  it("시간 내 정답은 보너스 연출 대상", () => {
    const { participationId } = joinQuiz(sampleSetId(), "번개");
    const s = current(participationId);
    now += 5_000;
    const r = submitAnswer(participationId, s.deliveryId, correctOptionFor(s.deliveryId));
    expect(r).toMatchObject({ isTimeout: false, timeBonus: true, combo: 1 });
  });

  it("오답이면 콤보가 0이 된다", () => {
    const { participationId } = joinQuiz(sampleSetId(), "학생1");
    const s1 = current(participationId);
    submitAnswer(participationId, s1.deliveryId, correctOptionFor(s1.deliveryId));
    const s2 = current(participationId);
    const r = submitAnswer(participationId, s2.deliveryId, wrongOptionFor(s2));
    expect(r.combo).toBe(0);
    expect(r.scoreUnits).toBe(0);
  });

  it("같은 답을 두 번 보내도 점수가 한 번만 반영된다", () => {
    const { participationId } = joinQuiz(sampleSetId(), "더블클릭");
    const s = current(participationId);
    const option = correctOptionFor(s.deliveryId);
    const first = submitAnswer(participationId, s.deliveryId, option);
    const second = submitAnswer(participationId, s.deliveryId, option);
    expect(second.totalUnits).toBe(first.totalUnits);
    expect(current(participationId).index).toBe(1);
  });

  it("다른 참여자의 문항에는 답할 수 없다", () => {
    const setId = sampleSetId();
    const a = joinQuiz(setId, "학생A").participationId;
    const b = joinQuiz(setId, "학생B").participationId;
    const s = current(a);
    expect(() => submitAnswer(b, s.deliveryId, s.options[0].id)).toThrowError(AppError);
  });

  it("목록에 없는 선택지는 거부된다", () => {
    const { participationId } = joinQuiz(sampleSetId(), "학생1");
    const s = current(participationId);
    expect(() => submitAnswer(participationId, s.deliveryId, "hacked")).toThrowError(/선택지/);
  });

  it("다 풀기 전에는 결과·오답 노트를 볼 수 없다", () => {
    const { participationId } = joinQuiz(sampleSetId(), "학생1");
    expect(() => getResult(participationId)).toThrowError(/다 풀지/);
    expect(() => getWrongNotes(participationId)).toThrowError(/다 풀지/);
  });
});

describe("오답 노트와 재도전", () => {
  /** 1라운드(원문제)만 모두 틀리게 푼다 → 12개 개념 모두 오답 노트에 들어간다. */
  function finishWithWrongOriginals(nickname: string) {
    const { participationId } = joinQuiz(sampleSetId(), nickname);
    playAll(participationId, (i) => i >= 12);
    return participationId;
  }

  it("오답이 개념별로 묶인다", () => {
    const p = finishWithWrongOriginals("복습이");
    const notes = getWrongNotes(p);
    expect(notes).toHaveLength(12);
    expect(notes.every((n) => n.items.length === 1 && n.status === "needs_review")).toBe(true);
    expect(notes[0].items[0].correctText).not.toBe("");
  });

  it("재도전은 틀린 문항과 다른 문항을 먼저 내고, 맞히면 극복 완료", () => {
    const p = finishWithWrongOriginals("복습이");
    const concept = getWrongNotes(p)[0];
    const wrongQuestionId = concept.items[0].questionId;

    const review = startReview(p, concept.conceptId);
    const reviewQuestionId = (
      getDb().prepare("SELECT question_id FROM question_deliveries WHERE id = ?").get(review.deliveryId) as {
        question_id: string;
      }
    ).question_id;
    expect(reviewQuestionId).not.toBe(wrongQuestionId);

    const result = submitReview(p, review.deliveryId, correctOptionFor(review.deliveryId));
    expect(result).toMatchObject({ isCorrect: true, status: "mastered", newlyMastered: true });
    expect(getResult(p).badgeCount).toBe(1);
  });

  it("재도전 점수는 최초 점수와 리더보드에 더해지지 않는다", () => {
    const p = finishWithWrongOriginals("복습이");
    const before = getResult(p).totalUnits;
    for (const concept of getWrongNotes(p)) {
      const review = startReview(p, concept.conceptId);
      submitReview(p, review.deliveryId, correctOptionFor(review.deliveryId));
    }
    expect(getResult(p).totalUnits).toBe(before);
    const setId = sampleSetId();
    expect(getLeaderboard(setId, p).entries[0].units).toBe(before);
  });

  it("배지는 한 번만 지급된다", () => {
    const p = finishWithWrongOriginals("복습이");
    const concept = getWrongNotes(p)[0];
    const r1 = startReview(p, concept.conceptId);
    submitReview(p, r1.deliveryId, correctOptionFor(r1.deliveryId));
    const r2 = startReview(p, concept.conceptId);
    const second = submitReview(p, r2.deliveryId, correctOptionFor(r2.deliveryId));
    expect(second.newlyMastered).toBe(false);
    expect(getResult(p).badgeCount).toBe(1);
  });

  it("재도전 선택지는 매번 새로 섞인 기록으로 나간다", () => {
    const p = finishWithWrongOriginals("복습이");
    const concept = getWrongNotes(p)[0];
    const r1 = startReview(p, concept.conceptId);
    submitReview(p, r1.deliveryId, wrongOptionFor(r1));
    const r2 = startReview(p, concept.conceptId);
    expect(r2.deliveryId).not.toBe(r1.deliveryId);
    expect(r2.streak).toBe(0);
  });

  it("오답 노트에 없는 개념은 재도전할 수 없다", () => {
    const { participationId } = joinQuiz(sampleSetId(), "만점이");
    playAll(participationId, () => true);
    const anyConcept = getResult(participationId).concepts[0].conceptId;
    expect(() => startReview(participationId, anyConcept)).toThrowError(AppError);
  });
});

describe("리더보드", () => {
  it("제출 완료자만, 최대 5명, 점수 내림차순", () => {
    const setId = sampleSetId();
    const ids: string[] = [];
    for (let n = 0; n < 7; n++) {
      const p = joinQuiz(setId, `학생${n}`).participationId;
      playAll(p, (i) => i < n * 5);
      ids.push(p);
    }
    joinQuiz(setId, "진행중"); // 제출 안 함

    const board = getLeaderboard(setId, ids[6]);
    expect(board.submittedCount).toBe(7);
    expect(board.entries).toHaveLength(5);
    expect(board.entries[0]).toMatchObject({ nickname: "학생6", rank: 1, isMe: true });
    const units = board.entries.map((e) => e.units);
    expect([...units].sort((a, b) => b - a)).toEqual(units);
    expect(board.entries.some((e) => e.nickname === "진행중")).toBe(false);
  });

  it("동형 0.5점이 리더보드에 반영된다", () => {
    const setId = sampleSetId();
    const p = joinQuiz(setId, "동형하나").participationId;
    playAll(p, (i) => i === 12);
    expect(getLeaderboard(setId, p).entries[0].units).toBe(1);
  });
});
