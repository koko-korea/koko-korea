"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, errorMessage } from "@/lib/client-api";
import { buttonClass, Card } from "@/components/ui";

export function TeacherLogin() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState(true);

  // 이미 로그인했으면 바로 목록으로
  useEffect(() => {
    let cancelled = false;
    api<{ loggedIn: boolean; passwordConfigured: boolean }>("/api/teacher/session").then(
      (s) => {
        if (cancelled) return;
        if (s.loggedIn) router.replace("/teacher");
        setConfigured(s.passwordConfigured);
      },
      () => {},
    );
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("/api/teacher/session", { method: "POST", body: { password } });
      router.replace("/teacher");
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 pt-6">
      <h1 className="text-center text-2xl font-black">교사 로그인</h1>
      {!configured && (
        <p role="alert" className="rounded-2xl bg-warn-soft p-4 text-sm leading-relaxed text-warn">
          교사 비밀번호가 아직 설정되지 않았어요. 프로젝트 폴더의 <code>.env.local</code> 파일에{" "}
          <code>TEACHER_PASSWORD=원하는비밀번호</code>를 넣고 서버를 다시 시작해 주세요.
        </p>
      )}
      <Card>
        <form onSubmit={submit} className="flex flex-col gap-3">
          <label htmlFor="teacher-password" className="font-bold">
            비밀번호
          </label>
          <input
            id="teacher-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError("");
            }}
            aria-invalid={Boolean(error)}
            className="min-h-12 rounded-2xl border-2 border-line bg-surface-2 px-4 outline-none focus:border-primary"
          />
          {error && (
            <p role="alert" className="text-sm font-semibold text-bad">
              {error}
            </p>
          )}
          <button type="submit" className={buttonClass.primary} disabled={busy || !password}>
            {busy ? "확인 중…" : "로그인"}
          </button>
        </form>
      </Card>
    </div>
  );
}
