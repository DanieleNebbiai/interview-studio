'use client'

import { AlertCircle } from "lucide-react"

interface ProcessingErrorProps {
  error: string
}

export function ProcessingError({ error }: ProcessingErrorProps) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
      <div className="flex items-center space-x-2">
        <AlertCircle className="h-5 w-5 text-red-600" />
        <span className="text-red-800 font-medium">Errore</span>
      </div>
      <p className="text-red-700 mt-1">{error}</p>
    </div>
  )
}