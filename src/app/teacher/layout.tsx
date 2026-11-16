import type { Metadata } from "next";
import { Suspense } from "react";
import { TeacherHeader, TeacherHeaderShell } from "@/components/teacher/teacher-header";

export const metadata: Metadata = {
  title: "교사용 | 국어 개념 퀴즈 챌린지",
};

export default function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  return (
    <div className="flex flex-1 flex-col">
      {/* 현재 경로를 읽는 메뉴는 요청 시점에 채워지므로 Suspense로 감싼다 */}
      <Suspense fallback={<TeacherHeaderShell />}>
        <TeacherHeader />
      </Suspense>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
