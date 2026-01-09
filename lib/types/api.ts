/**
 * Type definitions for API-related structures
 */

/**
 * API call result
 */
export interface ApiResult {
  id: number
  dateString: string
  nin: string
  status: 'success' | 'error'
  response?: ApiResponseData | null
  error?: string
  duration: number
  timestamp: number
  statusCode?: number
  retryCount?: number // Track retry attempts
}

/**
 * API response data structure
 * Update this based on actual API response structure
 */
export interface ApiResponseData {
  // Define based on actual Yakeen API response
  // Example structure (update as needed):
  [key: string]: unknown
}

/**
 * Proxy API response structure
 */
export interface ProxyApiResponse {
  status: number
  ok: boolean
  data: ApiResponseData | null
  responseTime: number
  error?: string
  details?: string
  code?: string
}

/**
 * Response time data point for graphing
 */
export interface ResponseTimeData {
  time: string
  duration: number
  success: number
  error: number
}

/**
 * Manual test parameters
 */
export interface ManualParams {
  dateString: string
  nin: string
}

/**
 * API log entry
 */
export interface ApiLogEntry {
  serial: number
  statusCode: number
  responsePreview: string
  time: number
}

/**
 * Statistics structure
 */
export interface TestStatistics {
  total: number
  success: number
  error: number
  averageTime: number
  minTime?: number
  maxTime?: number
  percentiles?: Record<number, number>
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number
  retryDelay: number
  retryableStatusCodes: number[]
}
