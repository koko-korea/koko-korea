"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ClientApiError, errorMessage } from "@/lib/client-api";
import type { WrongNoteConcept } from "@/lib/api-types";
import { buttonClass, Card, ErrorBox, Spinner } from "@/components/ui";
import { ReviewPanel } from "./review-panel";
import { SoundToggle } from "@/components/quiz/sound-toggle";
import { isSoundEnabled, setSoundEnabled } from "@/lib/sound";

export function NotesScreen({ setId }: { setId: string }) {
  const router = useRouter();
  const [notes, setNotes] = useState<WrongNoteConcept[] | null>(null);
  const [error, setError] = useState<{ message: string; home: boolean } | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [soundOn, setSoundOn] = useState(() => isSoundEnabled());

  function toggleSound() {
    const value = !soundOn;
    setSoundOn(value);
    setSoundEnabled(value);
    void api(`/api/play/${setId}/preferences`, { method: "PATCH", body: { soundEnabled: value } }).catch(() => {});
  }

  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<WrongNoteConcept[]>(`/api/play/${setId}/wrong-notes`).then(
      (data) => !cancelled && setNotes(data),
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
  if (!notes) return <Spinner label="오답 노트를 펼치는 중…" />;

  const mastered = notes.filter((n) => n.status === "mastered").length;

  function updateConcept(conceptId: string, patch: Partial<WrongNoteConcept>) {
    setNotes((prev) => prev?.map((n) => (n.conceptId === conceptId ? { ...n, ...patch } : n)) ?? prev);
  }

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/play/${setId}/result`} className="text-sm font-semibold text-muted underline">
            ← 결과로 돌아가기
          </Link>
          <SoundToggle on={soundOn} onToggle={toggleSound} />
        </div>
        <h1 className="text-3xl font-black">📝 오답 노트</h1>
        {notes.length > 0 ? (
          <p className="text-muted">
            틀린 개념 {notes.length}개 중 <strong className="text-primary">{mastered}개 극복!</strong> 재도전해서 🏅배지를
            모아 보세요.
          </p>
        ) : (
          <p className="text-muted">틀린 문제가 하나도 없어요. 완벽해요! 🎉</p>
        )}
      </header>

      {notes.map((concept) => (
        <Card key={concept.conceptId}>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-xl font-black">{concept.name}</h2>
            {concept.status === "mastered" ? (
              <span className="anim-badge rounded-full bg-primary-soft px-3 py-1 text-sm font-bold text-primary">
                🏅 극복 완료
              </span>
            ) : (
              <span className="rounded-full bg-warn-soft px-3 py-1 text-sm font-bold text-warn">📝 복습 필요</span>
            )}
          </div>
          {concept.threshold > 1 && concept.status !== "mastered" && (
            <p className="mt-1 text-sm text-muted">
              연속 {concept.threshold}번 맞히면 극복! (현재 {concept.streak}번)
            </p>
          )}

          <ul className="mt-4 flex flex-col gap-3">
            {concept.items.map((item) => (
              <li key={item.questionId} className="rounded-2xl bg-surface-2 p-4">
                <p className="font-semibold leading-relaxed">{item.body}</p>
                <dl className="mt-2 grid gap-1 text-sm">
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-bold text-bad">✗ 내 답</dt>
                    <dd>{item.selectedText}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="shrink-0 font-bold text-good">✓ 정답</dt>
                    <dd>{item.correctText}</dd>
                  </div>
                </dl>
                <p className="mt-2 text-sm leading-relaxed text-muted">💡 {item.explanation}</p>
              </li>
            ))}
          </ul>

          {reviewing === concept.conceptId ? (
            <ReviewPanel
              setId={setId}
              conceptId={concept.conceptId}
              onUpdate={(patch) => updateConcept(concept.conceptId, patch)}
              onClose={() => setReviewing(null)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setReviewing(concept.conceptId)}
              className={`${concept.status === "mastered" ? buttonClass.secondary : buttonClass.primary} mt-4 w-full`}
            >
              {concept.status === "mastered" ? "한 번 더 연습하기" : "🔁 다시 도전하기"}
            </button>
          )}
        </Card>
      ))}
    </div>
  );
}
