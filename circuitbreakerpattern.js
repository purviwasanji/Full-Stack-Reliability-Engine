class CircuitBreaker {
  constructor(options = {}) {
    this.failureThreshold = options.failureThreshold || 5;
    this.recoveryTimeout = options.recoveryTimeout || 60000;
    this.monitoringPeriod = options.monitoringPeriod || 10000;
    
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    
    this.stats = {
      totalRequests: 0,
      totalFailures: 0,
      totalSuccesses: 0
    };
  }

  async execute(fn) {
    this.stats.totalRequests++;
    
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttemptTime) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  onSuccess() {
    this.stats.totalSuccesses++;
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  onFailure() {
    this.stats.totalFailures++;
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttemptTime = Date.now() + this.recoveryTimeout;
    }
  }

  getStats() {
    return {
      ...this.stats,
      state: this.state,
      failureCount: this.failureCount,
      successRate: this.stats.totalRequests > 0 
        ? (this.stats.totalSuccesses / this.stats.totalRequests * 100).toFixed(2)
        : 0
    };
  }
}

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 3,
  recoveryTimeout: 30000
});

const makeProtectedApiCall = async () => {
  return circuitBreaker.execute(async () => {
    const response = await fetch('https://unreliable-api.com/data');
    if (!response.ok) {
      throw new Error(`API call failed: ${response.status}`);
    }
    return response.json();
  });
};
