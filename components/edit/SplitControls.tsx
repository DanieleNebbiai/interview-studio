'use client'

import { Button } from "@/components/ui/button"

interface VideoSection {
  id: string;
  startTime: number;
  endTime: number;
  isDeleted: boolean;
  playbackSpeed: number;
}

interface SplitControlsProps {
  isSplitMode: boolean
  splitPoints: number[]
  videoSections: VideoSection[]
  isSaving: boolean
  lastSaved: Date | null
  saveError: string | null
  onToggleSplitMode: () => void
  onResetSplits: () => void
}

export function SplitControls({
  isSplitMode,
  splitPoints,
  videoSections,
  isSaving,
  lastSaved,
  saveError,
  onToggleSplitMode,
  onResetSplits
}: SplitControlsProps) {
  return (
    <div className="flex items-center space-x-2">
      <Button
        onClick={onToggleSplitMode}
        size="sm"
        variant={isSplitMode ? "default" : "outline"}
      >
        {isSplitMode ? "🔪 Split Mode ON" : "🔪 Split Mode"}
      </Button>
      <Button
        onClick={onResetSplits}
        size="sm"
        variant="outline"
        disabled={splitPoints.length === 0}
      >
        Reset Splits
      </Button>
      <div className="text-sm text-gray-500 flex items-center gap-2">
        <span>
          {splitPoints.length} splits,{" "}
          {videoSections.filter((s) => !s.isDeleted).length}/
          {videoSections.length} sezioni
        </span>
        {isSaving && (
          <span className="text-xs text-blue-500">
            💾 Salvando...
          </span>
        )}
        {lastSaved && !isSaving && (
          <span className="text-xs text-green-500">
            ✅ Salvato {lastSaved.toLocaleTimeString()}
          </span>
        )}
        {saveError && (
          <span className="text-xs text-red-500" title={saveError}>
            ❌ Errore salvataggio
          </span>
        )}
      </div>
    </div>
  )
}