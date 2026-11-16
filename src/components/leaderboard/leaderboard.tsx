"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { formatPoints } from "@/domain/scoring";
import type { LeaderboardData } from "@/lib/api-types";
import { Card } from "@/components/ui";

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

/** 상위 5명 리더보드 (FR-020). 동점은 공동 순위로 표시한다. */
export function Leaderboard({ setId }: { setId: string }) {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [error, setError] = useState("");

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<LeaderboardData>(`/api/quiz-sets/${setId}/leaderboard`).then(
      (d) => {
        if (cancelled) return;
        setData(d);
        setError("");
      },
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [setId, reloadKey]);

  const hasTie = data ? new Set(data.entries.map((e) => e.rank)).size < data.entries.length : false;

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-xl font-black">🏆 리더보드 TOP 5</h2>
        <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="text-sm font-semibold text-primary underline">
          새로고침
        </button>
      </div>
      {error && <p className="text-bad">{error}</p>}
      {!data && !error && <p className="text-muted">불러오는 중…</p>}
      {data && data.entries.length === 0 && <p className="text-muted">아직 제출한 친구가 없어요.</p>}
      {data && data.entries.length > 0 && (
        <ol className="flex flex-col gap-2">
          {data.entries.map((e) => (
            <li
              key={`${e.rank}-${e.nickname}`}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 ${
                e.isMe ? "border-2 border-primary bg-primary-soft" : "bg-surface-2"
              }`}
            >
              <span className="w-10 text-center text-lg font-black">{MEDALS[e.rank] ?? `${e.rank}위`}</span>
              <span className="flex-1 truncate font-semibold">
                {e.nickname}
                {e.isMe && <span className="ml-2 text-sm text-primary">(나)</span>}
              </span>
              <span className="font-mono font-black">{formatPoints(e.units)}점</span>
            </li>
          ))}
        </ol>
      )}
      {data && (
        <p className="mt-3 text-xs text-muted">
          제출 완료 {data.submittedCount}명 중 상위 5명만 보여요.{hasTie && " 같은 점수는 공동 순위예요."}
        </p>
      )}
    </Card>
  );
}
