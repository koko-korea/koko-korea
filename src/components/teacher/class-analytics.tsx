"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { formatDateTime, isLoginRequired, STATUS_LABEL } from "@/lib/teacher-client";
import { formatPoints } from "@/domain/scoring";
import type { ConceptAccuracy, TeacherAnalytics } from "@/lib/api-types";
import { Card, ErrorBox, Spinner } from "@/components/ui";
import { JoinInfo } from "./join-info";

const AUTO_REFRESH_MS = 10_000;
/** 이 정답률 미만이면 '취약 개념'으로 표시한다(아이콘 + 글자, 색만으로 구분하지 않음). */
const WEAK_RATE = 60;

export function ClassAnalytics({ id }: { id: string }) {
  const router = useRouter();
  const [data, setData] = useState<TeacherAnalytics | null>(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [auto, setAuto] = useState(true);
  const [sortWeak, setSortWeak] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<TeacherAnalytics>(`/api/teacher/quiz-sets/${id}/analytics`).then(
      (d) => {
        if (cancelled) return;
        setData(d);
        setError("");
      },
      (e) => {
        if (cancelled) return;
        if (isLoginRequired(e)) router.replace("/teacher/login");
        else setError(errorMessage(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, router, reloadKey]);

  // 수업 중 진행 상황을 보도록 10초마다 새로고침(화면이 보일 때만)
  useEffect(() => {
    if (!auto) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") setReloadKey((k) => k + 1);
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [auto]);

  const refresh = () => setReloadKey((k) => k + 1);

  async function mutate(run: () => Promise<unknown>, done: string) {
    setBusy(true);
    setNotice("");
    try {
      await run();
      setNotice(done);
      refresh();
    } catch (e) {
      if (isLoginRequired(e)) router.replace("/teacher/login");
      setNotice(`⚠️ ${errorMessage(e)}`);
    } finally {
      setBusy(false);
    }
  }

  function deleteAll() {
    if (!data) return;
    const typed = window.prompt(
      `'${data.quiz.title}'의 학생 기록 ${data.participantCount}명분을 영구 삭제합니다.\n` +
        "풀이 응답, 점수, 오답 노트, 극복 배지, 리더보드가 모두 지워지고 되돌릴 수 없어요.\n" +
        "퀴즈 세트와 문항은 남아요.\n\n계속하려면 '삭제'라고 입력해 주세요.",
    );
    if (typed?.trim() !== "삭제") return;
    void mutate(() => api(`/api/teacher/quiz-sets/${id}/records`, { method: "DELETE" }), "학생 기록을 모두 삭제했어요.");
  }

  if (error && !data) {
    return (
      <ErrorBox
        message={error}
        onRetry={() => {
          setError("");
          refresh();
        }}
      />
    );
  }
  if (!data) return <Spinner label="학급 기록을 모으는 중…" />;

  const status = STATUS_LABEL[data.quiz.status];
  const concepts = sortWeak
    ? [...data.concepts].sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101))
    : data.concepts;
  const weakCount = data.concepts.filter((c) => c.rate !== null && c.rate < WEAK_RATE).length;

  return (
    <div className="flex flex-col gap-5">
      <Link href={`/teacher/sets/${id}`} className="text-sm font-semibold text-muted underline">
        ← 세트 편집 화면
      </Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-black sm:text-3xl">{data.quiz.title}</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.text}</span>
        <label className="ml-auto flex items-center gap-2 text-sm">
          <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4" />
          10초마다 자동 새로고침
        </label>
        <button type="button" onClick={refresh} className="text-sm font-semibold text-primary underline">
          지금 새로고침
        </button>
      </div>
      {error && <p className="text-sm text-bad">⚠️ 새로고침 실패: {error}</p>}

      {data.quiz.status === "published" && <JoinInfo code={data.quiz.joinCode} />}

      {/* 제출 현황 요약 (FR-041) */}
      <dl className="grid grid-cols-3 gap-3">
        <Tile label="참여자" value={data.participantCount} />
        <Tile label="진행 중" value={data.inProgressCount} />
        <Tile label="제출 완료" value={data.submittedCount} />
      </dl>

      {/* 개념별 정답률 (FR-040) */}
      <Card>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-black">개념별 정답률</h2>
          <div className="ml-auto flex rounded-full border border-line p-0.5 text-sm" role="group" aria-label="정렬">
            <button
              type="button"
              aria-pressed={!sortWeak}
              onClick={() => setSortWeak(false)}
              className={`rounded-full px-3 py-1 ${!sortWeak ? "bg-primary text-primary-ink" : ""}`}
            >
              개념 순서
            </button>
            <button
              type="button"
              aria-pressed={sortWeak}
              onClick={() => setSortWeak(true)}
              className={`rounded-full px-3 py-1 ${sortWeak ? "bg-primary text-primary-ink" : ""}`}
            >
              취약한 순
            </button>
          </div>
        </div>
        <p className="mb-4 text-sm text-muted">
          최초 풀이 기준(오답 노트 재도전 제외).{" "}
          {weakCount > 0 ? `⚠ 정답률 ${WEAK_RATE}% 미만 개념이 ${weakCount}개 있어요.` : ""}
        </p>
        <ul className="flex flex-col gap-3">
          {concepts.map((c) => (
            <ConceptBar key={c.conceptId} concept={c} />
          ))}
        </ul>
      </Card>

      {/* 참여자 목록 (FR-041, FR-043) */}
      <Card>
        <h2 className="mb-3 text-xl font-black">참여자 {data.participantCount}명</h2>
        {notice && (
          <p role="status" className="mb-3 rounded-xl bg-surface-2 p-3 text-sm font-semibold">
            {notice}
          </p>
        )}
        {data.participants.length === 0 ? (
          <p className="text-muted">아직 참여한 학생이 없어요.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-2 pr-2 font-semibold">닉네임</th>
                  <th className="py-2 pr-2 font-semibold">상태</th>
                  <th className="py-2 pr-2 font-semibold">진행</th>
                  <th className="py-2 pr-2 text-right font-semibold">점수</th>
                  <th className="py-2 pr-2 font-semibold">마지막 활동</th>
                  <th className="py-2 font-semibold">
                    <span className="sr-only">관리</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.participants.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0">
                    <td className="py-2 pr-2 font-semibold">
                      {p.nickname}
                      {p.hidden && <span className="ml-1 text-xs text-muted">(리더보드 숨김)</span>}
                    </td>
                    <td className="py-2 pr-2">{p.status === "submitted" ? "✅ 제출 완료" : "⏳ 진행 중"}</td>
                    <td className="py-2 pr-2 font-mono">
                      {p.answered}/{p.total}
                    </td>
                    <td className="py-2 pr-2 text-right font-mono">{formatPoints(p.units)}점</td>
                    <td className="py-2 pr-2 text-muted">{formatDateTime(p.lastActivityAt)}</td>
                    <td className="py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void mutate(
                              () => api(`/api/teacher/participations/${p.id}`, { method: "PATCH", body: { hidden: !p.hidden } }),
                              p.hidden ? `'${p.nickname}'을(를) 리더보드에 다시 보여요.` : `'${p.nickname}'을(를) 리더보드에서 숨겼어요.`,
                            )
                          }
                          className="rounded-lg border border-line px-2 py-1 font-semibold"
                        >
                          {p.hidden ? "보이기" : "숨기기"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            if (!window.confirm(`'${p.nickname}'의 풀이 기록을 영구 삭제할까요? 정답률 분석에서도 빠져요.`)) return;
                            void mutate(
                              () => api(`/api/teacher/participations/${p.id}`, { method: "DELETE" }),
                              `'${p.nickname}'의 기록을 삭제했어요.`,
                            );
                          }}
                          className="rounded-lg border border-bad px-2 py-1 font-semibold text-bad"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* 리더보드 (FR-020) */}
      <Card>
        <h2 className="mb-3 text-xl font-black">🏆 리더보드 TOP 5</h2>
        {data.leaderboard.length === 0 ? (
          <p className="text-muted">아직 제출한 학생이 없어요.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {data.leaderboard.map((e) => (
              <li key={`${e.rank}-${e.nickname}`} className="flex items-center gap-3 rounded-xl bg-surface-2 px-4 py-2">
                <span className="w-10 font-black">{e.rank}위</span>
                <span className="flex-1 font-semibold">{e.nickname}</span>
                <span className="font-mono font-black">{formatPoints(e.units)}점</span>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {/* 기록 삭제 (FR-042) */}
      <Card className="border-bad">
        <h2 className="text-lg font-black text-bad">학생 기록 삭제</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          이 세트의 풀이 응답, 점수, 오답 노트, 극복 배지, 리더보드를 모두 영구 삭제해요. 퀴즈 세트와 문항은 남아요. 되돌릴 수
          없어요.
        </p>
        <button
          type="button"
          onClick={deleteAll}
          disabled={busy || data.participantCount === 0}
          className="mt-3 inline-flex min-h-12 items-center rounded-2xl border-2 border-bad px-5 font-bold text-bad disabled:opacity-50"
        >
          🗑 학생 기록 모두 삭제
        </button>
      </Card>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-3 py-4 text-center">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="text-3xl font-black">{value}명</dd>
    </div>
  );
}

/** 한 개념의 정답률 막대: 한 가지 색(크기), 값은 막대 옆에 글자로, 취약은 아이콘+글자로 표시 */
function ConceptBar({ concept }: { concept: ConceptAccuracy }) {
  const noData = concept.rate === null;
  const weak = !noData && concept.rate! < WEAK_RATE;
  const detail = noData
    ? "아직 제출된 응답이 없어요"
    : `정답 ${concept.correct} / 응답 ${concept.responses} · 원문제 ${concept.originalRate ?? "-"}% · 동형 ${concept.variantRate ?? "-"}%`;
  return (
    <li title={`${concept.name}: ${noData ? "데이터 없음" : `${concept.rate}%`} (${detail})`}>
      <div className="mb-1 flex items-baseline gap-2">
        <span className="font-semibold">{concept.name}</span>
        {weak && <span className="text-xs font-bold text-warn">⚠ 취약</span>}
        <span className="ml-auto font-mono font-black">{noData ? "데이터 없음" : `${concept.rate}%`}</span>
      </div>
      <div className="h-2.5 rounded-full bg-surface-2" aria-hidden>
        {!noData && (
          <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(concept.rate!, 1)}%` }} />
        )}
      </div>
      <p className="mt-1 text-xs text-muted">{detail}</p>
    </li>
  );
}
