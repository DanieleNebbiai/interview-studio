'use client'

import { Button } from "@/components/ui/button"
import { Play } from "lucide-react"
import Link from "next/link"

interface EmptyStateProps {
  hasSearchQuery: boolean
}

export function EmptyState({ hasSearchQuery }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      <div className="bg-gray-100 rounded-full w-24 h-24 flex items-center justify-center mx-auto mb-4">
        <Play className="h-12 w-12 text-gray-400" />
      </div>
      <h2 className="text-xl font-semibold text-gray-700 mb-2">Nessuna registrazione trovata</h2>
      <p className="text-gray-500 mb-6">
        {hasSearchQuery ? 'Prova con un nome room diverso' : 'Le tue registrazioni appariranno qui dopo le videoconferenze'}
      </p>
      <Link href="/">
        <Button>
          Crea Nuova Intervista
        </Button>
      </Link>
    </div>
  )
}