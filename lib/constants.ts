/**
 * Application-wide constants
 * Centralized configuration for easier maintenance
 */

export const API_CONFIG = {
  BASE_URL: 'https://internal.api.rer.nft:5543/gateway/internal/YakeenService/v1.0/getCitizenInfo',
  TIMEOUT_MS: parseInt(process.env.API_TIMEOUT_MS || '10000', 10),
  MAX_RETRIES: parseInt(process.env.API_MAX_RETRIES || '3', 10),
  RETRY_DELAY_MS: parseInt(process.env.API_RETRY_DELAY_MS || '1000', 10),
  RATE_LIMIT_DELAY_MS: parseInt(process.env.API_RATE_LIMIT_DELAY_MS || '100', 10),
  RETRYABLE_STATUS_CODES: [500, 502, 503, 504, 408], // Server errors and timeout
} as const

export const UI_CONFIG = {
  RESULTS_PER_PAGE: 20,
  DEFAULT_UI_UPDATE_INTERVAL: 500,
  DEFAULT_GRAPH_MAX_POINTS: 100,
  DEFAULT_LOG_MAX_ENTRIES: 100,
  DEFAULT_API_LOG_MAX_ENTRIES: 100,
  BATCH_UPDATE_THRESHOLD: 10,
  MAX_RESULTS_IN_MEMORY: 1000, // Prevent memory issues with large test runs
} as const

export const VALIDATION = {
  DATE_STRING_PATTERN: /^\d{4}-\d{2}$/, // YYYY-MM format (e.g., 1444-01)
  NIN_PATTERN: /^\d{9,10}$/, // 9-10 digits
  MAX_CALL_COUNT: 10000,
  MIN_CALL_COUNT: 1,
  MAX_REPEAT_COUNT: 50000,
  MIN_REPEAT_COUNT: 1,
} as const

export const DATE_RANGE = {
  MIN_YEAR: 1400,
  MAX_YEAR: 1499,
  MIN_MONTH: 1,
  MAX_MONTH: 12,
} as const

export const NIN_RANGE = {
  MIN: 100000000,
  MAX: 999999999,
} as const
