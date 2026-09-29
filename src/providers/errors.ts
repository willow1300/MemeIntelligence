// Structured provider + ingestion errors.
//
// Every error carries enough context to:
//   - decide whether a retry is safe (retryable),
//   - log a structured, redacted trace (no secrets),
//   - keep the database consistent (a failed ingestion must never leave
//     the DB half-corrupted — see ingestion worker).

export type ErrorKind =
  | 'INVALID_ARGUMENT' // bad address / malformed input
  | 'RATE_LIMITED' // HTTP 429 / provider backoff
  | 'TIMEOUT' // request timed out
  | 'NETWORK' // transport failure
  | 'PROVIDER_ERROR' // provider returned an error status it understands (5xx, RPC error)
  | 'NOT_FOUND' // address not a token / not a wallet
  | 'MALFORMED_RESPONSE' // response did not match the expected shape
  | 'STORAGE' // database write failed
  | 'INTERNAL'; // anything else

export class ProviderError extends Error {
  readonly kind: ErrorKind;
  readonly retryable: boolean;
  readonly provider: string;
  readonly attempt: number;

  constructor(options: {
    kind: ErrorKind;
    message: string;
    provider: string;
    retryable?: boolean;
    attempt?: number;
    cause?: unknown;
  }) {
    super(options.message);
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
    this.name = 'ProviderError';
    this.kind = options.kind;
    this.provider = options.provider;
    this.attempt = options.attempt ?? 0;
    this.retryable = options.retryable ?? isRetryableKind(options.kind);
  }
}

export class IngestionError extends Error {
  readonly kind: ErrorKind;
  readonly retryable: boolean;
  readonly tokenAddress: string;
  readonly jobId: string | null;
  readonly cause?: unknown;

  constructor(options: {
    kind: ErrorKind;
    message: string;
    tokenAddress: string;
    jobId?: string | null;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(options.message);
    if (options.cause !== undefined) (this as { cause?: unknown }).cause = options.cause;
    this.name = 'IngestionError';
    this.kind = options.kind;
    this.retryable = options.retryable ?? isRetryableKind(options.kind);
    this.tokenAddress = options.tokenAddress;
    this.jobId = options.jobId ?? null;
  }
}

function isRetryableKind(kind: ErrorKind): boolean {
  switch (kind) {
    case 'RATE_LIMITED':
    case 'TIMEOUT':
    case 'NETWORK':
    case 'PROVIDER_ERROR':
      return true;
    default:
      return false;
  }
}

/** Convert an arbitrary thrown value into a structured ProviderError. */
export function toProviderError(
  err: unknown,
  provider: string,
  attempt: number,
): ProviderError {
  if (err instanceof ProviderError) {
    return new ProviderError({
      kind: err.kind,
      message: err.message,
      provider,
      retryable: err.retryable,
      attempt,
      cause: err,
    });
  }
  if (err instanceof Error) {
    // Heuristic mapping for HTTP client errors.
    const message = err.message;
    if (/429|rate limit|too many requests/i.test(message)) {
      return new ProviderError({ kind: 'RATE_LIMITED', message, provider, attempt, cause: err });
    }
    if (/timeout|timed out|ETIMEDOUT/i.test(message)) {
      return new ProviderError({ kind: 'TIMEOUT', message, provider, attempt, cause: err });
    }
    if (/fetch failed|ECONNREFUSED|ECONNRESET|socket|network/i.test(message)) {
      return new ProviderError({ kind: 'NETWORK', message, provider, attempt, cause: err });
    }
    if (/5\d\d|server error|internal/i.test(message)) {
      return new ProviderError({ kind: 'PROVIDER_ERROR', message, provider, attempt, cause: err });
    }
    return new ProviderError({ kind: 'PROVIDER_ERROR', message, provider, attempt, cause: err });
  }
  return new ProviderError({ kind: 'INTERNAL', message: 'Unknown provider failure', provider, attempt, cause: err });
}