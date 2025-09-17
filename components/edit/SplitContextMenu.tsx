'use client'

interface SplitContextMenuProps {
  splitContextMenu: {
    x: number
    y: number
    splitIndex: number
  } | null
  splitPoints: number[]
  onDeleteSplitPoint: (splitIndex: number) => void
  onClose: () => void
}

export function SplitContextMenu({
  splitContextMenu,
  splitPoints,
  onDeleteSplitPoint,
  onClose
}: SplitContextMenuProps) {
  if (!splitContextMenu) return null

  return (
    <div
      className="fixed bg-white shadow-lg rounded-lg border py-2 z-50"
      style={{
        left: splitContextMenu.x,
        top: splitContextMenu.y,
      }}
      onMouseLeave={onClose}
    >
      <div className="px-4 py-1 text-xs text-gray-500 border-b">
        Split Point {splitContextMenu.splitIndex + 1} -{" "}
        {splitPoints[splitContextMenu.splitIndex]?.toFixed(1)}s
      </div>
      <button
        className="w-full px-4 py-2 text-left hover:bg-gray-100 text-red-600"
        onClick={() => onDeleteSplitPoint(splitContextMenu.splitIndex)}
      >
        🗑️ Elimina Split Point
      </button>
    </div>
  )
}