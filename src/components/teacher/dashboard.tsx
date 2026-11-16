"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { formatDateTime, isLoginRequired, STATUS_LABEL } from "@/lib/teacher-client";
import type { TeacherQuizSummary } from "@/lib/api-types";
import { buttonClass, Card, ErrorBox, Spinner } from "@/components/ui";

export function TeacherDashboard() {
  const router = useRouter();
  const [sets, setSets] = useState<TeacherQuizSummary[] | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<TeacherQuizSummary[]>("/api/teacher/quiz-sets").then(
      (data) => !cancelled && setSets(data),
      (e) => {
        if (cancelled) return;
        if (isLoginRequired(e)) router.replace("/teacher/login");
        else setError(errorMessage(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [router, reloadKey]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError("");
    try {
      const { id } = await api<{ id: string }>("/api/teacher/quiz-sets", { method: "POST", body: { title } });
      router.push(`/teacher/sets/${id}`);
    } catch (err) {
      if (isLoginRequired(err)) router.replace("/teacher/login");
      setCreateError(errorMessage(err));
      setCreating(false);
    }
  }

  if (error) {
    return (
      <ErrorBox
        message={error}
        onRetry={() => {
          setError("");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (!sets) return <Spinner />;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-black">퀴즈 세트</h1>

      <Card>
        <form onSubmit={create} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor="new-title" className="font-bold">
              새 퀴즈 세트 만들기
            </label>
            <input
              id="new-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={60}
              placeholder="예: 1단원 비유와 상징"
              className="min-h-12 rounded-2xl border-2 border-line bg-surface-2 px-4 outline-none focus:border-primary"
            />
          </div>
          <button type="submit" className={buttonClass.primary} disabled={creating}>
            {creating ? "만드는 중…" : "+ 만들기"}
          </button>
        </form>
        {createError && <p className="mt-2 text-sm font-semibold text-bad">{createError}</p>}
        <p className="mt-2 text-sm text-muted">12개 개념 × (원문제 1 + 동형 2) = 36문항 틀이 만들어져요. CSV로 한 번에 넣을 수도 있어요.</p>
      </Card>

      {sets.length === 0 ? (
        <p className="text-muted">아직 세트가 없어요.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sets.map((s) => {
            const status = STATUS_LABEL[s.status];
            return (
              <li key={s.id}>
                <Card className="flex h-full flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.text}</span>
                    {s.isSample && (
                      <span className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-bold text-warn">견본</span>
                    )}
                    <span className="ml-auto text-xs text-muted">{formatDateTime(s.updatedAt)} 수정</span>
                  </div>
                  <h2 className="text-lg font-black">{s.title}</h2>
                  <dl className="grid grid-cols-3 gap-2 text-center text-sm">
                    <div className="rounded-xl bg-surface-2 py-2">
                      <dt className="text-xs text-muted">참여 코드</dt>
                      <dd className="font-mono font-black">{s.joinCode}</dd>
                    </div>
                    <div className="rounded-xl bg-surface-2 py-2">
                      <dt className="text-xs text-muted">참여</dt>
                      <dd className="font-black">{s.participantCount}명</dd>
                    </div>
                    <div className="rounded-xl bg-surface-2 py-2">
                      <dt className="text-xs text-muted">제출 완료</dt>
                      <dd className="font-black">{s.submittedCount}명</dd>
                    </div>
                  </dl>
                  <div className="mt-auto flex gap-2">
                    <Link href={`/teacher/sets/${s.id}`} className={`${buttonClass.secondary} flex-1`}>
                      {s.status === "draft" ? "✏️ 편집" : "📄 문항 보기"}
                    </Link>
                    {s.status !== "draft" && (
                      <Link href={`/teacher/sets/${s.id}/analytics`} className={`${buttonClass.primary} flex-1`}>
                        📊 학급 분석
                      </Link>
                    )}
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
