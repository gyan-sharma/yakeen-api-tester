'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'

interface ApiResult {
  id: number
  dateString: string
  nin: string
  status: 'success' | 'error'
  response?: any
  error?: string
  duration: number
  timestamp: number
  statusCode?: number
}

interface ResponseTimeData {
  time: string
  duration: number
  success: number
  error: number
}

interface ManualParams {
  dateString: string
  nin: string
}

interface ApiLogEntry {
  serial: number
  statusCode: number
  responsePreview: string
  time: number
}

export default function Home() {
  const [isRunning, setIsRunning] = useState(false)
  const [results, setResults] = useState<ApiResult[]>([])
  const [manualResults, setManualResults] = useState<ApiResult[]>([])
  const [callCount, setCallCount] = useState<number>(1000)
  const [callCountInput, setCallCountInput] = useState<string>('1000')
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [activeTab, setActiveTab] = useState<'manual' | 'batch'>('manual')
  const [batchMode, setBatchMode] = useState<'sequential' | 'parallel'>('sequential')
  const [threadCount, setThreadCount] = useState<number>(5)
  const [threadCountInput, setThreadCountInput] = useState<string>('5')
  const [manualRepeatCount, setManualRepeatCount] = useState<number>(1)
  const [manualRepeatCountInput, setManualRepeatCountInput] = useState<string>('1')
  const [responseTimeData, setResponseTimeData] = useState<ResponseTimeData[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [apiLogs, setApiLogs] = useState<ApiLogEntry[]>([])
  const abortControllerRef = useRef<AbortController | null>(null)
  const resultsPerPage = 20
  
  // Use refs to batch graph updates
  const graphDataBufferRef = useRef<ResponseTimeData[]>([])
  const graphUpdateTimerRef = useRef<NodeJS.Timeout | null>(null)
  const graphSequenceRef = useRef<number>(0) // Sequential index for unique X-axis values
  
  // Optimized graph update function (batched with sequential indexing)
  const addGraphDataPoint = useCallback((result: ApiResult) => {
    // Use sequential index for unique X-axis values (prevents timestamp collisions)
    graphSequenceRef.current += 1
    const timeLabel = graphSequenceRef.current.toString()
    
    graphDataBufferRef.current.push({
      time: timeLabel,
      duration: result.duration,
      success: result.status === 'success' ? 1 : 0,
      error: result.status === 'error' ? 1 : 0,
    })
    
    // Batch graph updates every 5 points or 100ms for smoother visualization
    // Reduced batch size to minimize visual artifacts from batching
    if (graphDataBufferRef.current.length >= 5 || !graphUpdateTimerRef.current) {
      if (graphUpdateTimerRef.current) {
        clearTimeout(graphUpdateTimerRef.current)
      }
      setResponseTimeData(prev => {
        const newData = [...prev, ...graphDataBufferRef.current]
        graphDataBufferRef.current = []
        return newData.slice(-100) // Keep last 100 data points
      })
      graphUpdateTimerRef.current = null
    } else if (!graphUpdateTimerRef.current) {
      graphUpdateTimerRef.current = setTimeout(() => {
        setResponseTimeData(prev => {
          const newData = [...prev, ...graphDataBufferRef.current]
          graphDataBufferRef.current = []
          return newData.slice(-100)
        })
        graphUpdateTimerRef.current = null
      }, 100) // Reduced timeout for more frequent updates
    }
  }, [])

  const API_BASE_URL = 'https://internal.api.rer.nft:5543/gateway/internal/YakeenService/v1.0/getCitizenInfo'

  const [manualParams, setManualParams] = useState<ManualParams[]>([
    { dateString: '', nin: '' },
  ])

  const [stats, setStats] = useState({
    total: 0,
    success: 0,
    error: 0,
    averageTime: 0,
  })

  // Generate random dateString (YYYY-MM format, year between 1400-1500)
  const generateRandomDateString = (): string => {
    const year = Math.floor(Math.random() * 100) + 1400 // 1400-1499
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')
    return `${year}-${month}`
  }

  // Generate random NIN (9 digits)
  const generateRandomNIN = (): string => {
    return String(Math.floor(Math.random() * 900000000) + 100000000)
  }

  // Batch log updates to reduce re-renders
  const logBufferRef = useRef<string[]>([])
  const apiLogBufferRef = useRef<ApiLogEntry[]>([])
  const logUpdateTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Add log entry (batched)
  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    logBufferRef.current.push(`[${timestamp}] ${message}`)
    
    // Batch log updates every 100ms or when buffer reaches 10 entries
    if (logBufferRef.current.length >= 10 || !logUpdateTimerRef.current) {
      if (logUpdateTimerRef.current) {
        clearTimeout(logUpdateTimerRef.current)
      }
      setLogs(prev => [...logBufferRef.current, ...prev].slice(0, 100))
      logBufferRef.current = []
      logUpdateTimerRef.current = null
    } else if (!logUpdateTimerRef.current) {
      logUpdateTimerRef.current = setTimeout(() => {
        setLogs(prev => [...logBufferRef.current, ...prev].slice(0, 100))
        logBufferRef.current = []
        logUpdateTimerRef.current = null
      }, 100)
    }
  }, [])

  // Add API log entry (batched and optimized)
  // Optimized: avoid JSON.stringify when possible, use faster string conversion
  const addApiLog = useCallback((statusCode: number, response: any, time: number) => {
    // Fast string conversion - avoid JSON.stringify when not needed
    let preview = ''
    if (response !== null && response !== undefined) {
      const responseType = typeof response
      if (responseType === 'string') {
        preview = response.length > 50 ? response.substring(0, 50) + '...' : response
      } else if (responseType === 'object') {
        // Only stringify if absolutely necessary (for objects)
        try {
          const responseStr = JSON.stringify(response)
          preview = responseStr.length > 50 ? responseStr.substring(0, 50) + '...' : responseStr
        } catch {
          preview = String(response).substring(0, 50)
        }
      } else {
        // For primitives, use fast String() conversion
        const responseStr = String(response)
        preview = responseStr.length > 50 ? responseStr.substring(0, 50) + '...' : responseStr
      }
    }
    
    const serial = apiLogs.length + apiLogBufferRef.current.length + 1
    apiLogBufferRef.current.push({ serial, statusCode, responsePreview: preview, time })
    
    // Batch API log updates every 10 entries or 200ms
    if (apiLogBufferRef.current.length >= 10) {
      setApiLogs(prev => {
        const newLogs = [...prev, ...apiLogBufferRef.current]
        apiLogBufferRef.current = []
        return newLogs.slice(-100) // Keep last 100 logs
      })
    }
  }, [apiLogs.length])

  // Make a single API call with specific parameters
  // Optimized for sequential mode: collect logs in buffer instead of updating state immediately
  const makeApiCallWithParams = async (
    id: number,
    dateString: string,
    nin: string,
    signal?: AbortSignal,
    isManual: boolean = false,
    skipLogging: boolean = false,
    logBuffer?: string[],
    apiLogBuffer?: ApiLogEntry[]
  ): Promise<ApiResult> => {
    try {
      // Use Next.js API route as proxy to bypass CORS
      // Optimized: build URL efficiently without template literals overhead
      const proxyUrl = `/api/proxy?dateString=${encodeURIComponent(dateString)}&nin=${encodeURIComponent(nin)}`
      
      // Use fetch with keepalive for better connection reuse (browser optimization)
      const response = await fetch(proxyUrl, {
        method: 'GET',
        signal,
        keepalive: true, // Enable keepalive for connection reuse
      })

      let proxyData
      
      try {
        proxyData = await response.json()
      } catch {
        // If we can't parse the response, we don't have response time info
        const statusCode = response.status || 500
        const result: ApiResult = {
          id,
          dateString,
          nin,
          status: 'error',
          error: `Failed to parse response: ${response.status} ${response.statusText}`,
          duration: 0,
          timestamp: Date.now(),
          statusCode,
        }
        if (!skipLogging) {
          const logPrefix = isManual ? 'Manual' : 'Call'
          const logMessage = `${logPrefix} #${id}: ERROR - Failed to parse response - dateString: ${dateString}, nin: ${nin}`
          if (logBuffer) {
            // Collect in buffer for sequential mode
            const timestamp = new Date().toLocaleTimeString()
            logBuffer.push(`[${timestamp}] ${logMessage}`)
          } else {
            addLog(logMessage)
          }
          if (apiLogBuffer) {
            // Serial will be corrected when flushing at the end
            apiLogBuffer.push({ serial: 0, statusCode, responsePreview: `Failed to parse: ${response.statusText}`, time: result.duration })
          } else {
            addApiLog(statusCode, `Failed to parse: ${response.statusText}`, result.duration)
          }
        }
        return result
      }

      // Use actual API response time from proxy (measured on server side)
      const apiResponseTime = proxyData.responseTime || 0
      const statusCode = proxyData.status || response.status || 500

      // Check if proxy returned an error
      if (!response.ok || proxyData.error) {
        const result: ApiResult = {
          id,
          dateString,
          nin,
          status: 'error',
          error: proxyData.error || `Proxy error: ${response.status} ${response.statusText}`,
          response: proxyData,
          duration: apiResponseTime,
          timestamp: Date.now(),
          statusCode,
        }
        if (!skipLogging) {
          const logPrefix = isManual ? 'Manual' : 'Call'
          const logMessage = `${logPrefix} #${id}: ERROR - ${result.error} - dateString: ${dateString}, nin: ${nin} - ${apiResponseTime}ms`
          if (logBuffer) {
            // Collect in buffer for sequential mode
            const timestamp = new Date().toLocaleTimeString()
            logBuffer.push(`[${timestamp}] ${logMessage}`)
          } else {
            addLog(logMessage)
          }
          // Prepare API log preview
          let preview = ''
          const errorData = proxyData.error || proxyData
          if (errorData !== null && errorData !== undefined) {
            const errorType = typeof errorData
            if (errorType === 'string') {
              preview = errorData.length > 50 ? errorData.substring(0, 50) + '...' : errorData
            } else if (errorType === 'object') {
              try {
                const errorStr = JSON.stringify(errorData)
                preview = errorStr.length > 50 ? errorStr.substring(0, 50) + '...' : errorStr
              } catch {
                preview = String(errorData).substring(0, 50)
              }
            } else {
              preview = String(errorData).substring(0, 50)
            }
          }
          if (apiLogBuffer) {
            // Serial will be corrected when flushing at the end
            apiLogBuffer.push({ serial: 0, statusCode, responsePreview: preview, time: result.duration })
          } else {
            addApiLog(statusCode, errorData, result.duration)
          }
        }
        return result
      }

      const result: ApiResult = {
        id,
        dateString,
        nin,
        status: proxyData.ok ? 'success' : 'error',
        response: proxyData.data,
        duration: apiResponseTime,
        timestamp: Date.now(),
        statusCode,
      }

      if (!skipLogging) {
        const logPrefix = isManual ? 'Manual' : 'Call'
        const logMessage = `${logPrefix} #${id}: ${result.status.toUpperCase()} - ${apiResponseTime}ms - dateString: ${dateString}, nin: ${nin}`
        if (logBuffer) {
          // Collect in buffer for sequential mode
          const timestamp = new Date().toLocaleTimeString()
          logBuffer.push(`[${timestamp}] ${logMessage}`)
        } else {
          addLog(logMessage)
        }
        // Prepare API log preview
        let preview = ''
        if (proxyData.data !== null && proxyData.data !== undefined) {
          const dataType = typeof proxyData.data
          if (dataType === 'string') {
            preview = proxyData.data.length > 50 ? proxyData.data.substring(0, 50) + '...' : proxyData.data
          } else if (dataType === 'object') {
            try {
              const dataStr = JSON.stringify(proxyData.data)
              preview = dataStr.length > 50 ? dataStr.substring(0, 50) + '...' : dataStr
            } catch {
              preview = String(proxyData.data).substring(0, 50)
            }
          } else {
            preview = String(proxyData.data).substring(0, 50)
          }
        }
        if (apiLogBuffer) {
          // Serial will be corrected when flushing at the end
          apiLogBuffer.push({ serial: 0, statusCode, responsePreview: preview, time: result.duration })
        } else {
          addApiLog(statusCode, proxyData.data, result.duration)
        }
      }
      
      return result
    } catch (error: any) {
      let errorMessage = 'Unknown error'
      let responseTime = 0
      
      if (error.name === 'AbortError') {
        errorMessage = 'Request aborted'
      } else if (error.message) {
        errorMessage = error.message
      } else if (error.toString) {
        errorMessage = error.toString()
      }
      
      const result: ApiResult = {
        id,
        dateString,
        nin,
        status: 'error',
        error: errorMessage,
        duration: responseTime,
        timestamp: Date.now(),
        statusCode: 0, // Network/abort errors don't have status codes
      }

      if (error.name !== 'AbortError' && !skipLogging) {
        const logPrefix = isManual ? 'Manual' : 'Call'
        const logMessage = `${logPrefix} #${id}: ERROR - ${errorMessage} - dateString: ${dateString}, nin: ${nin}`
        if (logBuffer) {
          // Collect in buffer for sequential mode
          const timestamp = new Date().toLocaleTimeString()
          logBuffer.push(`[${timestamp}] ${logMessage}`)
        } else {
          addLog(logMessage)
        }
        if (apiLogBuffer) {
          // Serial will be corrected when flushing at the end
          apiLogBuffer.push({ serial: 0, statusCode: 0, responsePreview: errorMessage.length > 50 ? errorMessage.substring(0, 50) + '...' : errorMessage, time: result.duration })
        } else {
          addApiLog(0, errorMessage, result.duration)
        }
        console.error('API call error:', error)
      }
      
      return result
    }
  }

  // Make a single API call with random parameters (for batch testing)
  // Optimized: collect logs in buffer for sequential mode instead of updating state
  const makeApiCall = async (id: number, signal?: AbortSignal, skipLogging: boolean = false, logBuffer?: string[], apiLogBuffer?: ApiLogEntry[]): Promise<ApiResult> => {
    const dateString = generateRandomDateString()
    const nin = generateRandomNIN()
    return makeApiCallWithParams(id, dateString, nin, signal, false, skipLogging, logBuffer, apiLogBuffer)
  }

  // Stop batch calls
  const stopBatchCalls = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsRunning(false)
      addLog('Batch testing stopped by user')
    }
  }

  // Run manual tests independently
  const runManualTests = async (): Promise<void> => {
    setIsRunning(true)
    setManualResults([])
    graphSequenceRef.current = 0 // Reset sequence counter
    addLog(`Starting manual tests (repeat count: ${manualRepeatCount})...`)

    const manualTestResults: ApiResult[] = []
    let callId = 1
    const startTime = Date.now()
    
    // Aggressive batching: update state every 20 calls for maximum performance
    const updateInterval = 20
    let totalCalls = 0
    
    for (let i = 0; i < manualParams.length; i++) {
      const params = manualParams[i]
      if (params.dateString.trim() && params.nin.trim()) {
        // Repeat the same call based on repeat count
        for (let repeat = 0; repeat < manualRepeatCount; repeat++) {
          addLog(`Running manual test #${callId} (repeat ${repeat + 1}/${manualRepeatCount}): dateString=${params.dateString}, nin=${params.nin}`)
          const result = await makeApiCallWithParams(callId, params.dateString.trim(), params.nin.trim(), undefined, true)
          manualTestResults.push(result)
          totalCalls++
          
          // Update response time graph data (batched for performance)
          addGraphDataPoint(result)
          
          // Update state every N calls or on last call to reduce re-renders
          // Use React 18 automatic batching
          if (totalCalls % updateInterval === 0 || (i === manualParams.length - 1 && repeat === manualRepeatCount - 1)) {
            setManualResults([...manualTestResults])
          }
          
          callId++
        }
      }
    }
    
    // Flush any remaining buffered updates
    if (graphDataBufferRef.current.length > 0) {
      setResponseTimeData(prev => {
        const newData = [...prev, ...graphDataBufferRef.current]
        graphDataBufferRef.current = []
        return newData.slice(-100)
      })
    }
    if (apiLogBufferRef.current.length > 0) {
      setApiLogs(prev => {
        const newLogs = [...prev, ...apiLogBufferRef.current]
        apiLogBufferRef.current = []
        return newLogs.slice(-100)
      })
    }
    if (logBufferRef.current.length > 0) {
      setLogs(prev => [...logBufferRef.current, ...prev].slice(0, 100))
      logBufferRef.current = []
    }
    if (logUpdateTimerRef.current) {
      clearTimeout(logUpdateTimerRef.current)
      logUpdateTimerRef.current = null
    }
    if (graphUpdateTimerRef.current) {
      clearTimeout(graphUpdateTimerRef.current)
      graphUpdateTimerRef.current = null
    }
    
    setManualResults(manualTestResults)
    setIsRunning(false)
    const endTime = Date.now()
    const totalDuration = (endTime - startTime) / 1000 // in seconds
    if (manualTestResults.length > 0) {
      addLog(`Completed ${manualTestResults.length} manual test(s) in ${totalDuration.toFixed(2)}s`)
    } else {
      addLog('No manual tests to run. Please fill in dateString and nin.')
    }
  }

  // Run batch of API calls
  const runBatchCalls = async (count: number = 1000) => {
    setIsRunning(true)
    setResults([])
    setResponseTimeData([])
    graphSequenceRef.current = 0 // Reset sequence counter for new test
    setStats({ total: 0, success: 0, error: 0, averageTime: 0 })
    setCurrentPage(1)
    
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    addLog(`Starting batch test with ${count} API calls in ${batchMode} mode${batchMode === 'parallel' ? ` (${threadCount} threads)` : ''}`)

    // Get correct test values from environment
    let correctDateString = ''
    let correctNIN = ''
    
    try {
      const testValuesResponse = await fetch('/api/test-values')
      if (testValuesResponse.ok) {
        const testValues = await testValuesResponse.json()
        correctDateString = testValues.dateString || ''
        correctNIN = testValues.nin || ''
      }
    } catch (error) {
      console.warn('Could not fetch test values from env')
      addLog('Warning: Could not fetch test values from environment variables')
    }
    
    // Validate that we have the required values
    if (!correctDateString || !correctNIN) {
      addLog('Error: CORRECT_TEST_DATESTRING and CORRECT_TEST_NIN must be set in environment variables')
      setIsRunning(false)
      return
    }

    const batchResults: ApiResult[] = []
    let successCount = 0
    let errorCount = 0
    let totalTime = 0
    
    // Declare graphDataPoints early for sequential mode optimization
    let graphDataPoints: ResponseTimeData[] = []
    
    // Buffers to collect logs during sequential execution (will be flushed at the end)
    const sequentialLogBuffer: string[] = []
    const sequentialApiLogBuffer: ApiLogEntry[] = []

    // Always start with the correct test values as the first call
    if (!signal.aborted) {
      // In sequential mode, collect logs in buffer instead of updating state
      const skipLoggingForFirst = batchMode === 'sequential'
      if (!skipLoggingForFirst) {
        addLog(`Running correct test values first: dateString=${correctDateString}, nin=${correctNIN}`)
      } else {
        // Collect first call log in buffer
        const timestamp = new Date().toLocaleTimeString()
        sequentialLogBuffer.push(`[${timestamp}] Running correct test values first: dateString=${correctDateString}, nin=${correctNIN}`)
      }
      const correctTestResult = await makeApiCallWithParams(1, correctDateString, correctNIN, signal, false, skipLoggingForFirst, batchMode === 'sequential' ? sequentialLogBuffer : undefined, batchMode === 'sequential' ? sequentialApiLogBuffer : undefined)
      batchResults.push(correctTestResult)
      
      // Fast status counting (avoid if-else branching overhead)
      successCount += correctTestResult.status === 'success' ? 1 : 0
      errorCount += correctTestResult.status === 'error' ? 1 : 0
      totalTime += correctTestResult.duration

      // In sequential mode, collect graph data but don't update state yet
      if (batchMode === 'sequential') {
        graphSequenceRef.current += 1
        graphDataPoints.push({
          time: graphSequenceRef.current.toString(),
          duration: correctTestResult.duration,
          success: correctTestResult.status === 'success' ? 1 : 0,
          error: correctTestResult.status === 'error' ? 1 : 0,
        })
      } else {
        // Update response time graph data (batched for performance) - only in parallel mode
        addGraphDataPoint(correctTestResult)
      }

      // Update state after first call
      setResults([...batchResults])
      setStats({
        total: batchResults.length,
        success: successCount,
        error: errorCount,
        averageTime: totalTime / batchResults.length || 0,
      })
    }

    // Process remaining calls based on mode
    const remainingCalls = count - 1 // Subtract 1 because we already did the first call

    try {
      if (batchMode === 'sequential') {
        // Sequential mode: process one by one
        // MAXIMUM PERFORMANCE: update state every 100 calls to minimize React re-renders
        // Disable graph/log updates during execution for maximum speed
        const updateInterval = 100
        
        for (let i = 0; i < remainingCalls; i++) {
          if (signal.aborted) break
          
          // Make API call - collect logs in buffer instead of updating state (fastest path)
          const apiResult = await makeApiCall(i + 2, signal, true, sequentialLogBuffer, sequentialApiLogBuffer) // +2 because call #1 was the correct test
          batchResults.push(apiResult)
          
          // Fast status counting (avoid if-else branching overhead)
          successCount += apiResult.status === 'success' ? 1 : 0
          errorCount += apiResult.status === 'error' ? 1 : 0
          totalTime += apiResult.duration

          // Collect graph data points but don't update state (defer to end)
          graphSequenceRef.current += 1
          graphDataPoints.push({
            time: graphSequenceRef.current.toString(),
            duration: apiResult.duration,
            success: apiResult.status === 'success' ? 1 : 0,
            error: apiResult.status === 'error' ? 1 : 0,
          })

          // Update state only every N calls or on last call to minimize re-renders
          if ((i + 1) % updateInterval === 0 || i === remainingCalls - 1) {
            // Use React 18 automatic batching - these will be batched together
            setResults([...batchResults])
            setStats({
              total: batchResults.length,
              success: successCount,
              error: errorCount,
              averageTime: totalTime / batchResults.length || 0,
            })
          }
        }
        
        // Update graph data once at the end (much faster than incremental updates)
        if (graphDataPoints.length > 0) {
          setResponseTimeData(prev => {
            const newData = [...prev, ...graphDataPoints]
            return newData.slice(-100) // Keep last 100 data points
          })
        }
        
        // Flush all collected logs at the end (show logs towards the end)
        if (sequentialLogBuffer.length > 0) {
          setLogs(prev => [...sequentialLogBuffer, ...prev].slice(0, 100))
        }
        if (sequentialApiLogBuffer.length > 0) {
          // Update serial numbers to account for existing logs
          setApiLogs(prev => {
            const existingLogCount = prev.length
            sequentialApiLogBuffer.forEach((log, index) => {
              log.serial = existingLogCount + index + 1
            })
            const newLogs = [...prev, ...sequentialApiLogBuffer]
            return newLogs.slice(-100) // Keep last 100 logs
          })
        }
      } else {
        // Parallel mode: process in batches with configurable thread count
        const totalBatches = Math.ceil(remainingCalls / threadCount)

        for (let batch = 0; batch < totalBatches; batch++) {
          if (signal.aborted) break

          const batchPromises: Promise<ApiResult>[] = []
          const startIdx = batch * threadCount
          const endIdx = Math.min(startIdx + threadCount, remainingCalls)

          for (let i = startIdx; i < endIdx; i++) {
            if (signal.aborted) break
            // Use i + 2 because call #1 was the correct test, so next call is #2
            batchPromises.push(makeApiCall(i + 2, signal))
          }

          const batchResultsChunk = await Promise.allSettled(batchPromises)
          
          batchResultsChunk.forEach((result, idx) => {
            if (result.status === 'fulfilled') {
              const apiResult = result.value
              batchResults.push(apiResult)
              
              if (apiResult.status === 'success') {
                successCount++
              } else {
                errorCount++
              }
              totalTime += apiResult.duration

              // Update response time graph data (batched for performance)
              addGraphDataPoint(apiResult)
            } else {
              const errorResult: ApiResult = {
                id: startIdx + idx + 2, // +2 because call #1 was the correct test
                dateString: generateRandomDateString(),
                nin: generateRandomNIN(),
                status: 'error',
                error: result.reason?.message || 'Promise rejected',
                duration: 0,
                timestamp: Date.now(),
              }
              batchResults.push(errorResult)
              errorCount++
            }
          })

          // Update state after each batch
          setResults([...batchResults])
          setStats({
            total: batchResults.length,
            success: successCount,
            error: errorCount,
            averageTime: totalTime / batchResults.length || 0,
          })

          // Reduced delay for better performance (only if needed)
          if (batch < totalBatches - 1 && !signal.aborted && threadCount > 20) {
            await new Promise(resolve => setTimeout(resolve, 10))
          }
        }
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        addLog(`Error during batch testing: ${error.message}`)
      }
    } finally {
      // Flush any remaining buffered updates
      if (graphDataBufferRef.current.length > 0) {
        setResponseTimeData(prev => {
          const newData = [...prev, ...graphDataBufferRef.current]
          graphDataBufferRef.current = []
          return newData.slice(-100)
        })
      }
      if (apiLogBufferRef.current.length > 0) {
        setApiLogs(prev => {
          const newLogs = [...prev, ...apiLogBufferRef.current]
          apiLogBufferRef.current = []
          return newLogs.slice(-100)
        })
      }
      if (logBufferRef.current.length > 0) {
        setLogs(prev => [...logBufferRef.current, ...prev].slice(0, 100))
        logBufferRef.current = []
      }
      if (logUpdateTimerRef.current) {
        clearTimeout(logUpdateTimerRef.current)
        logUpdateTimerRef.current = null
      }
      if (graphUpdateTimerRef.current) {
        clearTimeout(graphUpdateTimerRef.current)
        graphUpdateTimerRef.current = null
      }
      
      setIsRunning(false)
      abortControllerRef.current = null
      if (!signal.aborted) {
        addLog(`Batch test completed: ${successCount} successful, ${errorCount} errors`)
      }
    }
  }

  const clearResults = () => {
    setResults([])
    setManualResults([])
    setResponseTimeData([])
    graphSequenceRef.current = 0 // Reset sequence counter
    setLogs([])
    setApiLogs([])
    setStats({ total: 0, success: 0, error: 0, averageTime: 0 })
    setCurrentPage(1)
    // Sync input field
    setCallCountInput(callCount.toString())
  }

  const updateManualParam = (index: number, field: 'dateString' | 'nin', value: string) => {
    const updated = [...manualParams]
    updated[index] = { ...updated[index], [field]: value }
    setManualParams(updated)
  }

  const printResults = () => {
    const printWindow = window.open('', '_blank')
    if (!printWindow) return

    const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Yakeen API Batch Test Results</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 20px;
              margin: 0;
            }
            h1 {
              color: #333;
              border-bottom: 2px solid #667eea;
              padding-bottom: 10px;
            }
            .summary {
              background: #f8f9fa;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #667eea;
            }
            .summary-item {
              margin: 5px 0;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 20px;
            }
            th, td {
              border: 1px solid #ddd;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #667eea;
              color: white;
            }
            tr:nth-child(even) {
              background-color: #f2f2f2;
            }
            .success {
              color: #28a745;
              font-weight: bold;
            }
            .error {
              color: #dc3545;
              font-weight: bold;
            }
            .response-data {
              max-width: 400px;
              word-break: break-all;
              font-size: 0.85em;
            }
          </style>
        </head>
        <body>
          <h1>Yakeen API Batch Test Results</h1>
          <div class="summary">
            <div class="summary-item"><strong>Test Date:</strong> ${new Date().toLocaleString()}</div>
            <div class="summary-item"><strong>Total Calls:</strong> ${stats.total}</div>
            <div class="summary-item"><strong>Successful:</strong> ${stats.success}</div>
            <div class="summary-item"><strong>Errors:</strong> ${stats.error}</div>
            <div class="summary-item"><strong>Success Rate:</strong> ${stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(2) : 0}%</div>
            <div class="summary-item"><strong>Average Response Time:</strong> ${stats.averageTime.toFixed(2)}ms</div>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>dateString</th>
                <th>nin</th>
                <th>Status</th>
                <th>Duration (ms)</th>
                <th>Response/Error</th>
              </tr>
            </thead>
            <tbody>
              ${results.map((result) => `
                <tr>
                  <td>${result.id}</td>
                  <td>${result.dateString}</td>
                  <td>${result.nin}</td>
                  <td class="${result.status}">${result.status.toUpperCase()}</td>
                  <td>${result.duration}</td>
                  <td class="response-data">
                    ${result.error ? `Error: ${result.error}` : (result.response ? JSON.stringify(result.response, null, 2) : 'N/A')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
      </html>
    `
    
    printWindow.document.write(printContent)
    printWindow.document.close()
    printWindow.focus()
    setTimeout(() => {
      printWindow.print()
    }, 250)
  }

  const progress = stats.total > 0 && callCount > 0 ? (stats.total / callCount) * 100 : 0
  const totalPages = Math.ceil(results.length / resultsPerPage)
  const startIndex = (currentPage - 1) * resultsPerPage
  const endIndex = startIndex + resultsPerPage
  const paginatedResults = results.slice(startIndex, endIndex)
  
  // Pagination for manual results
  const [manualCurrentPage, setManualCurrentPage] = useState<number>(1)
  const manualTotalPages = Math.ceil(manualResults.length / resultsPerPage)
  const manualStartIndex = (manualCurrentPage - 1) * resultsPerPage
  const manualEndIndex = manualStartIndex + resultsPerPage
  const paginatedManualResults = manualResults.slice(manualStartIndex, manualEndIndex)
  
  // Calculate total time from all API calls (batch + manual)
  const allResults = [...results, ...manualResults]
  const totalTime = allResults.reduce((sum, result) => sum + result.duration, 0)
  const averageTime = allResults.length > 0 ? totalTime / allResults.length : 0
  
  // Calculate average requests per minute
  // If we have results, calculate based on time span from first to last call
  let requestsPerMinute = 0
  if (allResults.length > 0) {
    const firstCallTime = Math.min(...allResults.map(r => r.timestamp))
    const lastCallTime = Math.max(...allResults.map(r => r.timestamp))
    const timeSpanSeconds = (lastCallTime - firstCallTime) / 1000
    if (timeSpanSeconds > 0) {
      requestsPerMinute = (allResults.length / timeSpanSeconds) * 60
    } else if (allResults.length > 0) {
      // If all calls happened at the same time (unlikely but handle edge case)
      requestsPerMinute = allResults.length * 60
    }
  }

  useEffect(() => {
    // Reset to first page when results change
    setCurrentPage(1)
  }, [results.length])
  
  useEffect(() => {
    // Reset to first page when manual results change
    setManualCurrentPage(1)
  }, [manualResults.length])

  // Fetch manual test values from environment on component mount
  useEffect(() => {
    const fetchManualTestValues = async () => {
      try {
        const testValuesResponse = await fetch('/api/test-values')
        if (testValuesResponse.ok) {
          const testValues = await testValuesResponse.json()
          if (testValues.dateString && testValues.nin) {
            setManualParams([{
              dateString: testValues.dateString,
              nin: testValues.nin,
            }])
          }
        }
      } catch (error) {
        console.warn('Could not fetch manual test values from env')
      }
    }
    fetchManualTestValues()
  }, [])

  return (
    <div className="container">
      <h1>Yakeen API Batch Tester</h1>
      
      {/* API Info Section */}
      <div className="api-info-section">
        <div className="api-url-display">
          <div className="api-label">API Endpoint:</div>
          <div className="api-value">{API_BASE_URL}</div>
        </div>
      </div>

      <div className="main-layout">
        <div className="left-column">
          {/* Tab Navigation */}
          <div className="tabs-container">
            <button
              className={`tab-button ${activeTab === 'manual' ? 'active' : ''}`}
              onClick={() => setActiveTab('manual')}
              disabled={isRunning}
            >
              Manual Testing
            </button>
            <button
              className={`tab-button ${activeTab === 'batch' ? 'active' : ''}`}
              onClick={() => setActiveTab('batch')}
              disabled={isRunning}
            >
              Batch Testing
            </button>
          </div>

          {/* Manual Testing Section */}
          {activeTab === 'manual' && (
            <div className="testing-section manual-section">
              <div className="config-section">
                <div className="manual-params-grid">
                {manualParams.map((param, index) => (
                  <div key={index} className="manual-param-row">
                    <div className="manual-param-inputs">
                      <label className="manual-input-label">
                        dateString:
                        <input
                          type="text"
                          value={param.dateString}
                          onChange={(e) => updateManualParam(index, 'dateString', e.target.value)}
                          disabled={isRunning}
                          placeholder="dateString"
                          className="config-input manual-input"
                        />
                      </label>
                      <label className="manual-input-label">
                        nin:
                        <input
                          type="text"
                          value={param.nin}
                          onChange={(e) => updateManualParam(index, 'nin', e.target.value)}
                          disabled={isRunning}
                          placeholder="nin"
                          className="config-input manual-input"
                        />
                      </label>
                    </div>
                  </div>
                ))}
                </div>
                <div className="config-row" style={{ marginTop: '0.75rem' }}>
                  <label className="config-label">
                    Repeat Count:
                    <input
                      type="number"
                      min="1"
                      max="50000"
                      value={manualRepeatCountInput}
                      onChange={(e) => {
                        const inputValue = e.target.value
                        setManualRepeatCountInput(inputValue)
                        if (inputValue !== '') {
                          const numValue = parseInt(inputValue, 10)
                          if (!isNaN(numValue)) {
                            const clampedValue = Math.max(1, Math.min(50000, numValue))
                            setManualRepeatCount(clampedValue)
                            // Update input to show clamped value if it exceeds max
                            if (numValue > 50000) {
                              setManualRepeatCountInput('50000')
                            }
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const inputValue = e.target.value
                        if (inputValue === '' || inputValue === '0') {
                          setManualRepeatCountInput('1')
                          setManualRepeatCount(1)
                        } else {
                          const value = parseInt(inputValue, 10)
                          if (isNaN(value) || value < 1) {
                            setManualRepeatCountInput('1')
                            setManualRepeatCount(1)
                          } else if (value > 50000) {
                            setManualRepeatCountInput('50000')
                            setManualRepeatCount(50000)
                          } else {
                            setManualRepeatCountInput(value.toString())
                            setManualRepeatCount(value)
                          }
                        }
                      }}
                      disabled={isRunning}
                      className="config-input"
                    />
                  </label>
                </div>
                <div className="manual-controls">
                  <button
                    className="btn-primary"
                    onClick={runManualTests}
                    disabled={isRunning}
                  >
                    Run Manual Test {manualRepeatCount > 1 ? `(${manualRepeatCount.toLocaleString()}x)` : ''}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* Batch Testing Section */}
          {activeTab === 'batch' && (
            <div className="testing-section batch-section">
            <div className="config-section">
              <div className="config-row">
                <label className="config-label">
                  Number of API Calls:
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={callCountInput}
                    onChange={(e) => {
                      const inputValue = e.target.value
                      // Allow empty input for deletion
                      setCallCountInput(inputValue)
                      // Update the actual callCount if it's a valid number
                      if (inputValue !== '') {
                        const numValue = parseInt(inputValue, 10)
                        if (!isNaN(numValue)) {
                          setCallCount(Math.max(1, Math.min(10000, numValue)))
                        }
                      }
                    }}
                    onBlur={(e) => {
                      // Ensure a valid value when field loses focus
                      const inputValue = e.target.value
                      if (inputValue === '' || inputValue === '0') {
                        setCallCountInput('1')
                        setCallCount(1)
                      } else {
                        const value = parseInt(inputValue, 10)
                        if (isNaN(value) || value < 1) {
                          setCallCountInput('1')
                          setCallCount(1)
                        } else if (value > 10000) {
                          setCallCountInput('10000')
                          setCallCount(10000)
                        } else {
                          setCallCountInput(value.toString())
                          setCallCount(value)
                        }
                      }
                    }}
                    disabled={isRunning}
                    className="config-input"
                  />
                </label>
                <label className="config-label">
                  Batch Mode:
                  <select
                    value={batchMode}
                    onChange={(e) => setBatchMode(e.target.value as 'sequential' | 'parallel')}
                    disabled={isRunning}
                    className="config-input"
                    style={{ minWidth: '150px' }}
                  >
                    <option value="sequential">Sequential</option>
                    <option value="parallel">Parallel</option>
                  </select>
                </label>
                {batchMode === 'parallel' && (
                  <label className="config-label">
                    Number of Threads:
                    <input
                      type="number"
                      min="1"
                      max="50"
                      value={threadCountInput}
                      onChange={(e) => {
                        const inputValue = e.target.value
                        setThreadCountInput(inputValue)
                        if (inputValue !== '') {
                          const numValue = parseInt(inputValue, 10)
                          if (!isNaN(numValue)) {
                            setThreadCount(Math.max(1, Math.min(50, numValue)))
                          }
                        }
                      }}
                      onBlur={(e) => {
                        const inputValue = e.target.value
                        if (inputValue === '' || inputValue === '0') {
                          setThreadCountInput('1')
                          setThreadCount(1)
                        } else {
                          const value = parseInt(inputValue, 10)
                          if (isNaN(value) || value < 1) {
                            setThreadCountInput('1')
                            setThreadCount(1)
                          } else if (value > 50) {
                            setThreadCountInput('50')
                            setThreadCount(50)
                          } else {
                            setThreadCountInput(value.toString())
                            setThreadCount(value)
                          }
                        }
                      }}
                      disabled={isRunning}
                      className="config-input"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="batch-controls">
              <button
                className="btn-primary"
                onClick={() => runBatchCalls(callCount)}
                disabled={isRunning || callCount < 1}
              >
                {isRunning ? `Running... (${stats.total}/${callCount})` : `Run Batch Test`}
              </button>
              <button
                className="btn-danger"
                onClick={stopBatchCalls}
                disabled={!isRunning}
              >
                Stop
              </button>
              <button
                className="btn-secondary"
                onClick={clearResults}
                disabled={isRunning}
              >
                Clear Results
              </button>
              <button
                className="btn-secondary"
                onClick={printResults}
                disabled={isRunning || results.length === 0}
              >
                Print Results
              </button>
            </div>

            <div className="stats">
              <div className="stat-card">
                <div className="stat-label">Total Calls</div>
                <div className="stat-value">{stats.total}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Successful</div>
                <div className="stat-value" style={{ color: '#000000' }}>
                  {stats.success}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Errors</div>
                <div className="stat-value" style={{ color: '#000000' }}>
                  {stats.error}
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Success Rate</div>
                <div className="stat-value" style={{ color: '#000000' }}>
                  {stats.total > 0 ? ((stats.success / stats.total) * 100).toFixed(1) : 0}%
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">Avg Time (ms)</div>
                <div className="stat-value">
                  {stats.averageTime.toFixed(0)}
                </div>
              </div>
            </div>

            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              >
                {progress.toFixed(1)}%
              </div>
            </div>
            </div>
          )}
        </div>

        <div className="right-column">
          {responseTimeData.length > 0 && (
            <div className="chart-section">
              <h2 className="section-title">Live Response Time Graph</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={responseTimeData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#000000" opacity={0.2} />
                  <XAxis 
                    dataKey="time" 
                    tick={{ fontSize: 10, fill: '#000000' }}
                    angle={-45}
                    textAnchor="end"
                    height={60}
                    stroke="#000000"
                    label={{ value: 'Request Sequence', position: 'insideBottom', offset: -5, fill: '#000000', style: { fontSize: '10px' } }}
                  />
                  <YAxis 
                    label={{ value: 'Time (ms)', angle: -90, position: 'insideLeft', fill: '#000000', style: { fontSize: '10px' } }}
                    tick={{ fontSize: 10, fill: '#000000' }}
                    stroke="#000000"
                  />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#FFFFFF', border: '1px solid #E0E0E0', borderRadius: '8px', color: '#000000', fontSize: '12px' }}
                    labelStyle={{ color: '#000000', fontWeight: 600, fontSize: '12px' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="duration" 
                    stroke="#000000" 
                    strokeWidth={2}
                    dot={{ r: 3, fill: '#000000', strokeWidth: 1, stroke: '#FFFFFF' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Time Statistics Tiles */}
          <div className="time-stats-section">
            <div className="time-stat-card">
              <div className="time-stat-label">Average Response Time</div>
              <div className="time-stat-value">
                {averageTime > 0 ? averageTime.toFixed(2) : 0}ms
              </div>
            </div>
            <div className="time-stat-card">
              <div className="time-stat-label">Total Response Time</div>
              <div className="time-stat-value">
                {totalTime > 0 ? (totalTime / 1000).toFixed(2) : 0}s
              </div>
            </div>
            <div className="time-stat-card">
              <div className="time-stat-label">Average Requests Per Minute</div>
              <div className="time-stat-value">
                {requestsPerMinute > 0 ? requestsPerMinute.toFixed(2) : 0}
              </div>
            </div>
          </div>

          {/* Show Manual Test Results when in manual mode, Batch Results when in batch mode */}
          {activeTab === 'manual' ? (
            <div className="results-section">
              <div className="results-header">
                <h3 className="section-title">Manual Test Results ({manualResults.length})</h3>
                {manualResults.length > 0 && (
                  <div className="pagination">
                    <button
                      className="pagination-btn"
                      onClick={() => setManualCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={manualCurrentPage === 1}
                    >
                      Previous
                    </button>
                    <span className="pagination-info">
                      Page {manualCurrentPage} of {manualTotalPages} ({manualStartIndex + 1}-{Math.min(manualEndIndex, manualResults.length)} of {manualResults.length})
                    </span>
                    <button
                      className="pagination-btn"
                      onClick={() => setManualCurrentPage(prev => Math.min(manualTotalPages, prev + 1))}
                      disabled={manualCurrentPage === manualTotalPages}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
              <div className="results">
                {manualResults.length === 0 ? (
                  <p className="empty-state">
                    No results yet. Enter dateString and nin, then click &quot;Run Manual Test&quot; to start testing.
                  </p>
                ) : (
                  paginatedManualResults.map((result, index) => (
                    <div
                      key={index}
                      className={`result-item ${result.status} manual-result-item`}
                    >
                      <div className="result-header">
                        <span>Manual Test #{manualStartIndex + index + 1}</span>
                        <span>{result.duration}ms</span>
                      </div>
                      <div className="result-body">
                        <div>
                          <strong>dateString:</strong> {result.dateString} |{' '}
                          <strong>nin:</strong> {result.nin}
                        </div>
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong>Status:</strong> {result.status.toUpperCase()}
                        </div>
                        {result.error && (
                          <div style={{ marginTop: '0.5rem', color: '#000000' }}>
                            <strong>Error:</strong> {result.error}
                          </div>
                        )}
                        {result.response && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <strong>Response:</strong>{' '}
                            <pre style={{ marginTop: '0.25rem', fontSize: '0.8rem', overflow: 'auto' }}>
                              {JSON.stringify(result.response, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="results-section">
              <div className="results-header">
                <h3 className="section-title">Batch Results ({results.length})</h3>
                {results.length > 0 && (
                  <div className="pagination">
                    <button
                      className="pagination-btn"
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={currentPage === 1}
                    >
                      Previous
                    </button>
                    <span className="pagination-info">
                      Page {currentPage} of {totalPages} ({startIndex + 1}-{Math.min(endIndex, results.length)} of {results.length})
                    </span>
                    <button
                      className="pagination-btn"
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Next
                    </button>
                  </div>
                )}
              </div>
              <div className="results">
                {results.length === 0 ? (
                  <p className="empty-state">
                    No results yet. Enter the number of calls and click &quot;Run Batch Test&quot; to start testing.
                  </p>
                ) : (
                  paginatedResults.map((result) => (
                    <div
                      key={result.id}
                      className={`result-item ${result.status}`}
                    >
                      <div className="result-header">
                        <span>#{result.id}</span>
                        <span>{result.duration}ms</span>
                      </div>
                      <div className="result-body">
                        <div>
                          <strong>dateString:</strong> {result.dateString} |{' '}
                          <strong>nin:</strong> {result.nin}
                        </div>
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong>Status:</strong> {result.status.toUpperCase()}
                        </div>
                        {result.error && (
                          <div style={{ marginTop: '0.5rem', color: '#000000' }}>
                            <strong>Error:</strong> {result.error}
                          </div>
                        )}
                        {result.response && (
                          <div style={{ marginTop: '0.5rem' }}>
                            <strong>Response:</strong>{' '}
                            <pre style={{ marginTop: '0.25rem', fontSize: '0.8rem', overflow: 'auto' }}>
                              {JSON.stringify(result.response, null, 2)}
                            </pre>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
