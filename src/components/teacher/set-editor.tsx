"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { isLoginRequired, STATUS_LABEL } from "@/lib/teacher-client";
import type { QuizStatus, TeacherQuizDetail } from "@/lib/api-types";
import {
  QUESTION_LABELS,
  validateForPublish,
  type ContentQuestion,
  type QuizContent,
} from "@/domain/quiz-content";
import { buttonClass, Card, ErrorBox, Spinner } from "@/components/ui";
import { CsvTools } from "./csv-import";
import { JoinInfo } from "./join-info";

const fieldId = (path: string) => `f-${path.replace(/\./g, "-")}`;
const inputClass = (bad: boolean) =>
  `w-full rounded-xl border-2 bg-surface px-3 py-2 outline-none focus:border-primary disabled:bg-surface-2 ${
    bad ? "border-bad" : "border-line"
  }`;

export function SetEditor({ id }: { id: string }) {
  const router = useRouter();
  const [detail, setDetail] = useState<TeacherQuizDetail | null>(null);
  const [content, setContent] = useState<QuizContent | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [open, setOpen] = useState<Set<number>>(new Set([0]));

  useEffect(() => {
    let cancelled = false;
    api<TeacherQuizDetail>(`/api/teacher/quiz-sets/${id}`).then(
      (d) => {
        if (cancelled) return;
        setDetail(d);
        setContent(d.content);
        setDirty(false);
      },
      (e) => {
        if (cancelled) return;
        if (isLoginRequired(e)) router.replace("/teacher/login");
        else setLoadError(errorMessage(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [id, router, reloadKey]);

  // 저장하지 않은 변경이 있으면 나가기 전에 확인
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const issues = useMemo(() => (content ? validateForPublish(content) : []), [content]);
  const issuePaths = useMemo(() => new Set(issues.map((i) => i.path)), [issues]);

  if (loadError) {
    return (
      <ErrorBox
        message={loadError}
        onRetry={() => {
          setLoadError("");
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }
  if (!detail || !content) return <Spinner />;

  const editable = detail.status === "draft";
  const status = STATUS_LABEL[detail.status];

  function update(fn: (draft: QuizContent) => void) {
    setContent((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      fn(next);
      return next;
    });
    setDirty(true);
    setNotice(null);
  }

  function handleError(e: unknown) {
    if (isLoginRequired(e)) router.replace("/teacher/login");
    setNotice({ ok: false, text: errorMessage(e) });
  }

  async function save(): Promise<boolean> {
    setBusy(true);
    try {
      const d = await api<TeacherQuizDetail>(`/api/teacher/quiz-sets/${id}`, { method: "PUT", body: { content } });
      setDetail(d);
      setContent(d.content);
      setDirty(false);
      setNotice({ ok: true, text: "임시저장했어요." });
      return true;
    } catch (e) {
      handleError(e);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(next: QuizStatus, confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    if (next === "published" && dirty && !(await save())) return;
    setBusy(true);
    try {
      const d = await api<TeacherQuizDetail>(`/api/teacher/quiz-sets/${id}/status`, {
        method: "POST",
        body: { status: next },
      });
      setDetail(d);
      setContent(d.content);
      setDirty(false);
      setNotice({
        ok: true,
        text: { published: "공개했어요. 학생에게 참여 코드를 알려 주세요.", closed: "종료했어요. 새 참여가 막혔어요.", draft: "편집 상태로 되돌렸어요." }[next],
      });
    } catch (e) {
      handleError(e);
    } finally {
      setBusy(false);
    }
  }

  function jumpTo(path: string) {
    const match = /^concepts\.(\d+)/.exec(path);
    if (match) setOpen((prev) => new Set(prev).add(Number(match[1])));
    window.setTimeout(() => {
      const el = document.getElementById(fieldId(path)) ?? document.getElementById(fieldId(path.split(".").slice(0, 4).join(".")));
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
      el?.focus();
    }, 50);
  }

  return (
    <div className="flex flex-col gap-5">
      <Link href="/teacher" className="text-sm font-semibold text-muted underline">
        ← 세트 목록
      </Link>

      {/* 머리: 상태와 동작 */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.text}</span>
          {detail.isSample && <span className="rounded-full bg-warn-soft px-2.5 py-1 text-xs font-bold text-warn">견본</span>}
          {dirty && <span className="text-sm font-semibold text-warn">● 저장하지 않은 변경</span>}
          <span className="ml-auto text-sm text-muted">문제당 {detail.timeLimitSeconds}초 · 참여 {detail.participantCount}명</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="flex flex-col gap-1">
            <label htmlFor={fieldId("title")} className="text-sm font-bold">
              세트 제목
            </label>
            <input
              id={fieldId("title")}
              value={content.title}
              disabled={!editable}
              maxLength={60}
              onChange={(e) => update((d) => void (d.title = e.target.value))}
              className={inputClass(issuePaths.has("title"))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="threshold" className="text-sm font-bold">
              극복 기준
            </label>
            <select
              id="threshold"
              value={content.masteryThreshold}
              disabled={!editable}
              onChange={(e) => update((d) => void (d.masteryThreshold = Number(e.target.value)))}
              className={inputClass(false)}
            >
              <option value={1}>재도전 1번 정답</option>
              <option value={2}>연속 2번 정답</option>
              <option value={3}>연속 3번 정답</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {editable ? (
            <>
              <button type="button" onClick={() => void save()} className={buttonClass.secondary} disabled={busy || !dirty}>
                💾 임시저장
              </button>
              <button
                type="button"
                onClick={() => void changeStatus("published", "공개하면 학생이 참여할 수 있고, 문항은 더 고칠 수 없어요. 공개할까요?")}
                className={buttonClass.primary}
                disabled={busy || issues.length > 0}
              >
                🚀 공개하기
              </button>
            </>
          ) : (
            <>
              <Link href={`/teacher/sets/${id}/analytics`} className={buttonClass.primary}>
                📊 학급 분석
              </Link>
              {detail.status === "published" ? (
                <button
                  type="button"
                  onClick={() => void changeStatus("closed", "종료하면 새 학생이 참여할 수 없어요. 이미 참여한 학생의 기록은 남아요. 종료할까요?")}
                  className={buttonClass.secondary}
                  disabled={busy}
                >
                  ⏹ 종료하기
                </button>
              ) : (
                <button type="button" onClick={() => void changeStatus("published")} className={buttonClass.secondary} disabled={busy}>
                  ▶ 다시 열기
                </button>
              )}
              {detail.participantCount === 0 && (
                <button
                  type="button"
                  onClick={() => void changeStatus("draft", "편집 상태로 되돌리면 학생이 참여할 수 없어요. 되돌릴까요?")}
                  className={buttonClass.secondary}
                  disabled={busy}
                >
                  ✏️ 편집 상태로 되돌리기
                </button>
              )}
            </>
          )}
        </div>

        {notice && (
          <p role={notice.ok ? "status" : "alert"} className={`rounded-xl p-3 text-sm font-semibold ${notice.ok ? "bg-good-soft text-good" : "bg-bad-soft text-bad"}`}>
            {notice.ok ? "✓ " : "⚠️ "}
            {notice.text}
          </p>
        )}
        {!editable && detail.participantCount > 0 && (
          <p className="text-sm text-muted">참여 기록이 있어 문항을 고치려면 학급 분석 화면에서 기록을 먼저 삭제해야 해요.</p>
        )}
      </Card>

      {detail.status !== "draft" && <JoinInfo code={detail.joinCode} />}

      {/* 공개 전 확인 목록 */}
      {editable && (
        <Card>
          {issues.length === 0 ? (
            <p className="font-bold text-good">✓ 36문항이 모두 채워졌어요. 공개할 수 있어요.</p>
          ) : (
            <>
              <p className="font-bold text-warn">⚠ 공개 전에 채울 곳이 {issues.length}군데 있어요.</p>
              <ul className="mt-2 max-h-40 space-y-1 overflow-auto text-sm">
                {issues.slice(0, 50).map((issue) => (
                  <li key={issue.path}>
                    <button type="button" onClick={() => jumpTo(issue.path)} className="text-left text-muted underline hover:text-ink">
                      {issue.message}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-4 border-t border-line pt-4">
            <CsvTools
              content={content}
              editable={editable}
              onImport={(concepts) => update((d) => void (d.concepts = concepts))}
            />
          </div>
        </Card>
      )}
      {!editable && (
        <Card>
          <CsvTools content={content} editable={false} onImport={() => {}} />
        </Card>
      )}

      {/* 개념 12개 */}
      <fieldset disabled={!editable} className="flex flex-col gap-3">
        <legend className="mb-2 text-xl font-black">개념과 문항</legend>
        {content.concepts.map((concept, ci) => {
          const conceptIssues = issues.filter((i) => i.path.startsWith(`concepts.${ci}.`)).length;
          return (
            <details
              key={ci}
              open={open.has(ci)}
              onToggle={(e) => {
                const isOpen = (e.currentTarget as HTMLDetailsElement).open;
                setOpen((prev) => {
                  const next = new Set(prev);
                  if (isOpen) next.add(ci);
                  else next.delete(ci);
                  return next;
                });
              }}
              className="rounded-2xl border border-line bg-surface"
            >
              <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 font-bold">
                <span className="w-16 shrink-0 text-muted">개념 {ci + 1}</span>
                <span className="flex-1 truncate">{concept.name || <span className="text-muted">(이름 없음)</span>}</span>
                {editable &&
                  (conceptIssues > 0 ? (
                    <span className="text-sm text-warn">⚠ {conceptIssues}</span>
                  ) : (
                    <span className="text-sm text-good">✓ 완료</span>
                  ))}
              </summary>
              <div className="flex flex-col gap-4 border-t border-line p-4">
                <div className="flex flex-col gap-1">
                  <label htmlFor={fieldId(`concepts.${ci}.name`)} className="text-sm font-bold">
                    개념 이름
                  </label>
                  <input
                    id={fieldId(`concepts.${ci}.name`)}
                    value={concept.name}
                    maxLength={60}
                    onChange={(e) => update((d) => void (d.concepts[ci].name = e.target.value))}
                    className={inputClass(issuePaths.has(`concepts.${ci}.name`))}
                  />
                </div>
                {concept.questions.map((q, qi) => (
                  <QuestionEditor
                    key={qi}
                    base={`concepts.${ci}.questions.${qi}`}
                    label={QUESTION_LABELS[qi]}
                    question={q}
                    issuePaths={issuePaths}
                    onChange={(fn) => update((d) => fn(d.concepts[ci].questions[qi]))}
                  />
                ))}
              </div>
            </details>
          );
        })}
      </fieldset>
    </div>
  );
}

function QuestionEditor({
  base,
  label,
  question,
  issuePaths,
  onChange,
}: {
  base: string;
  label: string;
  question: ContentQuestion;
  issuePaths: Set<string>;
  onChange: (fn: (q: ContentQuestion) => void) => void;
}) {
  const answerMissing = issuePaths.has(`${base}.answer`);
  const duplicate = issuePaths.has(`${base}.options`);
  return (
    <section className="rounded-xl bg-surface-2 p-4">
      <h3 className="mb-2 font-bold">
        {label} <span className="text-sm font-normal text-muted">({label === "원문제" ? "정답 1점" : "정답 0.5점"})</span>
      </h3>
      <label htmlFor={fieldId(`${base}.body`)} className="text-sm font-semibold">
        문제
      </label>
      <textarea
        id={fieldId(`${base}.body`)}
        value={question.body}
        rows={2}
        onChange={(e) => onChange((q) => void (q.body = e.target.value))}
        className={`${inputClass(issuePaths.has(`${base}.body`))} mt-1 resize-y`}
      />

      <fieldset className="mt-3" id={fieldId(`${base}.answer`)} tabIndex={-1}>
        <legend className="text-sm font-semibold">
          선택지 <span className="font-normal text-muted">— 정답인 선택지의 동그라미를 고르세요</span>
          {answerMissing && <span className="ml-2 font-bold text-bad">정답 미선택</span>}
          {duplicate && <span className="ml-2 font-bold text-bad">중복 선택지</span>}
        </legend>
        <div className="mt-1 flex flex-col gap-2">
          {question.options.map((option, oi) => (
            <div key={oi} className="flex items-center gap-2">
              <input
                type="radio"
                name={`${base}-answer`}
                checked={question.answer === oi + 1}
                onChange={() => onChange((q) => void (q.answer = oi + 1))}
                aria-label={`선택지 ${oi + 1}을 정답으로`}
                className="h-5 w-5 shrink-0 accent-[var(--good)]"
              />
              <input
                id={fieldId(`${base}.options.${oi}`)}
                value={option}
                placeholder={`선택지 ${oi + 1}`}
                onChange={(e) => onChange((q) => void (q.options[oi] = e.target.value))}
                className={inputClass(issuePaths.has(`${base}.options.${oi}`))}
              />
              {question.answer === oi + 1 && <span className="shrink-0 text-sm font-bold text-good">✓ 정답</span>}
            </div>
          ))}
        </div>
      </fieldset>

      <label htmlFor={fieldId(`${base}.explanation`)} className="mt-3 block text-sm font-semibold">
        해설
      </label>
      <textarea
        id={fieldId(`${base}.explanation`)}
        value={question.explanation}
        rows={2}
        onChange={(e) => onChange((q) => void (q.explanation = e.target.value))}
        className={`${inputClass(issuePaths.has(`${base}.explanation`))} mt-1 resize-y`}
      />
    </section>
  );
}
