import axios from 'axios';

const createRateLimitInterceptor = () => {
  const requestQueue = [];
  let isProcessing = false;
  let rateLimitInfo = {
    remaining: null,
    resetTime: null
  };

  const processQueue = async () => {
    if (isProcessing || requestQueue.length === 0) return;
    isProcessing = true;

    while (requestQueue.length > 0) {
      const { config, resolve, reject } = requestQueue.shift();
      
      if (rateLimitInfo.remaining <= 0 && rateLimitInfo.resetTime) {
        const waitTime = rateLimitInfo.resetTime - Date.now();
        if (waitTime > 0) {
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      try {
        const response = await axios.request(config);
        resolve(response);
      } catch (error) {
        reject(error);
      }
    }

    isProcessing = false;
  };

  axios.interceptors.request.use(
    config => {
      if (rateLimitInfo.remaining <= 0) {
        return new Promise((resolve, reject) => {
          requestQueue.push({ config, resolve, reject });
          processQueue();
        });
      }
      return config;
    },
    error => Promise.reject(error)
  );

  axios.interceptors.response.use(
    response => {
      rateLimitInfo.remaining = parseInt(response.headers['x-ratelimit-remaining']);
      rateLimitInfo.resetTime = new Date(response.headers['x-ratelimit-reset']).getTime();
      
      return response;
    },
    error => {
      if (error.response?.status === 429) {
        const retryAfter = error.response.headers['retry-after'];
        rateLimitInfo.remaining = 0;
        rateLimitInfo.resetTime = Date.now() + (retryAfter * 1000);
        
        return new Promise((resolve, reject) => {
          requestQueue.push({ 
            config: error.config, 
            resolve, 
            reject 
          });
          processQueue();
        });
      }
      return Promise.reject(error);
    }
  );
};

export default createRateLimitInterceptor;
