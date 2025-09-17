'use client'

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Play, Download, Sparkles, Clock, FileText } from "lucide-react"

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
      wordCount: number
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
}

interface RecordingCardProps {
  recording: Recording
  aiJob?: AIEditJob
  onStartAIEdit: (recordingId: string) => void
}

export function RecordingCard({ recording, aiJob, onStartAIEdit }: RecordingCardProps) {
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

  return (
    <Card className="overflow-hidden">
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

      <CardContent className="p-6">
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

          {aiJob ? (
            <Card>
              <CardContent className="p-4">
                {aiJob.status === 'processing' ? (
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-blue-600 font-medium">Montaggio AI in corso...</span>
                      <span>{Math.round(aiJob.progress)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${aiJob.progress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-green-600 font-medium mb-2">✓ Montaggio completato!</div>
                    <Button
                      size="sm"
                      onClick={() => window.open(aiJob.editedVideoUrl, '_blank')}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Scarica Video Montato
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Button
              className="w-full"
              onClick={() => onStartAIEdit(recording.id)}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Montaggio AI
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}