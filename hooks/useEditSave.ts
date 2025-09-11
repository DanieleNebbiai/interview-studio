import { useState, useCallback } from 'react'

interface VideoSection {
  id: string
  startTime: number
  endTime: number
  isDeleted: boolean
  playbackSpeed: number
}

interface ZoomRange {
  id: string
  startTime: number
  endTime: number
  focusOn: string
  participantIndex: number
  aiGenerated?: boolean
  reason?: string
  confidence?: number
  type?: 'monologue' | 'conversation' | 'silence'
}

interface EditState {
  videoSections: VideoSection[]
  zoomRanges: ZoomRange[]
  splitPoints: number[]
}

interface SaveSummary {
  totalSections: number
  deletedSections: number
  speedModifiedSections: number
  zoomRanges: number
  splitPoints: number
  originalDuration: number
  finalDuration: number
  compressionRatio: number
}

export function useEditSave() {
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const saveEditState = useCallback(async (roomId: string, editState: EditState) => {
    setIsSaving(true)
    setSaveError(null)
    
    try {
      const response = await fetch('/api/edit/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          roomId,
          editState
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to save edit state')
      }

      const result = await response.json()
      setLastSaved(new Date())
      
      console.log('✅ Edit state saved:', result.summary)
      return result.summary as SaveSummary
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      setSaveError(errorMessage)
      console.error('❌ Failed to save edit state:', errorMessage)
      throw error
    } finally {
      setIsSaving(false)
    }
  }, [])

  const loadEditState = useCallback(async (roomId: string): Promise<EditState | null> => {
    try {
      console.log('🌐 Making GET request to load edit state for room:', roomId)
      const response = await fetch(`/api/edit/save?roomId=${roomId}`)
      
      console.log('🌐 GET response status:', response.status, response.statusText)
      
      if (!response.ok) {
        const error = await response.json()
        console.error('❌ GET request failed:', error)
        throw new Error(error.error || 'Failed to load edit state')
      }

      const result = await response.json()
      console.log('🌐 GET response data:', result)
      
      if (result.editState) {
        console.log('📖 Loaded user edit state:', result.editState)
        return result.editState
      }
      
      console.log('⚠️ No edit state in response')
      return null
      
    } catch (error) {
      console.error('❌ Failed to load edit state:', error)
      return null
    }
  }, [])

  return {
    saveEditState,
    loadEditState,
    isSaving,
    lastSaved,
    saveError,
    clearError: () => setSaveError(null)
  }
}