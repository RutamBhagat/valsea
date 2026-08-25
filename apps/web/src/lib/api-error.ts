import { EdenFetchError } from "@elysia/eden";

export function getApiErrorMessage(error: unknown, fallback = "Request failed") {
  if (error instanceof EdenFetchError) {
    const value = error.value;

    if (value instanceof Error) {
      return value.message || fallback;
    }

    if (typeof value === "string" && value) {
      return value;
    }

    if (
      value &&
      typeof value === "object" &&
      "message" in value &&
      typeof value.message === "string" &&
      value.message
    ) {
      return value.message;
    }

    return fallback;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}
