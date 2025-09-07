import { useState, useEffect, useCallback } from 'react'

export interface ExportSettings {
  format: 'mp4' | 'webm'
  quality: '720p' | '1080p' | '4k'
  framerate: 25 | 30 | 60
  includeSubtitles: boolean
}

export interface ExportStatus {
  jobId: string | null
  percentage: number
  message: string
  stage: 'idle' | 'queued' | 'downloading' | 'processing' | 'uploading' | 'completed' | 'failed'
  downloadUrl?: string
  error?: string
}

export function useVideoExport() {
  const [exportStatus, setExportStatus] = useState<ExportStatus>({
    jobId: null,
    percentage: 0,
    message: '',
    stage: 'idle'
  })

  const [isExporting, setIsExporting] = useState(false)

  // Start export
  const startExport = useCallback(async (roomId: string, settings: ExportSettings) => {
    try {
      setIsExporting(true)
      setExportStatus({
        jobId: null,
        percentage: 0,
        message: 'Starting export...',
        stage: 'queued'
      })

      console.log('🚀 Starting export for room:', roomId, 'with settings:', settings)

      const response = await fetch('/api/export/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          roomId,
          exportSettings: settings
        })
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to start export')
      }

      const data = await response.json()
      const jobId = data.jobId

      console.log('✅ Export job created:', jobId)

      setExportStatus(prev => ({
        ...prev,
        jobId,
        message: 'Export queued successfully',
        stage: 'queued'
      }))

      // Start polling for status
      pollJobStatus(jobId)

    } catch (error) {
      console.error('❌ Failed to start export:', error)
      setExportStatus({
        jobId: null,
        percentage: 0,
        message: error instanceof Error ? error.message : 'Failed to start export',
        stage: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
      setIsExporting(false)
    }
  }, [])

  // Poll job status
  const pollJobStatus = useCallback(async (jobId: string) => {
    let attempts = 0
    const maxAttempts = 360 // 30 minutes with 5s intervals

    const poll = async () => {
      try {
        attempts++
        
        const response = await fetch(`/api/export/status/${jobId}`)
        
        if (!response.ok) {
          if (attempts >= maxAttempts) {
            throw new Error('Export timeout - job taking too long')
          }
          console.log(`⚠️ Status check failed, retrying... (${attempts}/${maxAttempts})`)
          setTimeout(poll, 5000) // Retry in 5 seconds
          return
        }

        const statusData = await response.json()
        
        console.log('📊 Export status:', statusData)

        setExportStatus({
          jobId,
          percentage: statusData.percentage || 0,
          message: statusData.message || 'Processing...',
          stage: statusData.stage || 'processing',
          downloadUrl: statusData.downloadUrl,
          error: statusData.error
        })

        // Continue polling if not finished
        if (statusData.stage === 'completed') {
          console.log('🎉 Export completed!')
          setIsExporting(false)
          
          // Auto-download if URL is available
          if (statusData.downloadUrl) {
            console.log('⬇️ Auto-downloading result...')
            window.open(statusData.downloadUrl, '_blank')
          }
        } else if (statusData.stage === 'failed') {
          console.error('❌ Export failed:', statusData.error)
          setIsExporting(false)
        } else {
          // Continue polling
          setTimeout(poll, 5000) // Poll every 5 seconds
        }

      } catch (error) {
        console.error('❌ Error checking job status:', error)
        
        if (attempts >= maxAttempts) {
          setExportStatus(prev => ({
            ...prev,
            message: 'Export timeout or failed',
            stage: 'failed',
            error: error instanceof Error ? error.message : 'Status check failed'
          }))
          setIsExporting(false)
        } else {
          // Retry
          setTimeout(poll, 5000)
        }
      }
    }

    // Start polling
    poll()
  }, [])

  // Cancel export (attempt to)
  const cancelExport = useCallback(() => {
    setIsExporting(false)
    setExportStatus({
      jobId: null,
      percentage: 0,
      message: 'Export cancelled',
      stage: 'idle'
    })
    console.log('🛑 Export cancelled by user')
  }, [])

  // Reset export state
  const resetExport = useCallback(() => {
    setIsExporting(false)
    setExportStatus({
      jobId: null,
      percentage: 0,
      message: '',
      stage: 'idle'
    })
  }, [])

  return {
    exportStatus,
    isExporting,
    startExport,
    cancelExport,
    resetExport
  }
}