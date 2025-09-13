import { useState, useCallback, useRef } from 'react';

export const useAsyncWithRetry = (asyncFunction, options = {}) => {
  const [state, setState] = useState({
    data: null,
    loading: false,
    error: null,
    attempt: 0
  });

  const retryConfig = {
    maxRetries: options.maxRetries || 3,
    baseDelay: options.baseDelay || 1000,
    exponentialBase: options.exponentialBase || 2,
    maxDelay: options.maxDelay || 30000,
    ...options
  };

  const abortControllerRef = useRef();

  const calculateDelay = useCallback((attempt) => {
    let delay = retryConfig.baseDelay * Math.pow(retryConfig.exponentialBase, attempt);
    return Math.min(delay, retryConfig.maxDelay);
  }, [retryConfig]);

  const isRetryableError = useCallback((error) => {
    if (error.name === 'AbortError') return false;
    if (error.status && error.status < 500 && error.status !== 408 && error.status !== 429) {
      return false;
    }
    return true;
  }, []);

  const execute = useCallback(async (...args) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    abortControllerRef.current = new AbortController();
    
    setState(prev => ({ 
      ...prev, 
      loading: true, 
      error: null, 
      attempt: 0 
    }));

    let lastError;
    
    for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
      try {
        setState(prev => ({ ...prev, attempt: attempt + 1 }));
        
        const result = await asyncFunction(...args, {
          signal: abortControllerRef.current.signal
        });
        
        setState({
          data: result,
          loading: false,
          error: null,
          attempt: attempt + 1
        });
        
        return result;
      } catch (error) {
        lastError = error;
        
        if (error.name === 'AbortError') {
          setState(prev => ({ 
            ...prev, 
            loading: false,
            error: null 
          }));
          return;
        }
        
        if (attempt === retryConfig.maxRetries || !isRetryableError(error)) {
          break;
        }
        
        const delay = calculateDelay(attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    setState({
      data: null,
      loading: false,
      error: lastError,
      attempt: retryConfig.maxRetries + 1
    });
    
    throw lastError;
  }, [asyncFunction, retryConfig, calculateDelay, isRetryableError]);

  const reset = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setState({
      data: null,
      loading: false,
      error: null,
      attempt: 0
    });
  }, []);

  return {
    ...state,
    execute,
    reset,
    isRetrying: state.loading && state.attempt > 1
  };
};

const DataComponent = () => {
  const fetchData = async (id, { signal }) => {
    const response = await fetch(`/api/data/${id}`, { signal });
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status}`);
    }
    return response.json();
  };

  const { data, loading, error, attempt, execute, isRetrying } = useAsyncWithRetry(
    fetchData,
    { maxRetries: 3, baseDelay: 1000 }
  );

  const handleFetchData = () => {
    execute('123');
  };

  return (
    <div>
      <button onClick={handleFetchData} disabled={loading}>
        {loading ? (isRetrying ? `Retrying... (${attempt})` : 'Loading...') : 'Fetch Data'}
      </button>
      {error && <p>Error: {error.message}</p>}
      {data && <pre>{JSON.stringify(data, null, 2)}</pre>}
    </div>
  );
};
