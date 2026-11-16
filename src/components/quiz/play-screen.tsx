"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ClientApiError, errorMessage } from "@/lib/client-api";
import { setSoundEnabled, sfx } from "@/lib/sound";
import { formatPoints } from "@/domain/scoring";
import type { AnswerResult, PlayState, PlayStateInProgress } from "@/lib/api-types";
import { buttonClass, Card, ErrorBox, Spinner } from "@/components/ui";
import { OptionList } from "./option-list";
import { SoundToggle } from "./sound-toggle";
import { useCountdown } from "./use-countdown";

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string; noParticipation: boolean }
  | { kind: "playing"; state: PlayStateInProgress; clockOffset: number }
  | { kind: "feedback"; state: PlayStateInProgress; clockOffset: number; selected: string; result: AnswerResult };

const ROUND_LABEL: Record<number, string> = { 1: "원문제", 2: "동형 문제 1", 3: "동형 문제 2" };

export function PlayScreen({ setId }: { setId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  const [selected, setSelected] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [soundOn, setSoundOn] = useState(true);
  const [roundBanner, setRoundBanner] = useState<number | null>(null);
  const soundRef = useRef(true);
  const lastRound = useRef<number | null>(null);
  const timeoutPlayedFor = useRef<string | null>(null);
  const nextButton = useRef<HTMLButtonElement>(null);

  const play = useCallback((fn: () => void) => {
    if (soundRef.current) fn();
  }, []);

  const [reloadKey, setReloadKey] = useState(0);

  /** 현재 문항을 받아 온다. 상태 변경은 모두 응답 콜백 안에서 한다. */
  useEffect(() => {
    let cancelled = false;
    const sentAt = Date.now();
    api<PlayState>(`/api/play/${setId}/state`).then(
      (state) => {
        if (cancelled) return;
        setSelected(null);
        setSubmitError("");
        if (state.status === "submitted") {
          router.replace(`/play/${setId}/result`);
          return;
        }
        soundRef.current = state.soundEnabled;
        setSoundEnabled(state.soundEnabled);
        setSoundOn(state.soundEnabled);
        if (lastRound.current !== null && state.round !== lastRound.current) setRoundBanner(state.round);
        else if (lastRound.current === null && state.index === 0) setRoundBanner(1);
        lastRound.current = state.round;
        // 요청~응답의 중간 시각을 서버 시각에 맞춰 기기 시계 차이를 보정한다.
        setPhase({ kind: "playing", state, clockOffset: state.serverNow - (sentAt + Date.now()) / 2 });
      },
      (e) => {
        if (cancelled) return;
        setPhase({
          kind: "error",
          message: errorMessage(e),
          noParticipation: e instanceof ClientApiError && e.status === 401,
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [router, setId, reloadKey]);

  /** 다음 문제·다시 시도: 로딩 화면을 보여준 뒤 다시 받아 온다. */
  const load = useCallback(() => {
    setPhase({ kind: "loading" });
    setReloadKey((k) => k + 1);
  }, []);

  // 라운드 안내 배너는 잠깐만 보여준다.
  useEffect(() => {
    if (roundBanner === null) return;
    const id = window.setTimeout(() => setRoundBanner(null), 2200);
    return () => window.clearTimeout(id);
  }, [roundBanner]);

  const active = phase.kind === "playing" || phase.kind === "feedback" ? phase : null;
  const remaining = useCountdown(
    phase.kind === "playing" ? phase.state.deadlineAt : null,
    active?.clockOffset ?? 0,
  );
  const timedOut = phase.kind === "playing" && remaining === 0;

  useEffect(() => {
    if (timedOut && phase.kind === "playing" && timeoutPlayedFor.current !== phase.state.deliveryId) {
      timeoutPlayedFor.current = phase.state.deliveryId;
      play(sfx.timeout);
    }
  }, [timedOut, phase, play]);

  const submit = useCallback(
    async (optionId: string) => {
      if (phase.kind !== "playing") return;
      sfx.unlock();
      setSelected(optionId);
      setSubmitError("");
      try {
        const result = await api<AnswerResult>(`/api/play/${setId}/answer`, {
          method: "POST",
          body: { deliveryId: phase.state.deliveryId, optionId },
        });
        setPhase({ ...phase, kind: "feedback", selected: optionId, result });
        if (result.isCorrect) {
          play(sfx.correct);
          if (result.timeBonus) play(sfx.bonus);
          if (result.combo >= 2) play(() => sfx.combo(result.combo));
        } else {
          play(sfx.wrong);
        }
      } catch (e) {
        if (e instanceof ClientApiError && e.code === "STALE_QUESTION") {
          load();
          return;
        }
        setSelected(null);
        setSubmitError(errorMessage(e));
      }
    },
    [phase, setId, play, load],
  );

  const next = useCallback(() => {
    if (phase.kind !== "feedback") return;
    if (phase.result.finished) router.push(`/play/${setId}/result`);
    else load();
  }, [phase, router, setId, load]);

  // 키보드: 1~4로 답 고르기, 결과 화면에서 다음 버튼에 초점
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (phase.kind !== "playing" || selected !== null) return;
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= phase.state.options.length) {
        e.preventDefault();
        void submit(phase.state.options[n - 1].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, selected, submit]);

  useEffect(() => {
    if (phase.kind === "feedback") nextButton.current?.focus();
  }, [phase.kind]);

  async function toggleSound() {
    const value = !soundOn;
    setSoundOn(value);
    soundRef.current = value;
    setSoundEnabled(value);
    if (value) sfx.unlock();
    try {
      await api(`/api/play/${setId}/preferences`, { method: "PATCH", body: { soundEnabled: value } });
    } catch {
      // 설정 저장 실패는 이번 화면 동작에 영향이 없으므로 무시한다.
    }
  }

  if (phase.kind === "loading") return <Spinner label="문제를 불러오는 중…" />;
  if (phase.kind === "error") {
    return phase.noParticipation ? (
      <ErrorBox message={phase.message} showHome />
    ) : (
      <ErrorBox message={phase.message} onRetry={load} />
    );
  }

  const { state } = phase;
  const feedback = phase.kind === "feedback" ? phase.result : null;
  const shownUnits = feedback ? feedback.totalUnits : state.scoreUnits;
  const shownCombo = feedback ? feedback.combo : state.combo;
  const progress = ((state.index + (feedback ? 1 : 0)) / state.total) * 100;
  const timeRatio = remaining === null ? 0 : remaining / (state.timeLimitSeconds * 1000);
  const seconds = remaining === null ? 0 : Math.ceil(remaining / 1000);

  return (
    <div className="flex flex-col gap-4">
      {/* 상단 상태 표시줄 */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-sm font-semibold text-muted">👤 {state.nickname}</p>
          <SoundToggle on={soundOn} onToggle={toggleSound} />
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Stat label="문제" value={`${state.index + 1} / ${state.total}`} />
          <Stat label="점수" value={`${formatPoints(shownUnits)}점`} highlight={feedback?.isCorrect} />
          <Stat label="콤보" value={shownCombo >= 2 ? `🔥 ${shownCombo}` : String(shownCombo)} pop={shownCombo >= 2} />
        </div>
        <div
          className="h-2 overflow-hidden rounded-full bg-surface-2"
          role="progressbar"
          aria-label="진행률"
          aria-valuemin={0}
          aria-valuemax={state.total}
          aria-valuenow={state.index + (feedback ? 1 : 0)}
        >
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      </header>

      {roundBanner !== null && (
        <div role="status" className="anim-pop rounded-2xl bg-primary px-4 py-3 text-center font-black text-primary-ink">
          {roundBanner}라운드 시작! · {ROUND_LABEL[roundBanner]}
        </div>
      )}

      <Card>
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full bg-primary-soft px-3 py-1 font-bold text-primary">
            {state.round}라운드 · {ROUND_LABEL[state.round]}
          </span>
          <span className="rounded-full bg-surface-2 px-3 py-1 text-muted">{state.conceptName}</span>
          <span className="ml-auto text-muted">{state.questionType === "original" ? "정답 1점" : "정답 0.5점"}</span>
        </div>

        {/* 타이머: 시간 초과 후에는 막대 대신 안내만 보여주고 계속 풀 수 있다 */}
        {phase.kind === "playing" &&
          (timedOut ? (
            <p role="status" className="mb-4 rounded-2xl bg-warn-soft px-4 py-3 font-semibold text-warn">
              ⏰ 시간 초과! 감점은 없어요. 천천히 끝까지 풀어 보세요.
            </p>
          ) : (
            <div className="mb-4 flex items-center gap-3">
              <div className="h-3 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className={`h-full rounded-full transition-[width] duration-200 ${seconds <= 10 ? "bg-warn" : "bg-good"}`}
                  style={{ width: `${timeRatio * 100}%` }}
                />
              </div>
              <span className={`w-14 text-right font-mono font-bold ${seconds <= 10 ? "text-warn" : ""}`}>
                ⏱ {seconds}초
              </span>
            </div>
          ))}

        <h1 className="mb-5 text-xl leading-relaxed font-bold sm:text-2xl">{state.body}</h1>

        <OptionList
          options={state.options}
          onPick={(id) => void submit(id)}
          disabled={phase.kind !== "playing" || selected !== null}
          selectedId={phase.kind === "feedback" ? phase.selected : selected}
          correctId={feedback?.correctOptionId ?? null}
        />

        {phase.kind === "playing" && (
          <p className="mt-3 hidden text-center text-xs text-muted sm:block">키보드 숫자 1~4로도 답할 수 있어요.</p>
        )}

        {submitError && (
          <div role="alert" className="mt-4 rounded-2xl bg-bad-soft p-3 text-center font-semibold text-bad">
            {submitError} 다시 골라 주세요.
          </div>
        )}
      </Card>

      {feedback && <FeedbackPanel result={feedback} onNext={next} nextRef={nextButton} />}

      <p className="text-center text-sm">
        <Link href="/" className="text-muted underline">
          처음 화면
        </Link>
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  highlight = false,
  pop = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  pop?: boolean;
}) {
  return (
    <div className={`rounded-2xl border border-line bg-surface px-2 py-2 ${highlight ? "border-good" : ""}`}>
      <p className="text-xs text-muted">{label}</p>
      <p key={value} className={`text-lg font-black ${pop ? "anim-pop text-warn" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function FeedbackPanel({
  result,
  onNext,
  nextRef,
}: {
  result: AnswerResult;
  onNext: () => void;
  nextRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const title = result.isCorrect
    ? result.timeBonus
      ? "⚡ 시간 내 정답! 대단해요!"
      : "⭕ 정답이에요!"
    : "❌ 아쉬워요, 오답이에요";
  const tone = result.isCorrect ? "bg-good-soft text-good" : "bg-bad-soft text-bad";

  return (
    <section aria-live="polite" className="anim-rise flex flex-col gap-4 rounded-3xl border border-line bg-surface p-5 sm:p-7">
      <div className={`relative rounded-2xl px-4 py-3 text-center ${tone}`}>
        <p className="anim-pop text-xl font-black">{title}</p>
        {result.isTimeout && <p className="mt-1 text-sm font-semibold">⏰ 시간 초과 후 제출 (감점 없음)</p>}
        {result.scoreUnits > 0 && (
          <span className="anim-float-up pointer-events-none absolute top-1 right-4 text-lg font-black">
            +{formatPoints(result.scoreUnits)}점
          </span>
        )}
        {result.isCorrect && result.combo >= 2 && (
          <p className="mt-1 font-bold text-warn">🔥 {result.combo} 콤보!</p>
        )}
      </div>
      <div>
        <h2 className="mb-1 font-bold">해설</h2>
        <p className="leading-relaxed text-muted">{result.explanation}</p>
      </div>
      <button ref={nextRef} type="button" onClick={onNext} className={buttonClass.primary}>
        {result.finished ? "결과 보기 🏁" : "다음 문제 →"}
      </button>
    </section>
  );
}
