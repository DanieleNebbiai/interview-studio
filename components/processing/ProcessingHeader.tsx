'use client'

interface ProcessingHeaderProps {
  roomId: string
}

export function ProcessingHeader({ roomId }: ProcessingHeaderProps) {
  return (
    <div className="text-center mb-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-4">
        Processing Registrazioni
      </h1>
      <p className="text-gray-600">
        Room: <span className="font-mono font-medium">{roomId}</span>
      </p>
    </div>
  )
}