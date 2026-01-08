import { NextRequest, NextResponse } from 'next/server'
import https from 'https'

export const dynamic = 'force-dynamic'

// Create a reusable HTTP agent with connection pooling for maximum performance
// This allows connection reuse across multiple requests, dramatically reducing overhead
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 50, // Maximum number of sockets per host
  maxFreeSockets: 10, // Maximum number of free sockets to keep open
  timeout: 30000, // Socket timeout
  rejectUnauthorized: false, // Disable SSL certificate verification for internal APIs
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

// Pre-parse base URL components to avoid parsing on every request
const API_HOSTNAME = 'internal.api.rer.nft'
const API_PORT = 5543
const API_PATH_PREFIX = '/gateway/internal/YakeenService/v1.0/getCitizenInfo'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const dateString = searchParams.get('dateString')
  const nin = searchParams.get('nin')

  if (!dateString || !nin) {
    return NextResponse.json(
      { error: 'Missing required parameters: dateString and nin' },
      { status: 400 }
    )
  }

  try {
    // Build headers object efficiently
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    // Use cached bearer token
    const bearerToken = getBearerToken()
    if (bearerToken) {
      headers['Authorization'] = `Bearer ${bearerToken}`
    }

    // Build query string efficiently
    const queryString = `dateString=${encodeURIComponent(dateString)}&nin=${encodeURIComponent(nin)}`
    const path = `${API_PATH_PREFIX}?${queryString}`

    // Use Node.js https module with connection pooling agent
    const response = await new Promise<any>((resolve, reject) => {
      const options = {
        hostname: API_HOSTNAME,
        port: API_PORT,
        path,
        method: 'GET',
        headers,
        agent: httpsAgent, // Use the pooled agent for connection reuse
      }

      // Track when request is actually sent
      const apiStartTime = Date.now()

      const req = https.request(options, (res) => {
        // Use Buffer chunks for better performance than string concatenation
        const chunks: Buffer[] = []
        
        res.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })
        
        res.on('end', () => {
          const apiEndTime = Date.now()
          const apiResponseTime = apiEndTime - apiStartTime
          
          // Concatenate buffers and convert to string once
          const buffer = Buffer.concat(chunks)
          const dataString = buffer.toString('utf8')
          
          let jsonData
          try {
            jsonData = JSON.parse(dataString)
          } catch {
            // If parsing fails, return the raw data as string
            jsonData = dataString
          }
          
          resolve({
            status: res.statusCode || 200,
            ok: (res.statusCode || 200) >= 200 && (res.statusCode || 200) < 300,
            data: jsonData,
            responseTime: apiResponseTime,
          })
        })
      })

      req.on('error', (error) => {
        const apiEndTime = Date.now()
        const apiResponseTime = apiStartTime ? apiEndTime - apiStartTime : 0
        reject({ error, responseTime: apiResponseTime })
      })

      // Send request immediately
      req.end()
    })

    return NextResponse.json({
      status: response.status,
      ok: response.ok,
      data: response.data,
      responseTime: response.responseTime,
    })
  } catch (error: any) {
    console.error('Proxy error:', error)
    const actualError = error.error || error
    const errorMessage = actualError.message || 'Failed to fetch'
    const errorDetails = actualError.toString()
    const responseTime = error.responseTime || 0
    
    // Check for specific error types
    let detailedError = errorMessage
    if (actualError.code === 'CERT_HAS_EXPIRED' || actualError.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
      detailedError = `SSL Certificate Error: ${errorMessage}. The API may be using a self-signed certificate.`
    } else if (actualError.code === 'ENOTFOUND' || actualError.code === 'ECONNREFUSED') {
      detailedError = `Connection Error: ${errorMessage}. Cannot reach the API server.`
    }
    
    return NextResponse.json(
      { 
        error: detailedError,
        details: errorDetails,
        code: actualError.code,
        responseTime: responseTime,
      },
      { status: 500 }
    )
  }
}
