/** 브라우저에서 API를 부르는 도우미. 서버 오류 메시지를 그대로 사용자에게 보여줄 수 있게 한다. */
export class ClientApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: init?.method ?? "GET",
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ClientApiError(0, "NETWORK", "인터넷 연결을 확인하고 다시 시도해 주세요.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ClientApiError(
      res.status,
      data?.error?.code ?? "UNKNOWN",
      data?.error?.message ?? "잠시 문제가 생겼어요. 다시 시도해 주세요.",
    );
  }
  return data as T;
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "잠시 문제가 생겼어요. 다시 시도해 주세요.";
}
