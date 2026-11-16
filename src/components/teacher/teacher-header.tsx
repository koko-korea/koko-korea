"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { api } from "@/lib/client-api";

export function TeacherHeaderShell({ children }: { children?: ReactNode }) {
  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex min-h-14 w-full max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/teacher" className="font-black">
          📚 퀴즈 챌린지 <span className="ml-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs text-primary">교사용</span>
        </Link>
        {children}
      </div>
    </header>
  );
}

export function TeacherHeader() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api("/api/teacher/session", { method: "DELETE" }).catch(() => {});
    router.replace("/teacher/login");
  }

  return (
    <TeacherHeaderShell>
      {pathname !== "/teacher/login" && (
        <nav className="ml-auto flex items-center gap-3 text-sm font-semibold">
          <Link href="/teacher" className="text-muted hover:text-ink">
            세트 목록
          </Link>
          <button type="button" onClick={logout} className="text-muted underline hover:text-ink">
            로그아웃
          </button>
        </nav>
      )}
    </TeacherHeaderShell>
  );
}
