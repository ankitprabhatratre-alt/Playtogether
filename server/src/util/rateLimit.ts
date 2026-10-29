/** Simple token bucket. */
export class TokenBucket {
  private tokens: number;
  private last: number;
  constructor(
    private readonly capacity: number,
    private readonly refillPerSec: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = capacity;
    this.last = now();
  }
  take(cost = 1): boolean {
    const t = this.now();
    this.tokens = Math.min(this.capacity, this.tokens + ((t - this.last) / 1000) * this.refillPerSec);
    this.last = t;
    if (this.tokens >= cost) {
      this.tokens -= cost;
      return true;
    }
    return false;
  }
}

/** Fixed-window counter keyed by string (e.g. IP or IP+room). */
export class WindowCounter {
  private map = new Map<string, { count: number; resetAt: number }>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}
  /** Returns true if the key is currently blocked. */
  isBlocked(key: string): boolean {
    const e = this.map.get(key);
    if (!e) return false;
    if (e.resetAt <= this.now()) {
      this.map.delete(key);
      return false;
    }
    return e.count >= this.limit;
  }
  hit(key: string): void {
    const t = this.now();
    const e = this.map.get(key);
    if (!e || e.resetAt <= t) this.map.set(key, { count: 1, resetAt: t + this.windowMs });
    else e.count++;
  }
  reset(key: string): void {
    this.map.delete(key);
  }
  prune(): void {
    const t = this.now();
    for (const [k, v] of this.map) if (v.resetAt <= t) this.map.delete(k);
  }
}
