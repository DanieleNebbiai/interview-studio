'use client'

import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import Link from "next/link"

interface ErrorStateProps {
  error: string
}

export function ErrorState({ error }: ErrorStateProps) {
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <div className="text-center max-w-md">
        <div className="bg-red-600 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
          <span className="text-white text-2xl">⚠</span>
        </div>
        <h2 className="text-white text-2xl font-semibold mb-4">
          Errore nella creazione della room
        </h2>
        <p className="text-gray-300 mb-6">{error}</p>
        <div className="space-y-4">
          <p className="text-sm text-gray-400">
            Per utilizzare Interview Studio hai bisogno di una API key di
            Daily.co:
          </p>
          <ol className="text-sm text-gray-400 text-left list-decimal list-inside space-y-2">
            <li>
              Registrati su{" "}
              <a
                href="https://dashboard.daily.co/"
                className="text-blue-400 underline"
                target="_blank"
              >
                dashboard.daily.co
              </a>
            </li>
            <li>Vai nella sezione Developers</li>
            <li>Copia la tua API key</li>
            <li>Aggiungila al file .env.local come DAILY_API_KEY</li>
          </ol>
          <Link href="/">
            <Button>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Torna alla Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}