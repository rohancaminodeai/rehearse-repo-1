import type { ApiError } from "@/shared/types";

export interface SendJsonResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  /** Parsed ApiError on a non-2xx response (best-effort). */
  error: ApiError | null;
}

function isApiError(value: unknown): value is ApiError {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.code === "string" && typeof obj.message === "string";
}

/**
 * Typed JSON request for verbs the auth lane's `postJson` doesn't cover
 * (PATCH/DELETE). Cookies ride along automatically same-origin. Never throws on
 * a non-2xx status; only a network failure rejects.
 */
export async function sendJson<T>(
  url: string,
  method: "PATCH" | "DELETE",
  body?: unknown,
): Promise<SendJsonResult<T>> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  let parsed: unknown = null;
  try {
    parsed = await res.json();
  } catch {
    parsed = null;
  }

  if (res.ok) {
    return { ok: true, status: res.status, data: parsed as T, error: null };
  }

  return {
    ok: false,
    status: res.status,
    data: null,
    error: isApiError(parsed)
      ? parsed
      : { code: "unknown", message: "Something went wrong. Please try again." },
  };
}
