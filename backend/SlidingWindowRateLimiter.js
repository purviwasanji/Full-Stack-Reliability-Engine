class SlidingWindowRateLimiter {
  constructor(limit = 100, windowSize = 60000) {
    this.limit = limit;
    this.windowSize = windowSize;
  }

  async isAllowed(key) {
    const now = Date.now();
    const windowStart = now - this.windowSize;
    const requestKey = `sliding_window:${key}`;
    
    const pipeline = client.pipeline();
    pipeline.zremrangebyscore(requestKey, '-inf', windowStart);
    pipeline.zcard(requestKey);
    pipeline.zadd(requestKey, now, `${now}-${Math.random()}`);
    pipeline.expire(requestKey, Math.ceil(this.windowSize / 1000));
    
    const results = await pipeline.exec();
    const currentCount = results[1][1];
    
    return {
      allowed: currentCount < this.limit,
      count: currentCount + 1,
      limit: this.limit,
      resetTime: now + this.windowSize
    };
  }
}
