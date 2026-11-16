import Link from "next/link";
import type { ReactNode } from "react";

/** 공통 화면 틀: 모바일 우선, 가운데 정렬 */
export function Screen({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className={`mx-auto w-full ${wide ? "max-w-3xl" : "max-w-xl"} flex-1 px-4 py-6 sm:py-10`}>
      {children}
    </main>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-line bg-surface p-5 shadow-sm sm:p-7 ${className}`}>{children}</div>
  );
}

export const buttonClass = {
  primary:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-base font-bold text-primary-ink shadow-sm transition hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
  secondary:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border-2 border-line bg-surface px-5 py-3 text-base font-bold text-ink transition hover:border-primary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50",
};

export function Spinner({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-16 text-muted">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-line border-t-primary" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function ErrorBox({
  message,
  onRetry,
  showHome = false,
}: {
  message: string;
  onRetry?: () => void;
  showHome?: boolean;
}) {
  return (
    <div role="alert" className="flex flex-col items-center gap-4 rounded-3xl bg-bad-soft p-6 text-center">
      <p className="font-semibold text-bad">⚠️ {message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {onRetry && (
          <button type="button" className={buttonClass.secondary} onClick={onRetry}>
            다시 시도
          </button>
        )}
        {showHome && (
          <Link href="/" className={buttonClass.secondary}>
            처음으로
          </Link>
        )}
      </div>
    </div>
  );
}
