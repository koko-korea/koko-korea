/**
 * 리더보드 규칙 (FR-020, 12.3, D-10)
 * - 최초 풀이 가중 총점(units) 내림차순
 * - 동점은 공동 순위(1, 1, 3 ...), 표시 순서는 닉네임 순으로 고정
 * - 최대 5명만 반환
 */
export interface LeaderboardInput {
  participationId: string;
  nickname: string;
  units: number;
}

export interface LeaderboardRow extends LeaderboardInput {
  rank: number;
}

export const LEADERBOARD_SIZE = 5;

export function rankLeaderboard(
  entries: readonly LeaderboardInput[],
  limit: number = LEADERBOARD_SIZE,
): LeaderboardRow[] {
  const sorted = [...entries].sort(
    (a, b) => b.units - a.units || a.nickname.localeCompare(b.nickname, "ko"),
  );
  const rows: LeaderboardRow[] = [];
  sorted.forEach((entry, i) => {
    const rank = i > 0 && sorted[i - 1].units === entry.units ? rows[i - 1].rank : i + 1;
    rows.push({ ...entry, rank });
  });
  return rows.slice(0, limit);
}
