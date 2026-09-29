// Phase 2A — Token bucket rate limiter.
//
// Generic blocking rate limiter used by providers and backfill to stay under
// upstream request budgets. Safe under concurrent consumers (queue-based).

export interface RateLimiter {
  /** Wait until a token is available, then consume it. Resolves when the call may proceed. */
  acquire(): Promise<void>;
  /** Current state for tests / observability. */
  snapshot(): { remaining: number; queued: number };
}

interface RateLimiterOptions {
  /** Requests per second. Must be > 0. */
  rps: number;
  /** Burst capacity in tokens (defaults to 1 for strict pacing). */
  burst?: number;
}

export class TokenBucket implements RateLimiter {
  private readonly maxTokens: number;
  private readonly refillPerMs: number;
  private tokens: number;
  private lastRefillMs: number;
  private queue: Promise<void>;
  private queued = 0;

  constructor(options: RateLimiterOptions) {
    if (!options || !(options.rps > 0)) throw new Error('RateLimiter: rps must be > 0');
    this.refillPerMs = options.rps / 1000;
    this.maxTokens = Math.max(1, options.burst ?? 1);
    this.tokens = this.maxTokens;
    this.lastRefillMs = Date.now();
    this.queue = Promise.resolve();
  }

  async acquire(): Promise<void> {
    // Serialize all acquisitions so token math stays deterministic.
    const prev = this.queue;
    this.queued += 1;
    this.queue = prev.then(() => this.waitForToken());
    await this.queue.catch(() => {});
    this.queued -= 1;
  }

  private async waitForToken(): Promise<void> {
    for (;;) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }
      const waitMs = this.millisUntilNextToken();
      await new Promise<void>((resolve) => setTimeout(resolve, Math.max(1, Math.ceil(waitMs))));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefillMs;
    if (elapsed <= 0) return;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillPerMs);
    this.lastRefillMs = now;
  }

  private millisUntilNextToken(): number {
    return (1 - this.tokens) / this.refillPerMs;
  }

  snapshot(): { remaining: number; queued: number } {
    this.refill();
    return { remaining: this.tokens, queued: this.queued };
  }
}

/** A no-op limiter for unlimited local testing. */
export class NoopRateLimiter implements RateLimiter {
  async acquire(): Promise<void> {}
  snapshot(): { remaining: number; queued: number } {
    return { remaining: Number.POSITIVE_INFINITY, queued: 0 };
  }
}

export function createRateLimiter(rps: number | null | undefined): RateLimiter {
  if (!(rps && rps > 0)) return new NoopRateLimiter();
  return new TokenBucket({ rps, burst: 1 });
}