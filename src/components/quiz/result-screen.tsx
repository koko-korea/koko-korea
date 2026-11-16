"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ClientApiError, errorMessage } from "@/lib/client-api";
import { formatPoints } from "@/domain/scoring";
import type { ConceptSummary, ResultSummary } from "@/lib/api-types";
import { buttonClass, Card, ErrorBox, Spinner } from "@/components/ui";
import { Leaderboard } from "@/components/leaderboard/leaderboard";

const MASTERY_LABEL: Record<ConceptSummary["mastery"], { text: string; tone: string }> = {
  perfect: { text: "⭐ 모두 정답", tone: "bg-good-soft text-good" },
  mastered: { text: "🏅 극복 완료", tone: "bg-primary-soft text-primary" },
  needs_review: { text: "📝 복습 필요", tone: "bg-warn-soft text-warn" },
};

export function ResultScreen({ setId }: { setId: string }) {
  const router = useRouter();
  const [result, setResult] = useState<ResultSummary | null>(null);
  const [error, setError] = useState<{ message: string; home: boolean } | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<ResultSummary>(`/api/play/${setId}/result`).then(
      (data) => !cancelled && setResult(data),
      (e) => {
        if (cancelled) return;
        if (e instanceof ClientApiError && e.code === "NOT_FINISHED") {
          router.replace(`/play/${setId}`);
          return;
        }
        setError({ message: errorMessage(e), home: e instanceof ClientApiError && e.status === 401 });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [router, setId, reloadKey]);

  function retry() {
    setError(null);
    setReloadKey((k) => k + 1);
  }

  if (error) return <ErrorBox message={error.message} onRetry={error.home ? undefined : retry} showHome={error.home} />;
  if (!result) return <Spinner label="결과를 계산하는 중…" />;

  const needsReview = result.concepts.filter((c) => c.mastery === "needs_review").length;

  return (
    <div className="flex flex-col gap-5">
      <Card className="text-center">
        <p className="text-sm font-semibold text-muted">{result.nickname} 님의 결과</p>
        <p className="anim-pop mt-2 text-6xl font-black text-primary">
          {formatPoints(result.totalUnits)}
          <span className="text-2xl text-muted"> / {formatPoints(result.maxUnits)}점</span>
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <Metric label="⭕ 정답" value={result.correctCount} />
          <Metric label="❌ 오답" value={result.wrongCount} />
          <Metric label="⏰ 시간 초과" value={result.timeoutCount} />
          <Metric label="🔥 최대 콤보" value={result.maxCombo} />
        </dl>
        {result.badgeCount > 0 && (
          <p className="mt-4 font-bold text-primary">🏅 극복 배지 {result.badgeCount}개 획득!</p>
        )}
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Link href={`/play/${setId}/notes`} className={buttonClass.primary}>
            📝 오답 노트 {needsReview > 0 ? `(${needsReview}개 개념)` : ""}
          </Link>
          <Link href="/" className={buttonClass.secondary}>
            처음으로
          </Link>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-xl font-black">개념별 결과</h2>
        <ul className="flex flex-col gap-2">
          {result.concepts.map((c) => {
            const label = MASTERY_LABEL[c.mastery];
            return (
              <li key={c.conceptId} className="flex items-center gap-3 rounded-2xl bg-surface-2 px-4 py-3">
                <span className="flex-1 font-semibold">{c.name}</span>
                <span className="font-mono text-sm">
                  {c.correct}/{c.total}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${label.tone}`}>{label.text}</span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Leaderboard setId={setId} />
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-surface-2 px-2 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-2xl font-black">{value}</dd>
    </div>
  );
}
