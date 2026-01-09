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
  const [manualRepeatCount, setManualRepeatCount] = useState<number>(1)
  const [manualRepeatCountInput, setManualRepeatCountInput] = useState<string>('1')
  const [responseTimeData, setResponseTimeData] = useState<ResponseTimeData[]>([])
  const [logs, setLogs] = useState<string[]>([])
  const [apiLogs, setApiLogs] = useState<ApiLogEntry[]>([])
  const [testStartTime, setTestStartTime] = useState<string | null>(null)
  const [testEndTime, setTestEndTime] = useState<string | null>(null)
  const [showConfigPanel, setShowConfigPanel] = useState<boolean>(false)
  
  const [uiUpdateInterval, setUiUpdateInterval] = useState<number>(500)
  const [graphMaxPoints, setGraphMaxPoints] = useState<number>(100)
  const [logMaxEntries, setLogMaxEntries] = useState<number>(100)
  const [apiLogMaxEntries, setApiLogMaxEntries] = useState<number>(100)
  
  const abortControllerRef = useRef<AbortController | null>(null)
  const resultsPerPage = 20
  
  const graphDataBufferRef = useRef<ResponseTimeData[]>([])
  const graphSequenceRef = useRef<number>(0)
  
  const batchResultsRef = useRef<ApiResult[]>([])
  const manualResultsRef = useRef<ApiResult[]>([])
  const apiLogsRef = useRef<ApiLogEntry[]>([])
  const logsRef = useRef<string[]>([])
  const statsRef = useRef({ total: 0, success: 0, error: 0, averageTime: 0 })
  
  const uiUpdateIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const uiUpdateRequestRef = useRef<number | null>(null)
  
  const BATCH_UPDATE_THRESHOLD = 10
  
  const formatTimeHHMMSS = useCallback((date: Date): string => {
    const hours = String(date.getHours()).padStart(2, '0')
    const minutes = String(date.getMinutes()).padStart(2, '0')
    const seconds = String(date.getSeconds()).padStart(2, '0')
    return `${hours}${minutes}${seconds}`
  }, [])
  
  const updateUIAsync = useCallback(() => {
    if (uiUpdateRequestRef.current) {
      cancelAnimationFrame(uiUpdateRequestRef.current)
    }
    
    uiUpdateRequestRef.current = requestAnimationFrame(() => {
      if (graphDataBufferRef.current.length > 0) {
        setResponseTimeData(prev => {
          const buffer = graphDataBufferRef.current
          graphDataBufferRef.current = []
          const totalLength = prev.length + buffer.length
          if (totalLength <= graphMaxPoints) {
            return [...prev, ...buffer]
          }
          const trimmed = prev.slice(-(graphMaxPoints - buffer.length))
          return [...trimmed, ...buffer]
        })
      }
      
      const currentBatchLength = batchResultsRef.current.length
      if (currentBatchLength > 0 && currentBatchLength !== results.length) {
        setResults([...batchResultsRef.current])
      }
      
      if (activeTab === 'manual') {
        const currentManualLength = manualResultsRef.current.length
        if (currentManualLength > 0 && currentManualLength !== manualResults.length) {
          setManualResults([...manualResultsRef.current])
        }
      }
      
      setStats({ ...statsRef.current })
      
      if (logsRef.current.length > 0) {
        setLogs(prev => [...logsRef.current, ...prev].slice(0, logMaxEntries))
        logsRef.current = []
      }
      
      if (apiLogsRef.current.length > 0) {
        setApiLogs(prev => {
          const newLogs = [...prev, ...apiLogsRef.current]
          apiLogsRef.current = []
          return newLogs.slice(-apiLogMaxEntries)
        })
      }
      
      uiUpdateRequestRef.current = null
    })
  }, [graphMaxPoints, logMaxEntries, apiLogMaxEntries, results.length, manualResults.length, activeTab])
  
  const addGraphDataPointToRef = useCallback((result: ApiResult) => {
    graphSequenceRef.current += 1
    const timeLabel = graphSequenceRef.current.toString()
    
    graphDataBufferRef.current.push({
      time: timeLabel,
      duration: result.duration,
      success: result.status === 'success' ? 1 : 0,
      error: result.status === 'error' ? 1 : 0,
    })
    
    if (graphDataBufferRef.current.length >= BATCH_UPDATE_THRESHOLD) {
      updateUIAsync()
    }
  }, [updateUIAsync])
  
  const startUIUpdateLoop = useCallback(() => {
    if (uiUpdateIntervalRef.current) {
      clearInterval(uiUpdateIntervalRef.current)
    }
    uiUpdateIntervalRef.current = setInterval(() => {
      updateUIAsync()
    }, uiUpdateInterval)
  }, [updateUIAsync, uiUpdateInterval])
  
  const stopUIUpdateLoop = useCallback(() => {
    if (uiUpdateIntervalRef.current) {
      clearInterval(uiUpdateIntervalRef.current)
      uiUpdateIntervalRef.current = null
    }
    if (uiUpdateRequestRef.current) {
      cancelAnimationFrame(uiUpdateRequestRef.current)
      uiUpdateRequestRef.current = null
    }
    updateUIAsync()
  }, [updateUIAsync])

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

  const generateRandomDateString = (): string => {
    const year = Math.floor(Math.random() * 100) + 1400 // 1400-1499
    const month = String(Math.floor(Math.random() * 12) + 1).padStart(2, '0')
    return `${year}-${month}`
  }

  const generateRandomNIN = (): string => {
    return String(Math.floor(Math.random() * 900000000) + 100000000)
  }

  const addLog = useCallback((message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    logsRef.current.push(`[${timestamp}] ${message}`)
  }, [])

  const addApiLog = useCallback((statusCode: number, response: any, time: number) => {
    let preview = ''
    if (response !== null && response !== undefined) {
      const responseType = typeof response
      if (responseType === 'string') {
        preview = response.length > 50 ? response.substring(0, 50) + '...' : response
      } else if (responseType === 'object') {
        try {
          const responseStr = JSON.stringify(response)
          preview = responseStr.length > 50 ? responseStr.substring(0, 50) + '...' : responseStr
        } catch {
          preview = String(response).substring(0, 50)
        }
      } else {
        const responseStr = String(response)
        preview = responseStr.length > 50 ? responseStr.substring(0, 50) + '...' : responseStr
      }
    }
    
    const serial = apiLogsRef.current.length + 1
    apiLogsRef.current.push({ serial, statusCode, responsePreview: preview, time })
  }, [])

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
      const proxyUrl = `/api/proxy?dateString=${encodeURIComponent(dateString)}&nin=${encodeURIComponent(nin)}`
      
      const response = await fetch(proxyUrl, {
        method: 'GET',
        signal,
        keepalive: true,
      })

      let proxyData
      
      try {
        proxyData = await response.json()
      } catch {
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
            apiLogBuffer.push({ serial: 0, statusCode, responsePreview: `Failed to parse: ${response.statusText}`, time: result.duration })
          } else {
            addApiLog(statusCode, `Failed to parse: ${response.statusText}`, result.duration)
          }
        }
        return result
      }

      const apiResponseTime = proxyData.responseTime || 0
      const statusCode = proxyData.status || response.status || 500

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
            const timestamp = new Date().toLocaleTimeString()
            logBuffer.push(`[${timestamp}] ${logMessage}`)
          } else {
            addLog(logMessage)
          }
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
        statusCode: 0,
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
            apiLogBuffer.push({ serial: 0, statusCode: 0, responsePreview: errorMessage.length > 50 ? errorMessage.substring(0, 50) + '...' : errorMessage, time: result.duration })
        } else {
          addApiLog(0, errorMessage, result.duration)
        }
        console.error('API call error:', error)
      }
      
      return result
    }
  }

  const makeApiCall = async (id: number, signal?: AbortSignal, skipLogging: boolean = false, logBuffer?: string[], apiLogBuffer?: ApiLogEntry[]): Promise<ApiResult> => {
    const dateString = generateRandomDateString()
    const nin = generateRandomNIN()
    return makeApiCallWithParams(id, dateString, nin, signal, false, skipLogging, logBuffer, apiLogBuffer)
  }

  const stopBatchCalls = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
      setIsRunning(false)
      addLog('Batch testing stopped by user')
    }
  }

  const runManualTests = async (): Promise<void> => {
    setIsRunning(true)
    setManualResults([])
    setResponseTimeData([])
    setApiLogs([])
    graphSequenceRef.current = 0
    
    manualResultsRef.current = []
    graphDataBufferRef.current = []
    apiLogsRef.current = []
    logsRef.current = []
    statsRef.current = { total: 0, success: 0, error: 0, averageTime: 0 }
    
    const startDate = new Date()
    const startTimeFormatted = formatTimeHHMMSS(startDate)
    setTestStartTime(startTimeFormatted)
    setTestEndTime(null)
    
    addLog(`Starting manual tests (repeat count: ${manualRepeatCount}) at ${startTimeFormatted}...`)

    startUIUpdateLoop()

    let callId = 1
    const startTime = Date.now()
    
    for (let i = 0; i < manualParams.length; i++) {
      const params = manualParams[i]
      if (params.dateString.trim() && params.nin.trim()) {
        for (let repeat = 0; repeat < manualRepeatCount; repeat++) {
          addLog(`Running manual test #${callId} (repeat ${repeat + 1}/${manualRepeatCount}): dateString=${params.dateString}, nin=${params.nin}`)
          const result = await makeApiCallWithParams(callId, params.dateString.trim(), params.nin.trim(), undefined, true)
          
          manualResultsRef.current.push(result)
          
          statsRef.current.total++
          if (result.status === 'success') {
            statsRef.current.success++
          } else {
            statsRef.current.error++
          }
          statsRef.current.averageTime = (statsRef.current.averageTime * (statsRef.current.total - 1) + result.duration) / statsRef.current.total
          
          addGraphDataPointToRef(result)
          
          callId++
        }
      }
    }
    
    stopUIUpdateLoop()
    
    setIsRunning(false)
    const endTime = Date.now()
    const endDate = new Date()
    const endTimeFormatted = formatTimeHHMMSS(endDate)
    setTestEndTime(endTimeFormatted)
    const totalDuration = (endTime - startTime) / 1000 // in seconds
    if (manualResultsRef.current.length > 0) {
      addLog(`Completed ${manualResultsRef.current.length} manual test(s) in ${totalDuration.toFixed(2)}s. Started: ${startTimeFormatted}, Ended: ${endTimeFormatted}`)
    } else {
      addLog('No manual tests to run. Please fill in dateString and nin.')
    }
  }

  const runBatchCalls = async (count: number = 1000) => {
    setIsRunning(true)
    batchResultsRef.current = []
    graphDataBufferRef.current = []
    apiLogsRef.current = []
    logsRef.current = []
    graphSequenceRef.current = 0
    statsRef.current = { total: 0, success: 0, error: 0, averageTime: 0 }
    
    setResults([])
    setResponseTimeData([])
    setStats({ total: 0, success: 0, error: 0, averageTime: 0 })
    setCurrentPage(1)
    
    const startDate = new Date()
    const startTimeFormatted = formatTimeHHMMSS(startDate)
    setTestStartTime(startTimeFormatted)
    setTestEndTime(null)
    
    abortControllerRef.current = new AbortController()
    const signal = abortControllerRef.current.signal

    addLog(`Starting batch test with ${count} API calls at ${startTimeFormatted}`)
    
    startUIUpdateLoop()

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
    
    if (!correctDateString || !correctNIN) {
      addLog('Error: CORRECT_TEST_DATESTRING and CORRECT_TEST_NIN must be set in environment variables')
      setIsRunning(false)
      return
    }

    if (!signal.aborted) {
      addLog(`Running correct test values first: dateString=${correctDateString}, nin=${correctNIN}`)
      const correctTestResult = await makeApiCallWithParams(1, correctDateString, correctNIN, signal, false, false)
      
      batchResultsRef.current.push(correctTestResult)
      
      statsRef.current.total++
      if (correctTestResult.status === 'success') {
        statsRef.current.success++
      } else {
        statsRef.current.error++
      }
      statsRef.current.averageTime = correctTestResult.duration
      
      addGraphDataPointToRef(correctTestResult)
    }

    const remainingCalls = count - 1

    try {
      for (let i = 0; i < remainingCalls; i++) {
        if (signal.aborted) break
        
        const apiResult = await makeApiCall(i + 2, signal, false)
        
        batchResultsRef.current.push(apiResult)
        
        statsRef.current.total++
        if (apiResult.status === 'success') {
          statsRef.current.success++
        } else {
          statsRef.current.error++
        }
        const currentTotal = statsRef.current.total
        statsRef.current.averageTime = (statsRef.current.averageTime * (currentTotal - 1) + apiResult.duration) / currentTotal
        
        addGraphDataPointToRef(apiResult)
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        addLog(`Error during batch testing: ${error.message}`)
      }
    } finally {
      if (graphDataBufferRef.current.length > 0) {
        setResponseTimeData(prev => {
          const newData = [...prev, ...graphDataBufferRef.current]
          graphDataBufferRef.current = []
          return newData.slice(-100)
        })
      }
      
      stopUIUpdateLoop()
      
      setIsRunning(false)
      abortControllerRef.current = null
      if (!signal.aborted) {
        const endDate = new Date()
        const endTimeFormatted = formatTimeHHMMSS(endDate)
        setTestEndTime(endTimeFormatted)
        addLog(`Batch test completed: ${statsRef.current.success} successful, ${statsRef.current.error} errors. Started: ${testStartTime}, Ended: ${endTimeFormatted}`)
        updateUIAsync()
      }
    }
  }

  const clearResults = () => {
    batchResultsRef.current = []
    manualResultsRef.current = []
    graphDataBufferRef.current = []
    apiLogsRef.current = []
    logsRef.current = []
    graphSequenceRef.current = 0
    statsRef.current = { total: 0, success: 0, error: 0, averageTime: 0 }
    
    setResults([])
    setManualResults([])
    setResponseTimeData([])
    setLogs([])
    setApiLogs([])
    setStats({ total: 0, success: 0, error: 0, averageTime: 0 })
    setCurrentPage(1)
    setTestStartTime(null)
    setTestEndTime(null)
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
  
  const [manualCurrentPage, setManualCurrentPage] = useState<number>(1)
  const manualTotalPages = Math.ceil(manualResults.length / resultsPerPage)
  const manualStartIndex = (manualCurrentPage - 1) * resultsPerPage
  const manualEndIndex = manualStartIndex + resultsPerPage
  const paginatedManualResults = manualResults.slice(manualStartIndex, manualEndIndex)
  
  const statsCalculated = useMemo(() => {
    const allResults = [...results, ...manualResults]
    const totalTime = allResults.reduce((sum, result) => sum + result.duration, 0)
    const averageTime = allResults.length > 0 ? totalTime / allResults.length : 0
    
    let requestsPerMinute = 0
    if (allResults.length > 0) {
      const timestamps = allResults.map(r => r.timestamp)
      const firstCallTime = Math.min(...timestamps)
      const lastCallTime = Math.max(...timestamps)
      const timeSpanSeconds = (lastCallTime - firstCallTime) / 1000
      if (timeSpanSeconds > 0) {
        requestsPerMinute = (allResults.length / timeSpanSeconds) * 60
      } else if (allResults.length > 0) {
        requestsPerMinute = allResults.length * 60
      }
    }
    
    return { totalTime, averageTime, requestsPerMinute }
  }, [results, manualResults])

  const { totalTime, averageTime, requestsPerMinute } = statsCalculated

  useEffect(() => {
    setCurrentPage(1)
  }, [results.length])
  
  useEffect(() => {
    setManualCurrentPage(1)
  }, [manualResults.length])

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h1>Yakeen API Batch Tester</h1>
        <button
          className="btn-secondary"
          onClick={() => setShowConfigPanel(true)}
          style={{ padding: '0.5rem 1rem', fontSize: '0.9rem' }}
        >
          ⚙️ Config
        </button>
      </div>
      
      {showConfigPanel && (
        <div className="modal-overlay" onClick={() => setShowConfigPanel(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Performance Configuration</h2>
              <button
                className="modal-close"
                onClick={() => setShowConfigPanel(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body">
              <div className="config-group">
                <label className="config-label">
                  UI Update Interval (ms)
                  <input
                    type="number"
                    min="50"
                    max="5000"
                    step="50"
                    value={uiUpdateInterval}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10)
                      if (!isNaN(value) && value >= 50 && value <= 5000) {
                        setUiUpdateInterval(value)
                      }
                    }}
                    className="config-input"
                  />
                  <small style={{ color: '#666', fontSize: '0.85rem' }}>
                    Lower = more frequent UI updates (slower API testing). Higher = less frequent updates (faster API testing). Range: 50-5000ms
                  </small>
                </label>
              </div>
              
              <div className="config-group">
                <label className="config-label">
                  Max Graph Data Points
                  <input
                    type="number"
                    min="50"
                    max="1000"
                    step="50"
                    value={graphMaxPoints}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10)
                      if (!isNaN(value) && value >= 50 && value <= 1000) {
                        setGraphMaxPoints(value)
                      }
                    }}
                    className="config-input"
                  />
                  <small style={{ color: '#666', fontSize: '0.85rem' }}>
                    Maximum number of data points to keep in the graph. Higher = more memory usage. Range: 50-1000
                  </small>
                </label>
              </div>
              
              <div className="config-group">
                <label className="config-label">
                  Max Log Entries
                  <input
                    type="number"
                    min="50"
                    max="500"
                    step="50"
                    value={logMaxEntries}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10)
                      if (!isNaN(value) && value >= 50 && value <= 500) {
                        setLogMaxEntries(value)
                      }
                    }}
                    className="config-input"
                  />
                  <small style={{ color: '#666', fontSize: '0.85rem' }}>
                    Maximum number of log entries to keep. Higher = more memory usage. Range: 50-500
                  </small>
                </label>
              </div>
              
              <div className="config-group">
                <label className="config-label">
                  Max API Log Entries
                  <input
                    type="number"
                    min="50"
                    max="500"
                    step="50"
                    value={apiLogMaxEntries}
                    onChange={(e) => {
                      const value = parseInt(e.target.value, 10)
                      if (!isNaN(value) && value >= 50 && value <= 500) {
                        setApiLogMaxEntries(value)
                      }
                    }}
                    className="config-input"
                  />
                  <small style={{ color: '#666', fontSize: '0.85rem' }}>
                    Maximum number of API log entries to keep. Higher = more memory usage. Range: 50-500
                  </small>
                </label>
              </div>
              
              <div className="config-info" style={{ 
                marginTop: '1rem', 
                padding: '0.75rem', 
                background: '#F0F0F0', 
                borderRadius: '6px',
                fontSize: '0.85rem',
                color: '#333'
              }}>
                <strong>Performance Tips:</strong>
                <ul style={{ marginTop: '0.5rem', paddingLeft: '1.5rem' }}>
                  <li>For maximum API testing speed: Set UI Update Interval to 2000-5000ms</li>
                  <li>For real-time visualization: Set UI Update Interval to 100-500ms</li>
                  <li>Lower graph/log limits = less memory usage but less historical data</li>
                  <li>Changes take effect on the next test run</li>
                </ul>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn-primary"
                onClick={() => setShowConfigPanel(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      
      <div className="api-info-section">
        <div className="api-url-display">
          <div className="api-label">API Endpoint:</div>
          <div className="api-value">{API_BASE_URL}</div>
        </div>
      </div>

      <div className="main-layout">
        <div className="left-column">
          {/* Unified Testing Section */}
          <div className="testing-section">
            {/* Mode Selection */}
            <div className="tabs-container" style={{ marginBottom: '1rem' }}>
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

            {/* Configuration Section - Unified */}
            <div className="config-section">
              {activeTab === 'manual' ? (
                <>
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
                </>
              ) : (
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
                        setCallCountInput(inputValue)
                        if (inputValue !== '') {
                          const numValue = parseInt(inputValue, 10)
                          if (!isNaN(numValue)) {
                            setCallCount(Math.max(1, Math.min(10000, numValue)))
                          }
                        }
                      }}
                      onBlur={(e) => {
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
                </div>
              )}
            </div>

            {/* Unified Controls */}
            <div className="unified-controls" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '1rem', marginBottom: '1rem' }}>
              {activeTab === 'manual' ? (
                <button
                  className="btn-primary"
                  onClick={runManualTests}
                  disabled={isRunning}
                >
                  {isRunning 
                    ? `Running... (${stats.total}/${manualParams.length * manualRepeatCount})` 
                    : `Run Manual Test${manualRepeatCount > 1 ? ` (${manualRepeatCount.toLocaleString()}x)` : ''}`
                  }
                </button>
              ) : (
                <>
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
                </>
              )}
              <button
                className="btn-secondary"
                onClick={clearResults}
                disabled={isRunning}
              >
                Clear Results
              </button>
              {activeTab === 'batch' && (
                <button
                  className="btn-secondary"
                  onClick={printResults}
                  disabled={isRunning || results.length === 0}
                >
                  Print Results
                </button>
              )}
            </div>

            {/* Test Timing Info - Unified */}
            {(testStartTime || testEndTime) && (
              <div style={{ 
                background: '#F9F9F9', 
                padding: '0.75rem', 
                borderRadius: '8px', 
                marginBottom: '1rem',
                border: '1px solid #E0E0E0',
                fontSize: '0.875rem'
              }}>
                {testStartTime && (
                  <div style={{ marginBottom: '0.25rem' }}>
                    <strong>Started:</strong> {testStartTime}
                  </div>
                )}
                {testEndTime && (
                  <div>
                    <strong>Ended:</strong> {testEndTime}
                  </div>
                )}
              </div>
            )}

            {/* Unified Stats - Show for both modes */}
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

            {/* Unified Progress Bar - Show for both modes */}
            {activeTab === 'batch' ? (
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                >
                  {progress.toFixed(1)}%
                </div>
              </div>
            ) : (
              (() => {
                const totalExpected = manualParams.filter(p => p.dateString.trim() && p.nin.trim()).length * manualRepeatCount
                const manualProgress = totalExpected > 0 ? (manualResults.length / totalExpected) * 100 : 0
                return manualResults.length > 0 && totalExpected > 0 ? (
                  <div className="progress-bar">
                    <div
                      className="progress-fill"
                      style={{ width: `${Math.min(100, manualProgress)}%` }}
                    >
                      {manualProgress.toFixed(1)}%
                    </div>
                  </div>
                ) : null
              })()
            )}
          </div>
        </div>

        <div className="right-column">
          {responseTimeData.length > 0 && (
            <div className="chart-section">
              <h2 className="section-title">Live Response Time Graph</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart 
                  data={responseTimeData}
                  margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
                >
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
                    type="linear" 
                    dataKey="duration" 
                    stroke="#000000" 
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: '#000000' }}
                    isAnimationActive={false}
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

          {/* Unified Results Section */}
          <div className="results-section">
            <div className="results-header">
              <h3 className="section-title">
                {activeTab === 'manual' 
                  ? `Test Results (${manualResults.length})` 
                  : `Test Results (${results.length})`
                }
              </h3>
              {((activeTab === 'manual' && manualResults.length > 0) || (activeTab === 'batch' && results.length > 0)) && (
                <div className="pagination">
                  <button
                    className="pagination-btn"
                    onClick={() => {
                      if (activeTab === 'manual') {
                        setManualCurrentPage(prev => Math.max(1, prev - 1))
                      } else {
                        setCurrentPage(prev => Math.max(1, prev - 1))
                      }
                    }}
                    disabled={activeTab === 'manual' ? manualCurrentPage === 1 : currentPage === 1}
                  >
                    Previous
                  </button>
                  <span className="pagination-info">
                    {activeTab === 'manual' ? (
                      <>Page {manualCurrentPage} of {manualTotalPages} ({manualStartIndex + 1}-{Math.min(manualEndIndex, manualResults.length)} of {manualResults.length})</>
                    ) : (
                      <>Page {currentPage} of {totalPages} ({startIndex + 1}-{Math.min(endIndex, results.length)} of {results.length})</>
                    )}
                  </span>
                  <button
                    className="pagination-btn"
                    onClick={() => {
                      if (activeTab === 'manual') {
                        setManualCurrentPage(prev => Math.min(manualTotalPages, prev + 1))
                      } else {
                        setCurrentPage(prev => Math.min(totalPages, prev + 1))
                      }
                    }}
                    disabled={activeTab === 'manual' ? manualCurrentPage === manualTotalPages : currentPage === totalPages}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
            <div className="results">
              {activeTab === 'manual' ? (
                manualResults.length === 0 ? (
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
                        <span>Test #{manualStartIndex + index + 1}</span>
                        <span>{result.duration}ms</span>
                      </div>
                      <div className="result-body">
                        <div>
                          <strong>dateString:</strong> {result.dateString} |{' '}
                          <strong>nin:</strong> {result.nin}
                        </div>
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong>Status:</strong> {result.status.toUpperCase()}
                          {result.statusCode && <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>({result.statusCode})</span>}
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
                )
              ) : (
                results.length === 0 ? (
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
                        <span>Test #{result.id}</span>
                        <span>{result.duration}ms</span>
                      </div>
                      <div className="result-body">
                        <div>
                          <strong>dateString:</strong> {result.dateString} |{' '}
                          <strong>nin:</strong> {result.nin}
                        </div>
                        <div style={{ marginTop: '0.5rem' }}>
                          <strong>Status:</strong> {result.status.toUpperCase()}
                          {result.statusCode && <span style={{ marginLeft: '0.5rem', opacity: 0.7 }}>({result.statusCode})</span>}
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
                )
              )}
            </div>
          </div>

          <div className="logs-section">
            <h2 className="section-title">API Response Log</h2>
            <div className="logs-container">
              {apiLogs.length === 0 ? (
                <div className="empty-state">No logs yet. Start testing to see API responses.</div>
              ) : (
                <table className="api-logs-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Response Code</th>
                      <th>Response Preview</th>
                      <th>Time (ms)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {apiLogs.map((log, index) => {
                      const getStatusCodeColor = (code: number) => {
                        if (code >= 200 && code < 300) return '#28a745' // Green for 2xx
                        if (code >= 300 && code < 400) return '#17a2b8' // Blue for 3xx
                        if (code >= 400 && code < 500) return '#ffc107' // Yellow/Orange for 4xx
                        if (code >= 500) return '#dc3545' // Red for 5xx
                        return '#6c757d' // Gray for 0 or unknown
                      }
                      
                      return (
                        <tr key={index}>
                          <td className="log-serial">{log.serial}</td>
                          <td 
                            className="log-status-code"
                            style={{ 
                              color: getStatusCodeColor(log.statusCode),
                              fontWeight: 'bold'
                            }}
                          >
                            {log.statusCode || 'N/A'}
                          </td>
                          <td className="log-preview">{log.responsePreview || '-'}</td>
                          <td className="log-time">{log.time}ms</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
