'use client'

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

interface TimelineProps {
  duration: number
  currentTime: number
  videoSections: VideoSection[]
  splitPoints: number[]
  isSplitMode: boolean
  isDraggingSplit: boolean
  draggingSplitIndex: number | null
  recordings: Recording[]
  onTimelineClick: (event: React.MouseEvent<HTMLDivElement>) => void
  onSplitMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void
  onSplitMouseUp: () => void
  onSectionContextMenu: (event: React.MouseEvent, sectionId: string) => void
  onSplitMouseDown: (event: React.MouseEvent, splitIndex: number) => void
  onSplitContextMenu: (event: React.MouseEvent, splitIndex: number) => void
}

export function Timeline({
  duration,
  currentTime,
  videoSections,
  splitPoints,
  isSplitMode,
  isDraggingSplit,
  draggingSplitIndex,
  recordings,
  onTimelineClick,
  onSplitMouseMove,
  onSplitMouseUp,
  onSectionContextMenu,
  onSplitMouseDown,
  onSplitContextMenu
}: TimelineProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-400">
          {isSplitMode ? "Timeline - Click per fare split" : "Timeline"}
        </span>
        <div className="text-xs text-gray-500 flex items-center gap-4">
          <span>
            Durata finale:{" "}
            {(
              videoSections
                .filter((s) => !s.isDeleted)
                .reduce(
                  (acc, s) => acc + (s.endTime - s.startTime),
                  0
                ) / 60
            ).toFixed(1)}{" "}
            min
          </span>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-green-200 rounded-sm"></div>
              <span>1x</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-orange-200 rounded-sm"></div>
              <span>&lt;1x</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-blue-200 rounded-sm"></div>
              <span>&gt;1x</span>
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 bg-purple-300 rounded-sm"></div>
              <span>🎯 Focus</span>
            </div>
          </div>
        </div>
      </div>
      <div
        className={`w-full h-8 rounded-full cursor-pointer relative ${
          isSplitMode ? "bg-orange-100" : "bg-gray-200"
        }`}
        onClick={onTimelineClick}
        onMouseMove={onSplitMouseMove}
        onMouseUp={onSplitMouseUp}
        onMouseLeave={onSplitMouseUp}
      >
        {videoSections.map((section) => (
          <div
            key={section.id}
            className={`absolute top-0 h-full ${
              section.isDeleted
                ? "bg-red-200 opacity-50"
                : section.focusedParticipantId
                ? "bg-purple-300"
                : section.playbackSpeed !== 1.0
                ? section.playbackSpeed < 1.0
                  ? "bg-orange-200"
                  : "bg-blue-200"
                : "bg-green-200"
            } border-l border-r border-gray-400`}
            style={{
              left: `${(section.startTime / duration) * 100}%`,
              width: `${
                ((section.endTime - section.startTime) / duration) * 100
              }%`,
            }}
            title={`Section ${section.startTime.toFixed(
              1
            )}s - ${section.endTime.toFixed(1)}s${
              section.isDeleted
                ? " (DELETED)"
                : ` - Velocità: ${section.playbackSpeed}x${
                    section.focusedParticipantId
                      ? ` - Focus: Partecipante ${
                          recordings.findIndex(
                            (r) => r.id === section.focusedParticipantId
                          ) + 1 || "?"
                        }`
                      : " - Focus: 50/50"
                  }`
            }`}
            onContextMenu={(e) => {
              e.preventDefault()

              const windowHeight = window.innerHeight
              const clickY = e.clientY
              const estimatedMenuHeight = 400
              const shouldOpenUpward =
                clickY + estimatedMenuHeight > windowHeight

              onSectionContextMenu(e, section.id)
            }}
          >
            {section.isDeleted ? (
              <div className="absolute inset-0 flex items-center justify-center text-xs text-red-600 font-bold">
                DELETED
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                {section.focusedParticipantId ? (
                  <span className="text-purple-700">
                    🎯 P
                    {recordings.findIndex(
                      (r) => r.id === section.focusedParticipantId
                    ) + 1}
                    {section.playbackSpeed !== 1.0 && (
                      <span className="ml-1 text-xs">
                        {section.playbackSpeed}x
                      </span>
                    )}
                  </span>
                ) : section.playbackSpeed !== 1.0 ? (
                  <span
                    className={`${
                      section.playbackSpeed < 1.0
                        ? "text-orange-700"
                        : "text-blue-700"
                    }`}
                  >
                    {section.playbackSpeed}x
                  </span>
                ) : null}
              </div>
            )}
          </div>
        ))}

        {splitPoints.map((point, index) => (
          <div
            key={`split-${point}-${index}`}
            className="absolute top-0 h-full"
            style={{
              left: `${(point / duration) * 100}%`,
              transform: "translateX(-50%)",
              zIndex: 20,
            }}
          >
            <div className="absolute w-0.5 h-full bg-red-500" />

            <div
              className={`absolute w-4 h-4 bg-red-500 border-2 border-white rounded-full cursor-move shadow-lg hover:bg-red-600 transition-colors ${
                isDraggingSplit && draggingSplitIndex === index
                  ? "scale-125 bg-red-600"
                  : ""
              }`}
              style={{
                top: "-8px",
                left: "50%",
                transform: "translateX(-50%)",
              }}
              title={`Split at ${point.toFixed(
                1
              )}s - Drag to move, Right-click to delete`}
              onMouseDown={(e) => onSplitMouseDown(e, index)}
              onContextMenu={(e) => onSplitContextMenu(e, index)}
            />
          </div>
        ))}

        <div
          className="h-full bg-blue-600 bg-opacity-30 rounded-full"
          style={{ width: `${(currentTime / duration) * 100}%` }}
        />

        <div
          className="absolute top-0 h-full w-1 bg-blue-800 rounded z-10"
          style={{ left: `${(currentTime / duration) * 100}%` }}
        />
      </div>
    </div>
  )
}