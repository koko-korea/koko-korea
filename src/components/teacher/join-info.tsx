"use client";

import { useState, useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** 학생에게 알려 줄 참여 코드와 주소 (수업 화면에 크게 띄우기 좋게) */
export function JoinInfo({ code }: { code: string }) {
  const origin = useSyncExternalStore(
    subscribe,
    () => window.location.origin,
    () => "",
  );
  const [copied, setCopied] = useState(false);
  const url = `${origin}/join/${code}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 복사가 막힌 환경에서는 화면의 주소를 직접 보면 된다.
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-3xl bg-primary px-5 py-6 text-center text-primary-ink">
      <p className="text-sm font-semibold opacity-90">학생 참여 코드</p>
      <p className="font-mono text-5xl font-black tracking-[0.2em]">{code}</p>
      {origin && (
        <p className="text-sm break-all opacity-90">
          {url}{" "}
          <button type="button" onClick={copy} className="ml-1 rounded-full bg-primary-ink/20 px-2 py-0.5 font-semibold underline">
            {copied ? "복사됨 ✓" : "주소 복사"}
          </button>
        </p>
      )}
    </div>
  );
}
