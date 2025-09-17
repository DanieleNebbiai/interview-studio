'use client'

import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { useRouter } from "next/navigation"

interface ErrorStateProps {
  error: string | null
}

export function ErrorState({ error }: ErrorStateProps) {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Errore</h1>
        <p className="text-gray-600 mb-6">{error || "Dati non trovati"}</p>
        <Button onClick={() => router.push("/recordings")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Torna alle Registrazioni
        </Button>
      </div>
    </div>
  )
}