/**
 * Error handling utilities
 */

/**
 * Maps technical error codes to user-friendly messages
 */
export const getUserFriendlyError = (error: Error | { code?: string; message?: string }): string => {
  const errorCode = 'code' in error ? error.code : undefined
  const errorMessage = error.message || 'An unexpected error occurred'

  const errorMap: Record<string, string> = {
    'ENOTFOUND': 'Cannot connect to API server. Please check your network connection.',
    'ECONNREFUSED': 'API server refused the connection. The server may be down.',
    'CERT_HAS_EXPIRED': 'SSL certificate error. Please contact the API administrator.',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE': 'SSL certificate verification failed. The API may be using a self-signed certificate.',
    'ETIMEDOUT': 'Request timed out. The API server may be slow or unavailable.',
    'ECONNRESET': 'Connection was reset by the server. Please try again.',
    'AbortError': 'Request was cancelled.',
  }

  if (errorCode && errorMap[errorCode]) {
    return errorMap[errorCode]
  }

  // Check if error message contains known patterns
  if (errorMessage.includes('timeout')) {
    return 'Request timed out. The API server may be slow or unavailable.'
  }

  if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
    return 'Network error. Please check your internet connection.'
  }

  return errorMessage
}

/**
 * Determines if an error is retryable
 */
export const isRetryableError = (error: Error | { code?: string; statusCode?: number }): boolean => {
  const errorCode = 'code' in error ? error.code : undefined
  const statusCode = 'statusCode' in error ? error.statusCode : undefined

  // Network errors that might be transient
  const retryableErrorCodes = ['ETIMEDOUT', 'ECONNRESET', 'ENOTFOUND', 'ECONNREFUSED']
  
  if (errorCode && retryableErrorCodes.includes(errorCode)) {
    return true
  }

  // HTTP status codes that indicate transient failures
  const retryableStatusCodes = [500, 502, 503, 504, 408]
  
  if (statusCode && retryableStatusCodes.includes(statusCode)) {
    return true
  }

  return false
}

/**
 * Creates a standardized error object
 */
export interface StandardizedError {
  message: string
  code?: string
  statusCode?: number
  userFriendlyMessage: string
  retryable: boolean
}

export const standardizeError = (
  error: unknown,
  statusCode?: number
): StandardizedError => {
  let errorObj: Error | { code?: string; message?: string } = {
    message: 'Unknown error',
  }

  if (error instanceof Error) {
    errorObj = error
  } else if (typeof error === 'object' && error !== null) {
    errorObj = error as { code?: string; message?: string }
  } else {
    errorObj = { message: String(error) }
  }

  return {
    message: errorObj.message || 'Unknown error',
    code: 'code' in errorObj ? errorObj.code : undefined,
    statusCode,
    userFriendlyMessage: getUserFriendlyError(errorObj),
    retryable: isRetryableError({ ...errorObj, statusCode }),
  }
}
