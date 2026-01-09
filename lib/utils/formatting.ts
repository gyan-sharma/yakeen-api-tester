/**
 * Formatting utilities for responses, errors, and data
 */

/**
 * Formats a response value into a preview string
 * @param response - The response value to format
 * @param maxLength - Maximum length of the preview (default: 50)
 * @returns Formatted preview string
 */
export const formatResponsePreview = (response: unknown, maxLength: number = 50): string => {
  if (response === null || response === undefined) {
    return ''
  }

  const responseType = typeof response

  if (responseType === 'string') {
    return response.length > maxLength 
      ? `${response.substring(0, maxLength)}...` 
      : response
  }

  if (responseType === 'object') {
    try {
      const responseStr = JSON.stringify(response)
      return responseStr.length > maxLength 
        ? `${responseStr.substring(0, maxLength)}...` 
        : responseStr
    } catch {
      return String(response).substring(0, maxLength)
    }
  }

  const responseStr = String(response)
  return responseStr.length > maxLength 
    ? `${responseStr.substring(0, maxLength)}...` 
    : responseStr
}

/**
 * Formats time in HHMMSS format
 */
export const formatTimeHHMMSS = (date: Date): string => {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}${minutes}${seconds}`
}

/**
 * Formats duration in milliseconds to human-readable string
 */
export const formatDuration = (ms: number): string => {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`
  }
  const minutes = Math.floor(ms / 60000)
  const seconds = ((ms % 60000) / 1000).toFixed(0)
  return `${minutes}m ${seconds}s`
}

/**
 * Calculates percentiles from an array of numbers
 */
export const calculatePercentiles = (
  values: number[],
  percentiles: number[] = [50, 75, 90, 95, 99]
): Record<number, number> => {
  if (values.length === 0) {
    return {}
  }

  const sorted = [...values].sort((a, b) => a - b)
  const result: Record<number, number> = {}

  for (const percentile of percentiles) {
    const index = Math.floor((sorted.length - 1) * (percentile / 100))
    result[percentile] = sorted[index] || 0
  }

  return result
}
