import type { AppError, ErrorCode } from "../../src/shared/types";

export class ServiceError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly detail?: string,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function toAppError(error: unknown): AppError {
  if (error instanceof ServiceError) {
    return {
      code: error.code,
      message: error.message,
      detail: error.detail,
    };
  }
  if (error instanceof Error) {
    return { code: "INTERNAL", message: error.message };
  }
  return { code: "INTERNAL", message: String(error) };
}
