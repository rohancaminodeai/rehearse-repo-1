import type { ApiError } from "@/shared/types";

export interface PostJsonResult<T> {
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
 * Typed JSON POST against an API route. Returns the parsed body on 2xx, or the
 * uniform { code, message } ApiError envelope on failure. Never throws on a
 * non-2xx status; only a network failure rejects.
 */
export async function postJson<T>(
  url: string,
  body: unknown,
): Promise<PostJsonResult<T>> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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
