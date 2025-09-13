class RetryService {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseDelay = options.baseDelay || 1000;
    this.maxDelay = options.maxDelay || 30000;
    this.exponentialBase = options.exponentialBase || 2;
    this.jitter = options.jitter !== false;
  }

  async executeWithRetry(fn, context = {}) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await fn(attempt, context);
        
        if (attempt > 0) {
          console.log(`Operation succeeded on attempt ${attempt + 1}`);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (attempt === this.maxRetries) break;
        
        if (!this.isRetryableError(error)) {
          throw error;
        }
        
        const delay = this.calculateDelay(attempt);
        console.log(`Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
        
        await this.sleep(delay);
      }
    }
    
    throw new Error(`Operation failed after ${this.maxRetries + 1} attempts: ${lastError.message}`);
  }

  calculateDelay(attempt) {
    let delay = this.baseDelay * Math.pow(this.exponentialBase, attempt);
    delay = Math.min(delay, this.maxDelay);
    
    if (this.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5);
    }
    
    return Math.floor(delay);
  }

  isRetryableError(error) {
    if (error.code === 'ECONNRESET' || 
        error.code === 'ETIMEDOUT' || 
        error.code === 'ENOTFOUND') {
      return true;
    }
    
    if (error.response) {
      const status = error.response.status;
      return status >= 500 || status === 408 || status === 429;
    }
    
    return false;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

const retryService = new RetryService({
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000
});

const makeApiCall = async (attempt) => {
  const response = await fetch('https://api.example.com/data', {
    timeout: 5000
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  return response.json();
};

try {
  const data = await retryService.executeWithRetry(makeApiCall);
  console.log('Data received:', data);
} catch (error) {
  console.error('All retry attempts failed:', error);
}
