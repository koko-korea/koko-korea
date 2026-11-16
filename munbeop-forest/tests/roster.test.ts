import { describe, expect, it } from "vitest";
import { Roster } from "../src/engine/roster";
import { describeStudentId, isValidName, parseStudentId } from "../src/engine/student";

describe("학번·이름", () => {
  it("2101 → 2학년 1반 1번", () => {
    expect(describeStudentId("2101")).toBe("2학년 1반 1번");
    expect(parseStudentId("2125")).toEqual({ grade: 2, classNo: 1, number: 25 });
  });

  it("형식이 틀린 학번은 거부", () => {
    for (const bad of ["210", "21011", "2100", "2001", "abcd", "4101"]) {
      expect(parseStudentId(bad)).toBeNull();
    }
  });

  it("이름은 한글 2~5자", () => {
    expect(isValidName("김하늘")).toBe(true);
    expect(isValidName("김")).toBe(false);
    expect(isValidName("남궁하늘빛나")).toBe(false);
    expect(isValidName("Kim")).toBe(false);
  });
});

describe("학번 잠금 (v1.1, 수용 기준 1)", () => {
  it("접속 순간 잠겨서, 끝내기 전이라도 같은 학번은 다시 못 들어온다", () => {
    const roster = new Roster(50);
    expect(roster.join("2101", "김하늘", "f", 0)).toEqual({ ok: true });
    expect(roster.join("2101", "김하늘", "f", 1)).toEqual({ ok: false, reason: "already-joined" });
  });

  it("교사가 ‘재입장 허용’을 누르면 기록이 지워지고 다시 들어올 수 있다", () => {
    const roster = new Roster(50);
    roster.join("2101", "김하늘", "f", 0);
    roster.submit("2101", { score: 1, elapsedMs: 5_000, stats: [[0, true]] });
    expect(roster.allowReentry("2101")).toBe(true);
    expect(roster.counts()).toEqual({ joined: 0, done: 0 });
    expect(roster.join("2101", "김하늘", "f", 10)).toEqual({ ok: true });
  });

  it("학번·이름 형식 오류는 거부", () => {
    const roster = new Roster(50);
    expect(roster.join("21", "김하늘", "f", 0)).toEqual({ ok: false, reason: "bad-sid" });
    expect(roster.join("2101", "K", "f", 0)).toEqual({ ok: false, reason: "bad-name" });
  });
});

describe("결과 받기", () => {
  it("접속하지 않았거나 이미 완료한 학번의 결과는 거부", () => {
    const roster = new Roster(50);
    const result = { score: 1, elapsedMs: 1_000, stats: [[0, true]] as [number, boolean][] };
    expect(roster.submit("2101", result)).toEqual({ ok: false, reason: "not-joined" });
    roster.join("2101", "김하늘", "f", 0);
    expect(roster.submit("2101", result)).toEqual({ ok: true });
    expect(roster.submit("2101", result)).toEqual({ ok: false, reason: "already-done" });
  });

  it("점수와 문항 기록이 맞지 않으면 거부", () => {
    const roster = new Roster(50);
    roster.join("2101", "김하늘", "f", 0);
    const stats: [number, boolean][] = [
      [0, true],
      [1, false],
    ];
    // 가능한 점수: 1 또는 1.5
    expect(roster.submit("2101", { score: 2, elapsedMs: 1_000, stats })).toMatchObject({ reason: "bad-result" });
    expect(roster.submit("2101", { score: 0.5, elapsedMs: 1_000, stats })).toMatchObject({ reason: "bad-result" });
    expect(roster.submit("2101", { score: 1.25, elapsedMs: 1_000, stats })).toMatchObject({ reason: "bad-result" });
    // 시간 상한: 1문제(1분) + 틀린 1문제(원래+동형 2분) = 3분
    expect(roster.submit("2101", { score: 1, elapsedMs: 180_001, stats })).toMatchObject({ reason: "bad-result" });
    // 은행 밖 번호, 중복 번호
    expect(roster.submit("2101", { score: 1, elapsedMs: 1, stats: [[50, true]] })).toMatchObject({ reason: "bad-result" });
    expect(
      roster.submit("2101", {
        score: 2,
        elapsedMs: 1,
        stats: [
          [3, true],
          [3, true],
        ],
      }),
    ).toMatchObject({ reason: "bad-result" });
    expect(roster.submit("2101", { score: 1.5, elapsedMs: 180_000, stats })).toEqual({ ok: true });
  });
});

describe("순위·많이 틀린 문제 (수용 기준 4·7)", () => {
  function setup() {
    const roster = new Roster(50);
    const add = (sid: string, name: string, score: number, elapsedMs: number, stats: [number, boolean][]) => {
      roster.join(sid, name, "m", 0);
      roster.submit(sid, { score, elapsedMs, stats });
    };
    add("2101", "가나다", 1, 50_000, [[0, true], [1, false]]);
    add("2102", "라마바", 2, 90_000, [[0, true], [1, true]]);
    add("2103", "사아자", 2, 40_000, [[0, true], [1, true]]);
    add("2104", "차카타", 1, 50_000, [[0, true], [1, false]]);
    roster.join("2105", "파하가", "f", 0); // 푸는 중
    return roster;
  }

  it("점수 높은 순 → 풀이 시간 짧은 순, 완전히 같으면 같은 순위", () => {
    const ranking = setup().ranking();
    expect(ranking.map((r) => [r.rank, r.sid])).toEqual([
      [1, "2103"],
      [2, "2102"],
      [3, "2101"],
      [3, "2104"],
    ]);
  });

  it("참여 현황: 학번순, 접속·완료 수", () => {
    const roster = setup();
    expect(roster.list().map((p) => p.sid)).toEqual(["2101", "2102", "2103", "2104", "2105"]);
    expect(roster.counts()).toEqual({ joined: 5, done: 4 });
  });

  it("한 번에 맞힌 비율이 낮은 문제부터", () => {
    const hardest = setup().hardestQuestions();
    expect(hardest[0]).toEqual({ bankIndex: 1, attempts: 4, firstTryCorrect: 2, rate: 0.5 });
    expect(hardest[1]).toMatchObject({ bankIndex: 0, rate: 1 });
  });

  it("수업 종료하면 모두 지워진다 (수용 기준 9)", () => {
    const roster = setup();
    roster.clear();
    expect(roster.list()).toEqual([]);
    expect(roster.ranking()).toEqual([]);
  });
});
