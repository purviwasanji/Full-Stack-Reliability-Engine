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
const { Pool } = require('pg');
const pool = new Pool();

class DatabaseRateLimiter {
  constructor(limit = 100, windowMinutes = 60) {
    this.limit = limit;
    this.windowMinutes = windowMinutes;
  }

  async checkRateLimit(identifier, endpoint) {
    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - this.windowMinutes);
    
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      await client.query(
        'DELETE FROM rate_limits WHERE window_start < $1',
        [windowStart]
      );
      
      const result = await client.query(`
        INSERT INTO rate_limits (identifier, endpoint, window_start, count)
        VALUES ($1, $2, DATE_TRUNC('minute', NOW()), 1)
        ON CONFLICT (identifier, endpoint, window_start)
        DO UPDATE SET count = rate_limits.count + 1
        RETURNING count
      `, [identifier, endpoint]);
      
      const count = result.rows[0].count;
      await client.query('COMMIT');
      
      return {
        allowed: count <= this.limit,
        count,
        limit: this.limit,
        resetTime: new Date(Date.now() + this.windowMinutes * 60000)
      };
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
