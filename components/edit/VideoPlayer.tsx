'use client'

import { useState, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Volume2, VolumeX } from "lucide-react"

interface Recording {
  id: string
  recording_url: string
  duration: number
  file_size: number
  recording_started_at?: string
  created_at?: string
}

interface VideoSection {
  id: string
  startTime: number
  endTime: number
  isDeleted: boolean
  playbackSpeed: number
  focusedParticipantId?: string
}

interface VideoPlayerProps {
  recordings: Recording[]
  currentTime: number
  mutedVideos: Set<string>
  videoRefs: React.MutableRefObject<{ [key: string]: HTMLVideoElement }>
  focusedVideo: string | null
  videoErrors: Set<string>
  syncOffsets: { [key: string]: number }
  videoSections: VideoSection[]
  videosLoaded: Set<string>
  isPlaying: boolean
  onToggleMute: (recordingId: string) => void
  onVideoError: (recordingId: string) => void
  onRetryVideo: (recordingId: string) => void
  onVideosLoaded: (recordingId: string) => void
  onTimeUpdate: (recordingId: string, videoTime: number) => void
  currentCaptions?: Array<{
    word: string
    start: number
    end: number
    isActive: boolean
    participantIndex: number
  }> | null
}

export function VideoPlayer({
  recordings,
  currentTime,
  mutedVideos,
  videoRefs,
  focusedVideo,
  videoErrors,
  syncOffsets,
  videoSections,
  videosLoaded,
  isPlaying,
  onToggleMute,
  onVideoError,
  onRetryVideo,
  onVideosLoaded,
  onTimeUpdate,
  currentCaptions
}: VideoPlayerProps) {
  const getVideoGridClass = (count: number) => {
    if (count === 1) return "grid-cols-1"
    if (count === 2) return "grid-cols-2"
    if (count <= 4) return "grid-cols-2"
    return "grid-cols-3"
  }

  const renderVideoCard = (recording: Recording, index: number) => {
    const currentSection = videoSections.find(
      (section) =>
        currentTime >= section.startTime && currentTime < section.endTime
    )
    const isInFocus = currentSection?.focusedParticipantId === recording.id
    const hasVideoError = videoErrors.has(recording.id)

    return (
      <div
        key={recording.id}
        className={`relative bg-black rounded-lg overflow-hidden w-full h-full transition-all duration-200 ${
          isInFocus ? "ring-2 ring-purple-400" : ""
        }`}
      >
        <video
          ref={(el) => {
            if (el) {
              videoRefs.current[recording.id] = el
            }
          }}
          src={recording.recording_url}
          controls={false}
          muted={mutedVideos.has(recording.id)}
          className="w-full h-full object-cover"
          crossOrigin="anonymous"
          onLoadedMetadata={(e) => {
            const video = e.currentTarget
            console.log(
              `Video loaded: ${recording.id}, duration: ${video.duration}s`
            )

            onVideosLoaded(recording.id)

            const offset = syncOffsets[recording.id] || 0
            const initialVideoTime = currentTime + offset

            if (isFinite(initialVideoTime) && initialVideoTime >= 0) {
              const clampedTime = Math.min(
                initialVideoTime,
                video.duration || initialVideoTime
              )
              video.currentTime = clampedTime
              console.log(
                `Video ${recording.id}: applying cut offset ${offset}s, starting at ${clampedTime}s`
              )
            } else {
              console.error(
                `Invalid initial video time for ${recording.id}: ${initialVideoTime} (currentTime: ${currentTime}, offset: ${offset})`
              )
              video.currentTime = 0
            }
          }}
          onTimeUpdate={(e) => {
            const video = e.currentTarget
            const masterVideoId = focusedVideo || recordings[0]?.id
            if (recording.id === masterVideoId) {
              onTimeUpdate(recording.id, video.currentTime)
            }
          }}
          onError={(e) => {
            console.error(
              `Video error for ${recording.id}:`,
              e.currentTarget.error
            )
            console.log(`Video URL: ${recording.recording_url}`)
            onVideoError(recording.id)
          }}
          onLoadStart={() => {
            console.log(`Loading video: ${recording.id}`)
          }}
        />

        {hasVideoError && (
          <div className="absolute inset-0 bg-gray-800 flex flex-col items-center justify-center text-white">
            <div className="text-center p-4">
              <div className="text-red-400 mb-2">⚠️ Errore Video</div>
              <div className="text-sm text-gray-300">
                Video non disponibile o scaduto
              </div>
              <Button
                onClick={() => onRetryVideo(recording.id)}
                size="sm"
                variant="outline"
                className="mt-2"
              >
                Riprova
              </Button>
            </div>
          </div>
        )}

        <div className="absolute bottom-2 right-2 flex space-x-2">
          <Button
            size="sm"
            variant={mutedVideos.has(recording.id) ? "secondary" : "default"}
            onClick={() => onToggleMute(recording.id)}
          >
            {mutedVideos.has(recording.id) ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
          Partecipante {index + 1}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 mb-6 relative">
      <div className="w-full h-[400px] mx-auto relative overflow-hidden">
        <div
          className={`w-full h-full transition-all duration-500 ease-in-out ${
            focusedVideo
              ? "flex items-center justify-center"
              : `grid gap-2 ${getVideoGridClass(recordings.length)}`
          }`}
        >
          {recordings.map((recording, index) => {
            const isFocused = focusedVideo === recording.id
            const shouldShow = !focusedVideo || isFocused

            return (
              <div
                key={recording.id}
                className={`transform transition-all duration-500 ease-in-out ${
                  shouldShow
                    ? "opacity-100 scale-100 relative"
                    : "opacity-0 scale-95 absolute top-0 left-0 pointer-events-none"
                } ${isFocused ? "w-full h-full" : ""}`}
              >
                {renderVideoCard(recording, index)}
              </div>
            )
          })}
        </div>
      </div>

      {currentCaptions && currentCaptions.length > 0 && (
        <div className="absolute top-4 left-4 right-4 bottom-4 flex items-end justify-center pointer-events-none">
          <div className="bg-black bg-opacity-75 rounded-lg p-4 max-w-[600px]">
            <div className="flex flex-wrap gap-1 text-white text-lg font-medium leading-relaxed">
              {currentCaptions.map((caption, index) => (
                <span
                  key={`${caption.start}-${index}`}
                  className={`transition-all duration-300 px-1 rounded ${
                    caption.isActive
                      ? "bg-yellow-400 text-black font-bold scale-110"
                      : caption.participantIndex === 1
                      ? "text-blue-300"
                      : "text-green-300"
                  }`}
                  style={{
                    transitionDelay: caption.isActive ? "0ms" : "100ms",
                  }}
                >
                  {caption.word}
                </span>
              ))}
            </div>

            <div className="text-xs text-gray-300 mt-2">
              {currentCaptions.some((c) => c.isActive) && (
                <>
                  Partecipante{" "}
                  {
                    currentCaptions.find((c) => c.isActive)
                      ?.participantIndex
                  }
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}