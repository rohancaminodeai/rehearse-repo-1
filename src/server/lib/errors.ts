import type { ApiError } from "@/shared/types";

/**
 * Base for all domain errors. The domain layer throws these; the API layer maps
 * them to HTTP responses via {@link toApiError}. Never leak stack traces to clients.
 */
export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;

  constructor(message: string, code: string, httpStatus: number) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/** Invalid input that passed Zod but failed a domain rule. */
export class ValidationError extends AppError {
  constructor(message = "Invalid request.", code = "VALIDATION_ERROR") {
    super(message, code, 400);
  }
}

/** Missing/invalid credentials or session. Use a generic message for login. */
export class AuthError extends AppError {
  constructor(message = "Unauthorized.", code = "AUTH_ERROR") {
    super(message, code, 401);
  }
}

/** Target resource does not exist or is not visible to the caller. */
export class NotFoundError extends AppError {
  constructor(message = "Not found.", code = "NOT_FOUND") {
    super(message, code, 404);
  }
}

/** A uniqueness or state conflict (e.g. duplicate email / customer name). */
export class ConflictError extends AppError {
  constructor(message = "Conflict.", code = "CONFLICT") {
    super(message, code, 409);
  }
}

/** Unexpected server-side failure. */
export class InternalError extends AppError {
  constructor(message = "Internal server error.", code = "INTERNAL_ERROR") {
    super(message, code, 500);
  }
}

/**
 * Map an unknown thrown value to an HTTP status + {@link ApiError} body.
 * Known {@link AppError}s pass through their code/status/message; everything
 * else collapses to a generic 500 so no internal detail leaks to the client.
 */
export function toApiError(err: unknown): { status: number; body: ApiError } {
  if (err instanceof AppError) {
    return {
      status: err.httpStatus,
      body: { code: err.code, message: err.message },
    };
  }
  return {
    status: 500,
    body: { code: "INTERNAL_ERROR", message: "Internal server error." },
  };
}
