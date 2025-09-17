'use client'

import { Button } from "@/components/ui/button"
import { Home, CheckCircle } from "lucide-react"

interface ProcessingActionsProps {
  isCompleted: boolean
  onGoHome: () => void
  onGoToEditor: () => void
}

export function ProcessingActions({
  isCompleted,
  onGoHome,
  onGoToEditor
}: ProcessingActionsProps) {
  return (
    <div className="flex space-x-4">
      <Button onClick={onGoHome} variant="outline" className="flex-1">
        <Home className="h-4 w-4 mr-2" />
        Torna alla Home
      </Button>

      {isCompleted && (
        <Button
          onClick={onGoToEditor}
          className="flex-1"
        >
          <CheckCircle className="h-4 w-4 mr-2" />
          Vai all&apos;Editor
        </Button>
      )}
    </div>
  )
}