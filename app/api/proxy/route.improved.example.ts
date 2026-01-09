/**
 * IMPROVED PROXY ROUTE EXAMPLE
 * 
 * This is an example showing how to improve the proxy route with:
 * - Input validation
 * - Better error handling
 * - Type safety
 * - Constants usage
 * 
 * To use: Copy the improvements to route.ts
 */

import { NextRequest, NextResponse } from 'next/server'
import https from 'https'
import dns from 'dns'
import { validateApiParams } from '@/lib/utils/validation'
import { standardizeError } from '@/lib/utils/errors'
import { API_CONFIG } from '@/lib/constants'
import type { ProxyApiResponse } from '@/lib/types/api'

export const dynamic = 'force-dynamic'

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 100,
  maxFreeSockets: 50,
  timeout: API_CONFIG.TIMEOUT_MS,
  rejectUnauthorized: false,
  lookup: dns.lookup,
})

// Cache bearer token to avoid reading from env on every request
let cachedBearerToken: string | null = null
const getBearerToken = (): string | null => {
  if (cachedBearerToken === null) {
    const token = process.env.BEARER_TOKEN
    cachedBearerToken = token && token.trim() ? token.trim() : null
  }
  return cachedBearerToken
}

const API_HOSTNAME = 'internal.api.rer.nft'
const API_PORT = 5543
const API_PATH_PREFIX = '/gateway/internal/YakeenService/v1.0/getCitizenInfo'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const dateString = searchParams.get('dateString')
  const nin = searchParams.get('nin')

  // Validate required parameters
  if (!dateString || !nin) {
    return NextResponse.json(
      { error: 'Missing required parameters: dateString and nin' },
      { status: 400 }
    )
  }

  // Validate parameter formats
  const validation = validateApiParams(dateString, nin)
  if (!validation.valid) {
    return NextResponse.json(
      { 
        error: 'Invalid parameters',
        details: validation.errors,
      },
      { status: 400 }
    )
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const bearerToken = getBearerToken()
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`
    }

    // Build query string efficiently
    const queryString = `dateString=${encodeURIComponent(dateString)}&nin=${encodeURIComponent(nin)}`
    const path = `${API_PATH_PREFIX}?${queryString}`

    const response = await Promise.race([
      new Promise<ProxyApiResponse>((resolve, reject) => {
        const options = {
          hostname: API_HOSTNAME,
          port: API_PORT,
          path,
          method: 'GET',
          headers,
          agent: httpsAgent,
        }

        const apiStartTime = Date.now()
        let timeoutId: NodeJS.Timeout | null = null

        const req = https.request(options, (res) => {
          const chunks: Buffer[] = []
          
          res.on('data', (chunk: Buffer) => {
            chunks.push(chunk)
          })
          
          res.on('end', () => {
            if (timeoutId) clearTimeout(timeoutId)
            const apiEndTime = Date.now()
            const apiResponseTime = apiEndTime - apiStartTime
            
            const buffer = Buffer.concat(chunks)
            const dataString = buffer.toString('utf8')
            
            let jsonData: unknown
            try {
              jsonData = JSON.parse(dataString)
            } catch {
              jsonData = dataString
            }
            
            resolve({
              status: res.statusCode || 200,
              ok: (res.statusCode || 200) >= 200 && (res.statusCode || 200) < 300,
              data: jsonData as ProxyApiResponse['data'],
              responseTime: apiResponseTime,
            })
          })
        })

        req.on('error', (error: NodeJS.ErrnoException) => {
          if (timeoutId) clearTimeout(timeoutId)
          const apiEndTime = Date.now()
          const apiResponseTime = apiStartTime ? apiEndTime - apiStartTime : 0
          reject({ error, responseTime: apiResponseTime })
        })

        timeoutId = setTimeout(() => {
          req.destroy()
          const apiEndTime = Date.now()
          const apiResponseTime = apiStartTime ? apiEndTime - apiStartTime : API_CONFIG.TIMEOUT_MS
          reject({ 
            error: new Error('Request timeout'), 
            responseTime: apiResponseTime 
          })
        }, API_CONFIG.TIMEOUT_MS)

        req.end()
      }),
      new Promise<never>((_, reject) => 
        setTimeout(() => reject({ 
          error: new Error('Request timeout'), 
          responseTime: API_CONFIG.TIMEOUT_MS 
        }), API_CONFIG.TIMEOUT_MS)
      )
    ])

    return NextResponse.json({
      status: response.status,
      ok: response.ok,
      data: response.data,
      responseTime: response.responseTime,
    })
  } catch (error: unknown) {
    // Use standardized error handling
    const standardized = standardizeError(error)
    const responseTime = (error as { responseTime?: number })?.responseTime || 0
    
    console.error('Proxy error:', {
      message: standardized.message,
      code: standardized.code,
      statusCode: standardized.statusCode,
      retryable: standardized.retryable,
    })
    
    return NextResponse.json(
      { 
        error: standardized.userFriendlyMessage,
        details: standardized.message,
        code: standardized.code,
        retryable: standardized.retryable,
        responseTime: responseTime,
      },
      { status: standardized.statusCode || 500 }
    )
  }
}
