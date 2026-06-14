/**
 * AppError hierarchy. Anything thrown that is an AppError maps to a safe,
 * client-facing status + code + message. Anything else becomes a generic 500
 * (ERR-01) — no stack trace, SQL, or internal id is ever leaked.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class Unauthorized extends AppError {
  constructor(message = "Authentication required") {
    super(401, "unauthorized", message);
  }
}
export class Forbidden extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(403, "forbidden", message);
  }
}
export class NotFound extends AppError {
  constructor(message = "Not found") {
    super(404, "not_found", message);
  }
}
export class ValidationError extends AppError {
  constructor(details: unknown, message = "Invalid request") {
    super(422, "validation_error", message, details);
  }
}
export class Conflict extends AppError {
  constructor(message = "Conflict") {
    super(409, "conflict", message);
  }
}
export class PaymentRequired extends AppError {
  constructor(message = "Payment required") {
    super(402, "payment_required", message);
  }
}
export class TooManyRequests extends AppError {
  constructor(message = "Too many requests", readonly retryAfter?: number) {
    super(429, "rate_limited", message);
  }
}
export class BadRequest extends AppError {
  constructor(message = "Bad request") {
    super(400, "bad_request", message);
  }
}
export class PayloadTooLarge extends AppError {
  constructor(message = "File too large") {
    super(413, "payload_too_large", message);
  }
}
