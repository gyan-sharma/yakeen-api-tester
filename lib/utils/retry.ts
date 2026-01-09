/**
 * Retry utility for API calls
 */

import { API_CONFIG } from '../constants'
import { RetryConfig } from '../types/api'

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: API_CONFIG.MAX_RETRIES,
  retryDelay: API_CONFIG.RETRY_DELAY_MS,
  retryableStatusCodes: API_CONFIG.RETRYABLE_STATUS_CODES,
}

/**
 * Sleep utility for delays
 */
const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Retries a function with exponential backoff
 * @param fn - The function to retry
 * @param config - Retry configuration
 * @returns The result of the function call
 * @throws The last error if all retries fail
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<{ result: T; retryCount: number }> {
  let lastError: unknown
  let retryCount = 0

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const result = await fn()
      return { result, retryCount }
    } catch (error) {
      lastError = error

      // Don't retry on the last attempt
      if (attempt >= config.maxRetries) {
        break
      }

      // Check if error is retryable
      const errorObj = error as { statusCode?: number; code?: string }
      const isRetryable = 
        config.retryableStatusCodes.includes(errorObj.statusCode || 0) ||
        (errorObj.code && ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND'].includes(errorObj.code))

      if (!isRetryable) {
        // Error is not retryable, throw immediately
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = config.retryDelay * Math.pow(2, attempt)
      retryCount++

      // Wait before retrying
      await sleep(delay)
    }
  }

  // All retries exhausted, throw the last error
  throw lastError
}
