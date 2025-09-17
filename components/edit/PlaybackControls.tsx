'use client'

import { Button } from "@/components/ui/button"
import { Play, Pause } from "lucide-react"

interface PlaybackControlsProps {
  isPlaying: boolean
  currentTime: number
  duration: number
  onTogglePlay: () => void
}

export function PlaybackControls({
  isPlaying,
  currentTime,
  duration,
  onTogglePlay
}: PlaybackControlsProps) {
  return (
    <div className="flex items-center space-x-4">
      <Button onClick={onTogglePlay}>
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      <div className="text-sm text-gray-600">
        {Math.floor(currentTime / 60)}:
        {(currentTime % 60).toFixed(0).padStart(2, "0")} /{" "}
        {Math.floor(duration / 60)}:
        {(duration % 60).toFixed(0).padStart(2, "0")}
      </div>
    </div>
  )
}