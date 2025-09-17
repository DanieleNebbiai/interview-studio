'use client'

import { Button } from "@/components/ui/button"
import Link from "next/link"

export function AuthRequired() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Accesso Richiesto</h1>
        <p className="text-gray-600 mb-6">Devi essere autenticato per visualizzare le registrazioni</p>
        <Link href="/">
          <Button>
            Torna alla Home
          </Button>
        </Link>
      </div>
    </div>
  )
}