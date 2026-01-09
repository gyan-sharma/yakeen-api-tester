/**
 * Input validation utilities
 */

import { VALIDATION } from '../constants'

/**
 * Validates dateString format (YYYY-MM)
 */
export const validateDateString = (dateString: string): { valid: boolean; error?: string } => {
  if (!dateString || !dateString.trim()) {
    return { valid: false, error: 'DateString is required' }
  }

  const trimmed = dateString.trim()
  
  if (!VALIDATION.DATE_STRING_PATTERN.test(trimmed)) {
    return { valid: false, error: 'DateString must be in YYYY-MM format (e.g., 1444-01)' }
  }

  const [year, month] = trimmed.split('-').map(Number)
  
  if (year < 1400 || year > 1499) {
    return { valid: false, error: 'Year must be between 1400 and 1499' }
  }
  
  if (month < 1 || month > 12) {
    return { valid: false, error: 'Month must be between 01 and 12' }
  }

  return { valid: true }
}

/**
 * Validates NIN format (9-10 digits)
 */
export const validateNIN = (nin: string): { valid: boolean; error?: string } => {
  if (!nin || !nin.trim()) {
    return { valid: false, error: 'NIN is required' }
  }

  const trimmed = nin.trim()
  
  if (!VALIDATION.NIN_PATTERN.test(trimmed)) {
    return { valid: false, error: 'NIN must be 9-10 digits' }
  }

  return { valid: true }
}

/**
 * Validates both dateString and NIN
 */
export const validateApiParams = (
  dateString: string,
  nin: string
): { valid: boolean; errors: string[] } => {
  const errors: string[] = []
  
  const dateValidation = validateDateString(dateString)
  if (!dateValidation.valid) {
    errors.push(dateValidation.error || 'Invalid dateString')
  }
  
  const ninValidation = validateNIN(nin)
  if (!ninValidation.valid) {
    errors.push(ninValidation.error || 'Invalid NIN')
  }
  
  return {
    valid: errors.length === 0,
    errors,
  }
}
