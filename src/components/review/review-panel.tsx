"use client";

import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { sfx } from "@/lib/sound";
import type { ReviewQuestion, ReviewResult, WrongNoteConcept } from "@/lib/api-types";
import { buttonClass } from "@/components/ui";
import { OptionList } from "@/components/quiz/option-list";

/** 개념 재도전: 기존 문항을 다시 쓰고 선택지는 매번 새로 섞인다. 타이머는 없다. */
export function ReviewPanel({
  setId,
  conceptId,
  onUpdate,
  onClose,
}: {
  setId: string;
  conceptId: string;
  onUpdate: (patch: Partial<WrongNoteConcept>) => void;
  onClose: () => void;
}) {
  const [question, setQuestion] = useState<ReviewQuestion | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<ReviewQuestion>(`/api/play/${setId}/review`, { method: "POST", body: { conceptId } }).then(
      (q) => !cancelled && setQuestion(q),
      (e) => !cancelled && setError(errorMessage(e)),
    );
    return () => {
      cancelled = true;
    };
  }, [setId, conceptId, attempt]);

  /** 다른 문제로 다시 도전: 화면을 비우고 새 문제를 받는다. */
  function start() {
    setError("");
    setResult(null);
    setSelected(null);
    setQuestion(null);
    setAttempt((a) => a + 1);
  }

  async function answer(optionId: string) {
    if (!question || result || busy) return;
    sfx.unlock();
    setBusy(true);
    setSelected(optionId);
    setError("");
    try {
      const r = await api<ReviewResult>(`/api/play/${setId}/review/answer`, {
        method: "POST",
        body: { deliveryId: question.deliveryId, optionId },
      });
      setResult(r);
      onUpdate({ status: r.status, streak: r.streak });
      if (r.newlyMastered) sfx.badge();
      else if (r.isCorrect) sfx.correct();
      else sfx.wrong();
    } catch (e) {
      setSelected(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="anim-rise mt-4 rounded-2xl border-2 border-primary p-4" aria-live="polite">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-black text-primary">🔁 재도전</h3>
        <button type="button" onClick={onClose} className="text-sm font-semibold text-muted underline">
          닫기
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-3 rounded-xl bg-bad-soft p-3 text-sm font-semibold text-bad">
          {error}
          {!question && (
            <button type="button" onClick={start} className="ml-2 underline">
              다시 시도
            </button>
          )}
        </div>
      )}
      {!question && !error && <p className="text-muted">문제를 준비하는 중…</p>}

      {question && (
        <>
          <p className="mb-4 text-lg leading-relaxed font-bold">{question.body}</p>
          <OptionList
            options={question.options}
            onPick={(id) => void answer(id)}
            disabled={busy || result !== null}
            selectedId={selected}
            correctId={result?.correctOptionId ?? null}
          />
        </>
      )}

      {result && (
        <div className="mt-4 flex flex-col gap-3">
          {result.newlyMastered ? (
            <div className="rounded-2xl bg-primary-soft p-4 text-center">
              <p className="anim-badge text-5xl" aria-hidden>
                🏅
              </p>
              <p className="mt-2 text-xl font-black text-primary">개념 극복 완료! 배지를 받았어요!</p>
            </div>
          ) : (
            <p
              className={`rounded-2xl p-3 text-center font-black ${
                result.isCorrect ? "bg-good-soft text-good" : "bg-bad-soft text-bad"
              }`}
            >
              {result.isCorrect ? "⭕ 정답이에요!" : "❌ 다시 한번 생각해 봐요"}
              {result.status !== "mastered" && result.threshold > 1 && (
                <span className="block text-sm font-semibold">
                  연속 정답 {result.streak} / {result.threshold}
                </span>
              )}
            </p>
          )}
          <p className="text-sm leading-relaxed text-muted">💡 {result.explanation}</p>
          <div className="flex gap-2">
            {(!result.isCorrect || result.status !== "mastered") && (
              <button type="button" onClick={start} className={`${buttonClass.primary} flex-1`}>
                다른 문제로 다시 도전
              </button>
            )}
            <button type="button" onClick={onClose} className={`${buttonClass.secondary} flex-1`}>
              닫기
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
