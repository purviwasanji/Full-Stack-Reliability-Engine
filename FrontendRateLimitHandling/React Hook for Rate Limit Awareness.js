import { useState, useCallback, useRef } from 'react';

export const useRateLimit = () => {
  const [rateLimitState, setRateLimitState] = useState({
    remaining: null,
    limit: null,
    resetTime: null,
    isLimited: false
  });
  
  const queueRef = useRef([]);
  const processingRef = useRef(false);

  const updateRateLimitInfo = useCallback((headers) => {
    const remaining = parseInt(headers['x-ratelimit-remaining']);
    const limit = parseInt(headers['x-ratelimit-limit']);
    const resetTime = headers['x-ratelimit-reset'];
    
    setRateLimitState({
      remaining,
      limit,
      resetTime: new Date(resetTime),
      isLimited: remaining <= 0
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current || queueRef.current.length === 0) return;
    
    processingRef.current = true;
    
    while (queueRef.current.length > 0) {
      const { request, resolve, reject } = queueRef.current.shift();
      
      try {
        const response = await request();
        updateRateLimitInfo(response.headers);
        resolve(response);
        
        if (rateLimitState.isLimited) {
          const waitTime = rateLimitState.resetTime - new Date();
          if (waitTime > 0) {
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      } catch (error) {
        reject(error);
      }
    }
    
    processingRef.current = false;
  }, [rateLimitState, updateRateLimitInfo]);

  const queueRequest = useCallback((requestFn) => {
    return new Promise((resolve, reject) => {
      queueRef.current.push({ request: requestFn, resolve, reject });
      processQueue();
    });
  }, [processQueue]);

  return {
    rateLimitState,
    queueRequest,
    updateRateLimitInfo
  };
};
