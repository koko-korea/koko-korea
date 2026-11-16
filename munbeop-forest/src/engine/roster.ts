// 교사 쪽 참여자 기록 (PRD 4장, 6장 화면 6, 8.1, v1.1)
// 모든 기록은 이 객체의 메모리에만 있다. 저장소에 쓰지 않는다.
import { POINTS_FIRST_TRY, POINTS_TWIN, TIME_LIMIT_MS } from "./quiz";
import { isValidName, parseStudentId, type Sex } from "./student";

export type RejectReason = "bad-sid" | "bad-name" | "already-joined" | "not-joined" | "already-done" | "bad-result";

export interface Participant {
  sid: string;
  name: string;
  sex: Sex;
  joinedAt: number;
  result: SubmittedResult | null;
}

export interface SubmittedResult {
  score: number;
  elapsedMs: number;
  /** [문제 은행 번호, 한 번에 맞혔는지] */
  stats: [number, boolean][];
}

export type RosterReply = { ok: true } | { ok: false; reason: RejectReason };

export interface RankedEntry {
  rank: number;
  sid: string;
  name: string;
  sex: Sex;
  score: number;
  elapsedMs: number;
}

export interface QuestionAccuracy {
  bankIndex: number;
  attempts: number;
  firstTryCorrect: number;
  /** 0~1 */
  rate: number;
}

export class Roster {
  private readonly participants = new Map<string, Participant>();

  /** @param bankSize 문제 은행 문항 수 — 결과 검증 상한 */
  constructor(private readonly bankSize: number) {}

  /** 접속 순간 학번을 잠근다 (v1.1). 완료 여부와 무관하게 두 번째 접속은 거부. */
  join(sid: string, name: string, sex: Sex, now: number): RosterReply {
    if (!parseStudentId(sid)) return { ok: false, reason: "bad-sid" };
    if (!isValidName(name)) return { ok: false, reason: "bad-name" };
    if (this.participants.has(sid)) return { ok: false, reason: "already-joined" };
    this.participants.set(sid, { sid, name: name.normalize("NFC"), sex, joinedAt: now, result: null });
    return { ok: true };
  }

  /** 교사의 ‘재입장 허용’: 잠금을 풀고 그 학생 기록을 지운다. */
  allowReentry(sid: string): boolean {
    return this.participants.delete(sid);
  }

  submit(sid: string, result: SubmittedResult): RosterReply {
    const participant = this.participants.get(sid);
    if (!participant) return { ok: false, reason: "not-joined" };
    if (participant.result) return { ok: false, reason: "already-done" };
    if (!this.isPlausible(result)) return { ok: false, reason: "bad-result" };
    participant.result = {
      score: result.score,
      elapsedMs: result.elapsedMs,
      stats: result.stats.map(([index, ok]) => [index, ok]),
    };
    return { ok: true };
  }

  /** 수업 종료: 모든 기록 삭제 */
  clear(): void {
    this.participants.clear();
  }

  /** 학번순 목록 */
  list(): Participant[] {
    return [...this.participants.values()].sort((a, b) => a.sid.localeCompare(b.sid));
  }

  counts(): { joined: number; done: number } {
    const all = [...this.participants.values()];
    return { joined: all.length, done: all.filter((p) => p.result).length };
  }

  /** 점수 높은 순 → 풀이 시간 짧은 순. 둘 다 같으면 같은 순위. */
  ranking(): RankedEntry[] {
    const done = [...this.participants.values()].flatMap((p) =>
      p.result
        ? [{ sid: p.sid, name: p.name, sex: p.sex, score: p.result.score, elapsedMs: p.result.elapsedMs }]
        : [],
    );
    done.sort((a, b) => b.score - a.score || a.elapsedMs - b.elapsedMs || a.sid.localeCompare(b.sid));
    return done.map((entry, i) => {
      let rank = i + 1;
      for (let j = i - 1; j >= 0; j--) {
        const prev = done[j]!;
        if (prev.score !== entry.score || prev.elapsedMs !== entry.elapsedMs) break;
        rank = j + 1;
      }
      return { rank, ...entry };
    });
  }

  /** 한 번에 맞힌 비율이 낮은 문제 (많이 틀린 문제) */
  hardestQuestions(limit = 5): QuestionAccuracy[] {
    const byIndex = new Map<number, QuestionAccuracy>();
    for (const p of this.participants.values()) {
      for (const [bankIndex, ok] of p.result?.stats ?? []) {
        const entry = byIndex.get(bankIndex) ?? { bankIndex, attempts: 0, firstTryCorrect: 0, rate: 0 };
        entry.attempts += 1;
        if (ok) entry.firstTryCorrect += 1;
        entry.rate = entry.firstTryCorrect / entry.attempts;
        byIndex.set(bankIndex, entry);
      }
    }
    return [...byIndex.values()]
      .sort((a, b) => a.rate - b.rate || b.attempts - a.attempts || a.bankIndex - b.bankIndex)
      .slice(0, limit);
  }

  /** 위조·오류 결과 거르기: 형식, 범위, 점수와 문항 기록의 일관성 */
  private isPlausible({ score, elapsedMs, stats }: SubmittedResult): boolean {
    if (!Array.isArray(stats) || stats.length === 0 || stats.length > this.bankSize) return false;
    const seen = new Set<number>();
    for (const entry of stats) {
      if (!Array.isArray(entry) || entry.length !== 2) return false;
      const [index, ok] = entry;
      if (!Number.isInteger(index) || index < 0 || index >= this.bankSize) return false;
      if (typeof ok !== "boolean" || seen.has(index)) return false;
      seen.add(index);
    }
    if (!Number.isFinite(score) || !Number.isInteger(score * 2)) return false;
    const firstTry = stats.filter(([, ok]) => ok).length;
    const minScore = firstTry * POINTS_FIRST_TRY;
    const maxScore = minScore + (stats.length - firstTry) * POINTS_TWIN;
    if (score < minScore || score > maxScore) return false;
    // 문제마다 원래 문제 + (틀렸으면) 동형 문제, 각각 최대 1분
    const maxElapsed = (firstTry + (stats.length - firstTry) * 2) * TIME_LIMIT_MS;
    return Number.isFinite(elapsedMs) && elapsedMs >= 0 && elapsedMs <= maxElapsed;
  }
}
