'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Play, Download, Sparkles, Clock, ArrowLeft, Search, FileText } from 'lucide-react'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'

interface Recording {
  id: string
  room_id: string
  daily_recording_id: string
  recording_url: string
  duration: number
  file_size: number
  status: string
  created_at: string
  room: {
    name: string
    daily_room_name: string
  }
  transcriptions: {
    id: string
    transcript_text: string
    word_timestamps: {
      words: Array<{
        word: string
        start: number
        end: number
        confidence?: number
      }>
      segments: Array<{
        id: number
        start: number
        end: number
        text: string
        words: Array<{
          word: string
          start: number
          end: number
          confidence?: number
        }>
      }>
      wordCount: number
      totalDuration: number
    }
    language: string
    confidence: number
  }[]
}

interface AIEditJob {
  jobId: string
  status: 'processing' | 'completed' | 'failed'
  progress: number
  editedVideoUrl?: string
  thumbnailUrl?: string
}

export default function RecordingsPage() {
  const { user, loading: authLoading } = useAuth()
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(false)
  const [roomSearch, setRoomSearch] = useState('')
  const [aiJobs, setAiJobs] = useState<{ [key: string]: AIEditJob }>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && user) {
      fetchRecordings()
    }
  }, [authLoading, user])

  const fetchRecordings = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await fetch('/api/recordings/list', {
        method: 'GET',
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Failed to fetch recordings')
      }

      const data = await response.json()
      setRecordings(data.recordings || [])
    } catch (error) {
      console.error('Error fetching recordings:', error)
      setError('Errore nel caricamento delle registrazioni')
    } finally {
      setLoading(false)
    }
  }

  const searchRecordings = async () => {
    if (!roomSearch.trim()) {
      fetchRecordings()
      return
    }

    try {
      setLoading(true)
      setError(null)

      const response = await fetch(`/api/recordings/search?q=${encodeURIComponent(roomSearch)}`, {
        credentials: 'include'
      })

      if (!response.ok) {
        throw new Error('Search failed')
      }

      const data = await response.json()
      setRecordings(data.recordings || [])
    } catch (error) {
      console.error('Error searching recordings:', error)
      setError('Errore nella ricerca')
    } finally {
      setLoading(false)
    }
  }

  const startAIEdit = async (recordingId: string) => {
    try {
      const response = await fetch('/api/ai-edit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recordingIds: [recordingId],
          editingOptions: {
            style: 'professional',
            removeFillers: true,
            addTransitions: true,
            enhanceAudio: true,
          },
        }),
      })

      const data = await response.json()

      if (data.success) {
        setAiJobs(prev => ({
          ...prev,
          [recordingId]: {
            jobId: data.job.jobId,
            status: 'processing',
            progress: 0,
          },
        }))

        // Simula progress updates
        const interval = setInterval(() => {
          setAiJobs(prev => {
            const job = prev[recordingId]
            if (job && job.progress < 100) {
              return {
                ...prev,
                [recordingId]: {
                  ...job,
                  progress: Math.min(job.progress + Math.random() * 20, 100),
                  status: job.progress >= 99 ? 'completed' : 'processing',
                  editedVideoUrl: job.progress >= 99 ? data.job.editedVideoUrl : undefined,
                  thumbnailUrl: job.progress >= 99 ? data.job.thumbnailUrl : undefined,
                }
              }
            }
            if (job && job.progress >= 100) {
              clearInterval(interval)
            }
            return prev
          })
        }, 1000)
      }
    } catch (error) {
      console.error('Error starting AI edit:', error)
    }
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    if (hours > 0) {
      return `${hours}h ${minutes}m`
    }
    return `${minutes}m`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('it-IT', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const filteredRecordings = recordings.filter(recording => {
    const roomName = recording.room?.name || recording.room?.daily_room_name || ''
    return roomName.toLowerCase().includes(roomSearch.toLowerCase())
  })

  // Loading state
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  // Authentication required
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Accesso Richiesto</h1>
          <p className="text-gray-600 mb-6">Devi essere autenticato per visualizzare le registrazioni</p>
          <Link href="/">
            <Button className="bg-blue-600 hover:bg-blue-700">
              Torna alla Home
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <Link href="/">
                <Button variant="outline" className="bg-white">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Home
                </Button>
              </Link>
              <h1 className="text-3xl font-bold text-gray-900">Le Tue Registrazioni</h1>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div className="bg-white rounded-lg shadow-md p-6 mb-8">
            <div className="flex gap-4">
              <div className="flex-1">
                <input
                  type="text"
                  placeholder="Cerca per nome room..."
                  value={roomSearch}
                  onChange={(e) => setRoomSearch(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => e.key === 'Enter' && searchRecordings()}
                />
              </div>
              <Button 
                onClick={searchRecordings}
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 px-6"
              >
                <Search className="h-4 w-4 mr-2" />
                {loading ? 'Cercando...' : 'Cerca'}
              </Button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecordings.map((recording) => (
              <div key={recording.id} className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="relative">
                  <div className="w-full h-48 bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
                    <div className="text-center">
                      <Play className="h-16 w-16 text-blue-600 mx-auto mb-2" />
                      <p className="text-blue-800 font-medium">
                        {recording.room?.name || recording.room?.daily_room_name || 'Recording'}
                      </p>
                    </div>
                  </div>
                  <div className="absolute top-4 right-4 bg-black/70 text-white px-2 py-1 rounded text-sm">
                    {formatDuration(recording.duration)}
                  </div>
                  <div className="absolute top-4 left-4 bg-green-600 text-white px-2 py-1 rounded text-xs capitalize">
                    {recording.status}
                  </div>
                </div>

                <div className="p-6">
                  <h3 className="font-semibold text-lg mb-2">
                    {recording.room?.name || recording.room?.daily_room_name || 'Recording'}
                  </h3>
                  
                  <div className="flex items-center text-gray-600 text-sm mb-2">
                    <Clock className="h-4 w-4 mr-1" />
                    {formatDate(recording.created_at)}
                  </div>

                  <div className="flex items-center text-gray-600 text-sm mb-4">
                    <Download className="h-4 w-4 mr-1" />
                    {Math.round(recording.file_size / (1024 * 1024))} MB
                  </div>

                  {/* Show transcription preview if available */}
                  {recording.transcriptions && recording.transcriptions.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-3 mb-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700 flex items-center">
                          <FileText className="h-4 w-4 mr-1" />
                          Trascrizione
                        </span>
                        <span className="text-xs text-gray-500">
                          {Math.round(recording.transcriptions[0].confidence * 100)}% confidenza
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {recording.transcriptions[0].transcript_text}
                      </p>
                      <div className="text-xs text-gray-500 mt-1">
                        {recording.transcriptions[0].word_timestamps?.wordCount || 0} parole • {recording.transcriptions[0].language}
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex space-x-2">
                      {recording.recording_url ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          onClick={() => window.open(recording.recording_url, '_blank')}
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Download
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled
                        >
                          <Download className="h-4 w-4 mr-1" />
                          Non disponibile
                        </Button>
                      )}
                      
                      {recording.transcriptions && recording.transcriptions.length > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {/* TODO: Open transcript viewer */}}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          Visualizza
                        </Button>
                      )}
                    </div>

                    {aiJobs[recording.id] ? (
                      <div className="bg-gray-50 rounded-lg p-4">
                        {aiJobs[recording.id].status === 'processing' ? (
                          <div>
                            <div className="flex items-center justify-between text-sm mb-2">
                              <span className="text-blue-600 font-medium">Montaggio AI in corso...</span>
                              <span>{Math.round(aiJobs[recording.id].progress)}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${aiJobs[recording.id].progress}%` }}
                              />
                            </div>
                          </div>
                        ) : (
                          <div className="text-center">
                            <div className="text-green-600 font-medium mb-2">✓ Montaggio completato!</div>
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => window.open(aiJobs[recording.id].editedVideoUrl, '_blank')}
                            >
                              <Download className="h-4 w-4 mr-1" />
                              Scarica Video Montato
                            </Button>
                          </div>
                        )}
                      </div>
                    ) : (
                      <Button
                        className="w-full bg-purple-600 hover:bg-purple-700"
                        onClick={() => startAIEdit(recording.id)}
                      >
                        <Sparkles className="h-4 w-4 mr-2" />
                        Montaggio AI
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredRecordings.length === 0 && (
            <div className="text-center py-12">
              <div className="bg-gray-100 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4">
                <Play className="h-12 w-12 text-gray-400" />
              </div>
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Nessuna registrazione trovata</h2>
              <p className="text-gray-500 mb-6">
                {roomSearch ? 'Prova con un nome room diverso' : 'Le tue registrazioni appariranno qui dopo le videoconferenze'}
              </p>
              <Link href="/">
                <Button className="bg-blue-600 hover:bg-blue-700">
                  Crea Nuova Intervista
                </Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}