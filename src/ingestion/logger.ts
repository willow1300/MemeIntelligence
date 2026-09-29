// Phase 2A — Structured logger for the ingestion pipeline.
//
// Emits single-line JSON to stderr (keeps stdout clean for CLI output).
// Requirements:
//   - one event per state transition (provider_request, token_created, ...)
//   - never logs secrets: redact() strips keys that ARE credentials
//     (api key, secret, password, auth header, private key, seed phrase...)
//     plus string values that look like JWTs / API keys. Domain fields such
//     as tokenAddress / tokenId / token_amount are NOT credentials and stay
//     visible for debugging.
//   - timestamps for severity ordering and debugging.

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogSink {
  write(line: string): void;
}

export interface StructuredLogger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  /** Wrap work so every entry/exit is logged (attempt tracking). */
  child(context: Record<string, unknown>): StructuredLogger;
}

// Matches keys that hold credentials. Boundaries (`[^a-z]` on both sides)
// prevent false positives on our own domain vocabulary: "tokenAddress",
// "tokenId", "token_amount", "monkey", "keyboard", "author" all stay clean,
// while "apiKey", "AUTH_TOKEN", "private-key", "seed_phrase" are caught.
const SECRET_KEY_RE =
  /(^|[^a-z])(api[_ -]?key|access[_ -]?token|auth[_ -]?token|refresh[_ -]?token|session[_ -]?token|secret|password|passwd|pwd|passphrase|private[_ -]?key|privatekey|seed[_ -]?phrase|seed|mnemonic|recovery[_ -]?phrase|authorization|auth|credential|cookie|bearer|key)([^a-z]|$)/i;

// Keys that are exactly a credential name (regex above needs boundaries, so
// a bare "token" field is handled here explicitly).
const EXACT_SECRET_KEYS = new Set(['token', 'api_key', 'apikey', 'accesstoken', 'auth_token']);

/** Recursively replace secret-looking values so they never appear in logs. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[...]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') {
    return /^(eyJ|sk[-_]|pk[-_]|bearer )/i.test(value) ? '[REDACTED]' : value;
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_RE.test(k) || EXACT_SECRET_KEYS.has(k.toLowerCase())
        ? '[REDACTED]'
        : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

class JsonLogger implements StructuredLogger {
  constructor(
    private readonly sink: LogSink,
    private readonly context: Record<string, unknown> = {},
  ) {}

  private emit(level: LogLevel, event: string, fields: Record<string, unknown>): void {
    const record = {
      ts: new Date().toISOString(),
      level,
      event,
      ...this.context,
      ...redact(fields) as Record<string, unknown>,
    };
    this.sink.write(JSON.stringify(record));
  }

  debug(event: string, fields?: Record<string, unknown>): void {
    this.emit('debug', event, fields ?? {});
  }
  info(event: string, fields?: Record<string, unknown>): void {
    this.emit('info', event, fields ?? {});
  }
  warn(event: string, fields?: Record<string, unknown>): void {
    this.emit('warn', event, fields ?? {});
  }
  error(event: string, fields?: Record<string, unknown>): void {
    this.emit('error', event, fields ?? {});
  }

  child(context: Record<string, unknown>): StructuredLogger {
    return new JsonLogger(this.sink, { ...this.context, ...context });
  }
}

export function createLogger(sink?: LogSink): StructuredLogger {
  return new JsonLogger(sink ?? { write: (line) => process.stderr.write(line + '\n') });
}

/** Trivial in-memory sink for offline tests. */
export function memorySink(): { sink: LogSink; lines: string[] } {
  const lines: string[] = [];
  return {
    sink: { write: (line) => lines.push(line) },
    lines,
  };
}