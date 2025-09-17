'use client'

import { Progress } from "@/components/ui/progress"

interface ProcessingProgressProps {
  currentStep: number
  totalSteps: number
  isProcessing: boolean
}

export function ProcessingProgress({
  currentStep,
  totalSteps,
  isProcessing
}: ProcessingProgressProps) {
  if (!isProcessing) return null

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">
          Progresso
        </span>
        <span className="text-sm text-gray-500">
          {currentStep + 1} / {totalSteps}
        </span>
      </div>
      <Progress
        value={((currentStep + 1) / totalSteps) * 100}
        className="h-2"
      />
    </div>
  )
}