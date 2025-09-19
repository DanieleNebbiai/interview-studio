'use client'

// import { Button } from "@/components/ui/button" // Not used

interface VideoSection {
  id: string
  startTime: number
  endTime: number
  isDeleted: boolean
  playbackSpeed: number
  focusedParticipantId?: string
}

interface Recording {
  id: string
  recording_url: string
  duration: number
  file_size: number
  recording_started_at?: string
  created_at?: string
}

interface ContextMenuProps {
  contextMenu: {
    x: number
    y: number
    sectionId: string
    openUpward?: boolean
  } | null
  videoSections: VideoSection[]
  recordings: Recording[]
  onDeleteSection: (sectionId: string) => void
  onRestoreSection: (sectionId: string) => void
  onSetPlaybackSpeed: (sectionId: string, speed: number) => void
  onSetSectionFocus: (sectionId: string, participantId?: string) => void
  onDebugSaveSection: (sectionId: string, speed: number) => void
  onClose: () => void
}

export function ContextMenu({
  contextMenu,
  videoSections,
  recordings,
  onDeleteSection,
  onRestoreSection,
  onSetPlaybackSpeed,
  onSetSectionFocus,
  onDebugSaveSection,
  onClose
}: ContextMenuProps) {
  if (!contextMenu) return null

  const section = videoSections.find((s) => s.id === contextMenu.sectionId)
  if (!section) return null

  return (
    <div
      className={`fixed bg-white shadow-lg rounded-lg border py-2 z-50 transform transition-all duration-200 ${
        contextMenu.openUpward ? "origin-bottom" : "origin-top"
      }`}
      style={{
        left: contextMenu.x,
        ...(contextMenu.openUpward
          ? { bottom: window.innerHeight - contextMenu.y + 10 }
          : { top: contextMenu.y }),
      }}
      onMouseLeave={onClose}
    >
      <div>
        <div className="px-4 py-1 text-xs text-gray-500 border-b flex items-center justify-between">
          <span>
            Sezione {section.startTime.toFixed(1)}s -{" "}
            {section.endTime.toFixed(1)}s
          </span>
          {contextMenu.openUpward && (
            <span className="text-xs text-gray-400">▲</span>
          )}
          {!contextMenu.openUpward && (
            <span className="text-xs text-gray-400">▼</span>
          )}
        </div>
        {section.isDeleted ? (
          <button
            className="w-full px-4 py-2 text-left hover:bg-gray-100 text-green-600"
            onClick={() => onRestoreSection(section.id)}
          >
            ↺ Ripristina Sezione
          </button>
        ) : (
          <div>
            <div className="px-4 py-1 text-xs text-gray-400 border-b">
              Velocità: {section.playbackSpeed}x
            </div>

            <div className="border-b mb-1">
              <div className="px-3 py-1 text-xs text-gray-500">
                Velocità riproduzione:
              </div>
              {[0.25, 0.5, 0.75, 1.0, 1.1, 1.2, 1.3, 1.5, 2.0, 4.0].map(
                (speed) => (
                  <button
                    key={speed}
                    className={`w-full px-4 py-1 text-left hover:bg-gray-100 text-sm ${
                      section.playbackSpeed === speed
                        ? "bg-blue-50 text-blue-600 font-medium"
                        : "text-gray-700"
                    }`}
                    onClick={() => onSetPlaybackSpeed(section.id, speed)}
                  >
                    {speed === 1.0 ? "🎬" : speed < 1.0 ? "🐌" : "⚡"}{" "}
                    {speed}x {speed === 1.0 ? "(normale)" : ""}
                  </button>
                )
              )}
            </div>

            <div className="border-t pt-1">
              <div className="px-4 py-1 text-xs text-gray-400 border-b">
                Focus:{" "}
                {section.focusedParticipantId
                  ? recordings.find(
                      (r) => r.id === section.focusedParticipantId
                    )
                    ? `Partecipante ${
                        recordings.findIndex(
                          (r) => r.id === section.focusedParticipantId
                        ) + 1
                      }`
                    : "Sconosciuto"
                  : "Nessuno (50/50)"}
              </div>

              <button
                className={`w-full px-4 py-1 text-left hover:bg-gray-100 text-sm ${
                  !section.focusedParticipantId
                    ? "bg-blue-50 text-blue-600 font-medium"
                    : "text-gray-700"
                }`}
                onClick={() => onSetSectionFocus(section.id, undefined)}
              >
                👥 Nessun Focus (50/50)
              </button>

              {recordings.map((recording, index) => (
                <button
                  key={recording.id}
                  className={`w-full px-4 py-1 text-left hover:bg-gray-100 text-sm ${
                    section.focusedParticipantId === recording.id
                      ? "bg-blue-50 text-blue-600 font-medium"
                      : "text-gray-700"
                  }`}
                  onClick={() =>
                    onSetSectionFocus(section.id, recording.id)
                  }
                >
                  🎯 Partecipante {index + 1}
                </button>
              ))}
            </div>

            <button
              className="w-full px-4 py-2 text-left hover:bg-gray-100 text-red-600 border-t"
              onClick={() => onDeleteSection(section.id)}
            >
              🗑️ Elimina Sezione
            </button>

            <div className="border-t mb-1">
              <button
                className="w-full px-4 py-2 text-left hover:bg-gray-100 text-purple-600 text-sm"
                onClick={() => onDebugSaveSection(section.id, 0.5)}
              >
                🚨 DEBUG: Test Save 0.5x
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}