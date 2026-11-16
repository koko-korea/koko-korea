import { ClientApiError } from "./client-api";

/** 교사 세션이 없거나 만료되면 로그인 화면으로 보내야 한다. */
export function isLoginRequired(error: unknown): boolean {
  return error instanceof ClientApiError && error.status === 401;
}

export const STATUS_LABEL = {
  draft: { text: "✏️ 편집 중", tone: "bg-surface-2 text-muted" },
  published: { text: "🟢 공개 중", tone: "bg-good-soft text-good" },
  closed: { text: "⏹ 종료", tone: "bg-warn-soft text-warn" },
} as const;

export function formatDateTime(ms: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}
