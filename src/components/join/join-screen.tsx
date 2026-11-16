"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { sfx } from "@/lib/sound";
import type { JoinInfo } from "@/lib/api-types";
import { NICKNAME_MAX, NICKNAME_MIN } from "@/domain/nickname";
import { buttonClass, Card, ErrorBox, Spinner } from "@/components/ui";

export function JoinScreen({ code }: { code: string }) {
  const router = useRouter();
  const [info, setInfo] = useState<JoinInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [nickname, setNickname] = useState("");
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<JoinInfo>(`/api/join/${encodeURIComponent(code)}`).then(
      (data) => !cancelled && setInfo(data),
      (e) => !cancelled && setLoadError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [code, reloadKey]);

  function retry() {
    setLoadError("");
    setReloadKey((k) => k + 1);
  }

  if (loadError) return <ErrorBox message={loadError} onRetry={retry} showHome />;
  if (!info) return <Spinner />;

  const { quiz, existing } = info;
  const playUrl = `/play/${quiz.id}`;

  async function join(e: React.FormEvent) {
    e.preventDefault();
    sfx.unlock();
    setSubmitting(true);
    setFormError("");
    try {
      await api(`/api/quiz-sets/${quiz.id}/participations`, { method: "POST", body: { nickname } });
      router.push(playUrl);
    } catch (err) {
      setFormError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="text-center">
        {quiz.isSample && (
          <span className="inline-block rounded-full bg-warn-soft px-3 py-1 text-xs font-bold text-warn">
            견본 퀴즈 · 교사 검수 전
          </span>
        )}
        <h1 className="mt-2 text-2xl font-black sm:text-3xl">{quiz.title}</h1>
        <ul className="mt-3 flex flex-wrap justify-center gap-2 text-sm text-muted">
          <li className="rounded-full bg-surface-2 px-3 py-1">개념 {quiz.conceptCount}개</li>
          <li className="rounded-full bg-surface-2 px-3 py-1">문제 {quiz.questionCount}개</li>
          <li className="rounded-full bg-surface-2 px-3 py-1">문제당 {quiz.timeLimitSeconds}초</li>
        </ul>
      </header>

      {quiz.status === "closed" && !existing && <ErrorBox message="종료된 퀴즈예요." showHome />}

      {existing ? (
        <Card className="text-center">
          <p className="text-lg">
            <strong>{existing.nickname}</strong> 님, 다시 오셨네요!
          </p>
          <div className="mt-4 flex flex-col gap-2">
            {existing.status === "in_progress" ? (
              <Link href={playUrl} className={buttonClass.primary} onClick={() => sfx.unlock()}>
                이어서 풀기 ▶
              </Link>
            ) : (
              <>
                <Link href={`${playUrl}/result`} className={buttonClass.primary}>
                  내 결과 보기
                </Link>
                <Link href={`${playUrl}/notes`} className={buttonClass.secondary}>
                  오답 노트
                </Link>
              </>
            )}
          </div>
        </Card>
      ) : (
        quiz.status === "published" && (
          <Card>
            <form onSubmit={join} className="flex flex-col gap-3" noValidate>
              <label htmlFor="nickname" className="text-lg font-bold">
                닉네임
              </label>
              <input
                id="nickname"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  setFormError("");
                }}
                maxLength={NICKNAME_MAX + 4}
                autoComplete="off"
                placeholder="리더보드에 보일 이름"
                aria-invalid={Boolean(formError)}
                aria-describedby="nickname-help"
                className="min-h-14 rounded-2xl border-2 border-line bg-surface-2 px-4 text-lg outline-none focus:border-primary"
              />
              <p id="nickname-help" className="text-sm text-muted">
                {NICKNAME_MIN}~{NICKNAME_MAX}자. 실명이나 학번은 쓰지 마세요.
              </p>
              {formError && (
                <p role="alert" className="text-sm font-semibold text-bad">
                  {formError}
                </p>
              )}
              <button type="submit" className={buttonClass.primary} disabled={submitting}>
                {submitting ? "입장 중…" : "퀴즈 시작! 🚀"}
              </button>
            </form>
          </Card>
        )
      )}

      <section className="rounded-3xl bg-surface-2 p-5 text-sm leading-relaxed text-muted">
        <h2 className="mb-2 font-bold text-ink">게임 방법</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>1라운드는 원문제(1점), 2·3라운드는 동형 문제(0.5점)예요.</li>
          <li>시간 안에 맞히면 ⚡보너스 연출! 시간이 지나도 감점은 없고 계속 풀 수 있어요.</li>
          <li>연속으로 맞히면 🔥콤보가 쌓여요.</li>
          <li>틀린 개념은 오답 노트에서 다시 도전해 🏅배지를 받으세요.</li>
        </ul>
      </section>
    </div>
  );
}
