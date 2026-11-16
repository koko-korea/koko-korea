import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDbForTests } from "@/server/db";
import { clock } from "@/server/clock";
import { AppError } from "@/server/errors";
import { emptyContent, type QuizContent } from "@/domain/quiz-content";
import { loginTeacher, logoutTeacher, verifyTeacherToken, TEACHER_SESSION_MS } from "@/server/teacher-auth";
import {
  createQuizSet,
  deleteParticipant,
  deleteQuizSetRecords,
  getAnalytics,
  getQuizSetDetail,
  listQuizSets,
  saveQuizContent,
  setParticipantHidden,
  setQuizStatus,
} from "@/server/teacher-service";
import {
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

let now = 1_700_000_000_000;

beforeEach(() => {
  resetDbForTests();
  now = 1_700_000_000_000;
  clock.now = () => now;
  process.env.TEACHER_PASSWORD = "선생님비번123";
});

afterEach(() => {
  resetDbForTests();
});

function fullContent(title = "1단원 퀴즈"): QuizContent {
  const c = emptyContent(title);
  c.concepts.forEach((concept, ci) => {
    concept.name = `개념${ci + 1}`;
    concept.questions.forEach((q, qi) => {
      q.body = `문제 ${ci + 1}-${qi + 1}`;
      q.options = ["가", "나", "다", "라"];
      q.answer = 2;
      q.explanation = "해설";
    });
  });
  return c;
}

function correctOptionFor(deliveryId: string): string {
  return (
    getDb()
      .prepare(
        "SELECT q.correct_option_id AS id FROM question_deliveries d JOIN questions q ON q.id = d.question_id WHERE d.id = ?",
      )
      .get(deliveryId) as { id: string }
  ).id;
}

/** 공개된 세트에서 한 명이 풀게 한다. answerFn(index)가 true면 정답. */
function play(setId: string, nickname: string, answerFn: (i: number) => boolean, count = 36) {
  const { participationId } = joinQuiz(setId, nickname);
  for (let i = 0; i < count; i++) {
    const s = getPlayState(participationId);
    if (s.status !== "in_progress") break;
    const correct = correctOptionFor(s.deliveryId);
    const pick = answerFn(s.index) ? correct : s.options.find((o) => o.id !== correct)!.id;
    submitAnswer(participationId, s.deliveryId, pick);
  }
  return participationId;
}

function publishedSet() {
  const id = createQuizSet("1단원 퀴즈");
  saveQuizContent(id, fullContent());
  setQuizStatus(id, "published");
  return id;
}

describe("교사 로그인", () => {
  it("맞는 비밀번호로 세션을 만들고, 로그아웃하면 무효", () => {
    const token = loginTeacher("선생님비번123");
    expect(verifyTeacherToken(token)).toBe(true);
    logoutTeacher(token);
    expect(verifyTeacherToken(token)).toBe(false);
  });
  it("틀린 비밀번호는 거부", () => {
    expect(() => loginTeacher("틀림")).toThrowError(/비밀번호/);
    expect(() => loginTeacher(undefined)).toThrowError(AppError);
  });
  it("세션은 12시간 뒤 만료", () => {
    const token = loginTeacher("선생님비번123");
    now += TEACHER_SESSION_MS + 1;
    expect(verifyTeacherToken(token)).toBe(false);
  });
  it("비밀번호가 설정되지 않으면 로그인 불가", () => {
    delete process.env.TEACHER_PASSWORD;
    expect(() => loginTeacher("아무거나")).toThrowError(/설정되지 않았/);
  });
  it("토큰 없거나 엉뚱하면 거부", () => {
    expect(verifyTeacherToken(undefined)).toBe(false);
    expect(verifyTeacherToken("nope")).toBe(false);
  });
});

describe("세트 만들기와 편집", () => {
  it("새 세트는 임시저장 상태, 6자리 참여 코드, 빈 12×3 문항", () => {
    const id = createQuizSet("  ");
    const detail = getQuizSetDetail(id);
    expect(detail.status).toBe("draft");
    expect(detail.joinCode).toMatch(/^[A-Z2-9]{6}$/);
    expect(detail.content.title).toBe("새 퀴즈 세트");
    expect(detail.content.concepts).toHaveLength(12);
    expect(detail.issues.length).toBeGreaterThan(0);
  });

  it("임시저장 세트는 학생이 참여 코드로 찾을 수 없다", () => {
    const id = createQuizSet("비공개");
    expect(findQuizByCode(getQuizSetDetail(id).joinCode)).toBeNull();
  });

  it("빈칸이 있어도 임시저장되고, 다시 불러오면 같은 내용", () => {
    const id = createQuizSet("세트");
    const content = fullContent("저장 테스트");
    content.concepts[3].questions[2].answer = null;
    content.masteryThreshold = 2;
    const saved = saveQuizContent(id, content);
    expect(saved.content).toEqual(content);
    expect(saved.issues.map((i) => i.path)).toEqual(["concepts.3.questions.2.answer"]);
  });

  it("빈칸이 남아 있으면 공개할 수 없다", () => {
    const id = createQuizSet("세트");
    expect(() => setQuizStatus(id, "published")).toThrowError(/채우지 않은 곳/);
  });

  it("모두 채우면 공개되고, 학생이 코드로 찾을 수 있다", () => {
    const id = publishedSet();
    const detail = getQuizSetDetail(id);
    expect(detail.status).toBe("published");
    expect(findQuizByCode(detail.joinCode)?.questionCount).toBe(36);
  });

  it("공개한 세트는 문항을 고칠 수 없다", () => {
    const id = publishedSet();
    expect(() => saveQuizContent(id, fullContent("수정"))).toThrowError(/고칠 수 없/);
  });

  it("공개된 세트를 학생이 끝까지 풀 수 있고 정답 번호가 지켜진다", () => {
    const id = publishedSet();
    const p = play(id, "학생", () => true);
    expect(getResult(p).totalUnits).toBe(48);
  });

  it("종료하면 신규 참여가 막히고, 다시 열 수 있다", () => {
    const id = publishedSet();
    setQuizStatus(id, "closed");
    expect(() => joinQuiz(id, "늦은학생")).toThrowError(/종료/);
    setQuizStatus(id, "published");
    expect(() => joinQuiz(id, "늦은학생")).not.toThrow();
  });

  it("참여자가 있으면 편집 상태로 되돌릴 수 없고, 기록 삭제 후에는 가능", () => {
    const id = publishedSet();
    joinQuiz(id, "학생");
    expect(() => setQuizStatus(id, "draft")).toThrowError(/참여 기록/);
    deleteQuizSetRecords(id);
    expect(setQuizStatus(id, "draft").status).toBe("draft");
  });

  it("공개 중이 아닌 세트는 종료할 수 없다", () => {
    const id = createQuizSet("세트");
    expect(() => setQuizStatus(id, "closed")).toThrowError(AppError);
  });

  it("목록에 견본과 새 세트, 참여자 수가 보인다", () => {
    const id = publishedSet();
    play(id, "완료생", () => true);
    joinQuiz(id, "진행생");
    const row = listQuizSets().find((s) => s.id === id)!;
    expect(row).toMatchObject({ participantCount: 2, submittedCount: 1, status: "published" });
    expect(listQuizSets().some((s) => s.isSample)).toBe(true);
  });
});

describe("학급 분석", () => {
  it("응답이 없으면 정답률은 '데이터 없음'(null)", () => {
    const id = publishedSet();
    const a = getAnalytics(id);
    expect(a.participantCount).toBe(0);
    expect(a.concepts.every((c) => c.rate === null && c.responses === 0)).toBe(true);
  });

  it("개념별 정답률 = 최초 풀이 정답 ÷ 제출 응답, 원문제·동형 따로도 계산", () => {
    const id = publishedSet();
    play(id, "학생가", () => true); // 36문항 모두 정답
    play(id, "학생나", (i) => i >= 12); // 원문제 12개 오답, 동형 정답
    const a = getAnalytics(id);
    expect(a.submittedCount).toBe(2);
    for (const c of a.concepts) {
      expect(c.responses).toBe(6);
      expect(c.correct).toBe(5);
      expect(c.rate).toBe(83.3);
      expect(c.originalRate).toBe(50);
      expect(c.variantRate).toBe(100);
    }
  });

  it("미제출 문항은 분모에서 빠진다(진행 중 학생)", () => {
    const id = publishedSet();
    play(id, "중간", () => false, 5); // 원문제 5개만 오답 제출
    const a = getAnalytics(id);
    const answered = a.concepts.filter((c) => c.responses > 0);
    expect(answered).toHaveLength(5);
    expect(answered.every((c) => c.rate === 0)).toBe(true);
    expect(a.concepts.filter((c) => c.rate === null)).toHaveLength(7);
    expect(a.participants[0]).toMatchObject({ nickname: "중간", status: "in_progress", answered: 5, total: 36 });
  });

  it("오답 노트 재도전 응답은 정답률에 포함되지 않는다", () => {
    const id = publishedSet();
    const p = play(id, "복습생", (i) => i >= 12);
    const before = getAnalytics(id).concepts[0];
    for (const concept of getWrongNotes(p)) {
      const r = startReview(p, concept.conceptId);
      submitReview(p, r.deliveryId, correctOptionFor(r.deliveryId));
    }
    expect(getAnalytics(id).concepts[0]).toEqual(before);
  });
});

describe("참여자 관리와 기록 삭제", () => {
  it("리더보드에서 숨기면 리더보드에서만 빠지고 분석에는 남는다", () => {
    const id = publishedSet();
    const p = play(id, "장난닉네임", () => true);
    setParticipantHidden(p, true);
    expect(getLeaderboard(id, null).entries).toHaveLength(0);
    const a = getAnalytics(id);
    expect(a.participants[0].hidden).toBe(true);
    expect(a.concepts[0].responses).toBe(3);
    setParticipantHidden(p, false);
    expect(getLeaderboard(id, null).entries).toHaveLength(1);
  });

  it("참여자 개별 삭제는 그 학생 기록만 지운다", () => {
    const id = publishedSet();
    const a = play(id, "학생A", () => true);
    play(id, "학생B", () => true);
    deleteParticipant(a);
    const analytics = getAnalytics(id);
    expect(analytics.participants.map((p) => p.nickname)).toEqual(["학생B"]);
    expect(analytics.concepts[0].responses).toBe(3);
    const leftovers = getDb()
      .prepare("SELECT COUNT(*) AS n FROM answer_attempts WHERE participation_id = ?")
      .get(a) as { n: number };
    expect(leftovers.n).toBe(0);
  });

  it("세트 기록 삭제는 그 세트의 모든 학생 기록을 지우고, 세트·문항과 다른 세트는 남긴다", () => {
    const id = publishedSet();
    const other = publishedSet();
    const p = play(id, "학생A", (i) => i >= 12);
    const r = startReview(p, getWrongNotes(p)[0].conceptId);
    submitReview(p, r.deliveryId, correctOptionFor(r.deliveryId));
    play(other, "다른반", () => true);

    expect(deleteQuizSetRecords(id)).toEqual({ deleted: 1 });

    const db = getDb();
    const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
    expect(count("SELECT COUNT(*) AS n FROM concept_mastery")).toBe(0);
    expect(count("SELECT COUNT(*) AS n FROM answer_attempts a JOIN participations p ON p.id = a.participation_id")).toBe(36);
    expect(getAnalytics(id).participantCount).toBe(0);
    expect(getLeaderboard(id, null).entries).toHaveLength(0);
    expect(getQuizSetDetail(id).content.concepts[0].name).toBe("개념1");
    expect(getAnalytics(other).participantCount).toBe(1);
    // 삭제 후 같은 닉네임으로 다시 참여할 수 있다
    expect(() => joinQuiz(id, "학생A")).not.toThrow();
  });

  it("없는 참여자는 404", () => {
    expect(() => deleteParticipant("nope")).toThrowError(AppError);
    expect(() => setParticipantHidden("nope", true)).toThrowError(AppError);
  });
});
