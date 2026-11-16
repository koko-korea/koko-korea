"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { buttonClass } from "@/components/ui";

export function JoinCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = code.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,10}$/.test(value)) {
      setError("참여 코드는 영문과 숫자 4~10자예요.");
      return;
    }
    router.push(`/join/${value}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <label htmlFor="join-code" className="text-lg font-bold">
        참여 코드
      </label>
      <input
        id="join-code"
        value={code}
        onChange={(e) => {
          setCode(e.target.value);
          setError("");
        }}
        autoComplete="off"
        autoCapitalize="characters"
        inputMode="text"
        placeholder="예: KOKO01"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "join-code-error" : undefined}
        className="min-h-14 rounded-2xl border-2 border-line bg-surface-2 px-4 text-center font-mono text-2xl font-bold tracking-[0.3em] uppercase outline-none focus:border-primary"
      />
      {error && (
        <p id="join-code-error" className="text-sm font-semibold text-bad">
          {error}
        </p>
      )}
      <button type="submit" className={buttonClass.primary}>
        입장하기 →
      </button>
    </form>
  );
}
