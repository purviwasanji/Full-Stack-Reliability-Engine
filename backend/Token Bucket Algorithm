const redis = require('redis');
const client = redis.createClient();

class TokenBucketRateLimiter {
  constructor(capacity = 100, refillRate = 10, window = 60) {
    this.capacity = capacity;
    this.refillRate = refillRate;
    this.window = window;
  }

  async isAllowed(key, tokens = 1) {
    const now = Date.now();
    const bucketKey = `rate_limit:${key}`;
    
    const bucket = await client.hmget(bucketKey, 'tokens', 'lastRefill');
    let currentTokens = parseFloat(bucket[0]) || this.capacity;
    let lastRefill = parseInt(bucket[1]) || now;
    
    const elapsed = (now - lastRefill) / 1000;
    const tokensToAdd = elapsed * this.refillRate;
    currentTokens = Math.min(this.capacity, currentTokens + tokensToAdd);
    
    if (currentTokens >= tokens) {
      currentTokens -= tokens;
      
      await client.hmset(bucketKey, 
        'tokens', currentTokens,
        'lastRefill', now
      );
      await client.expire(bucketKey, this.window);
      
      return { allowed: true, tokensRemaining: currentTokens };
    }
    
    return { 
      allowed: false, 
      tokensRemaining: currentTokens,
      retryAfter: Math.ceil((tokens - currentTokens) / this.refillRate)
    };
  }
}

const rateLimiter = new TokenBucketRateLimiter(100, 10, 3600);

const rateLimit = (tokensRequired = 1) => {
  return async (req, res, next) => {
    const key = req.ip || req.user?.id || 'anonymous';
    const result = await rateLimiter.isAllowed(key, tokensRequired);
    
    res.set({
      'X-RateLimit-Limit': rateLimiter.capacity,
      'X-RateLimit-Remaining': Math.floor(result.tokensRemaining),
      'X-RateLimit-Reset': new Date(Date.now() + rateLimiter.window * 1000).toISOString()
    });
    
    if (!result.allowed) {
      res.set('Retry-After', result.retryAfter);
      return res.status(429).json({
        error: 'Rate limit exceeded',
        retryAfter: result.retryAfter
      });
    }
    
    next();
  };
};

module.exports = { rateLimit, TokenBucketRateLimiter };
