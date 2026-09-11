import pino from "pino";

/**
 * Foundation logging (Step 5 §5.1 "Logging with workspace and actor context
 * attached to every entry"). Every call site should pass a `context` object
 * so log lines are attributable — never log secrets (see encryption.ts and
 * the "no plaintext credential in logs" acceptance criterion).
 */
const baseLogger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    paths: [
      "*.password",
      "*.token",
      "*.apiKey",
      "*.api_key",
      "*.secret",
      "*.credential",
      "*.credentials",
      "*.encryptedPayload",
      "*.authorization",
    ],
    censor: "[REDACTED]",
  },
});

export interface LogContext {
  workspaceId?: string;
  actorUserId?: string;
  requestId?: string;
  [key: string]: unknown;
}

export function getLogger(context: LogContext = {}) {
  return baseLogger.child(context);
}

export const logger = baseLogger;
