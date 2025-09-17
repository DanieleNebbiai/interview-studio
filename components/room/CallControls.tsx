'use client'

import { Button } from "@/components/ui/button"
import { Mic, MicOff, Video, VideoOff, Phone, Circle, Square } from "lucide-react"

interface CallControlsProps {
  isAudioOn: boolean
  isVideoOn: boolean
  isRecording: boolean
  canRecord: boolean
  onToggleAudio: () => void
  onToggleVideo: () => void
  onToggleRecording: () => void
  onLeaveCall: () => void
}

export function CallControls({
  isAudioOn,
  isVideoOn,
  isRecording,
  canRecord,
  onToggleAudio,
  onToggleVideo,
  onToggleRecording,
  onLeaveCall
}: CallControlsProps) {
  return (
    <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
      <div className="flex items-center space-x-4 bg-gray-800/90 backdrop-blur rounded-full px-6 py-4">
        <Button
          onClick={onToggleAudio}
          size="lg"
          variant={isAudioOn ? "secondary" : "destructive"}
          className="rounded-full w-14 h-14"
        >
          {isAudioOn ? (
            <Mic className="h-6 w-6" />
          ) : (
            <MicOff className="h-6 w-6" />
          )}
        </Button>

        <Button
          onClick={onToggleVideo}
          size="lg"
          variant={isVideoOn ? "secondary" : "destructive"}
          className="rounded-full w-14 h-14"
        >
          {isVideoOn ? (
            <Video className="h-6 w-6" />
          ) : (
            <VideoOff className="h-6 w-6" />
          )}
        </Button>

        {canRecord ? (
          <Button
            onClick={onToggleRecording}
            size="lg"
            variant={isRecording ? "destructive" : "secondary"}
            className={`rounded-full w-14 h-14 ${isRecording ? "animate-pulse" : ""}`}
            title={isRecording ? "Stop Recording" : "Start Recording with Timestamp Sync"}
          >
            {isRecording ? (
              <Square className="h-6 w-6 fill-current" />
            ) : (
              <Circle className="h-6 w-6" />
            )}
          </Button>
        ) : (
          <Button
            size="lg"
            disabled
            className="rounded-full w-14 h-14 cursor-not-allowed opacity-50"
            title="Solo l'host può avviare le registrazioni"
          >
            <Circle className="h-6 w-6" />
          </Button>
        )}

        <Button
          onClick={onLeaveCall}
          size="lg"
          variant="destructive"
          className="rounded-full w-14 h-14"
        >
          <Phone className="h-6 w-6 transform rotate-[135deg]" />
        </Button>
      </div>
    </div>
  )
}