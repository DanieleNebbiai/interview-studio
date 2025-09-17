'use client'

import { Video } from "lucide-react"

export function HeroSection() {
  return (
    <div className="max-w-4xl mx-auto text-center">
      <div className="flex items-center justify-center mb-8">
        <div className="bg-blue-600 rounded-full p-4 mr-4">
          <Video className="h-12 w-12 text-white" />
        </div>
        <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Interview Studio
        </h1>
      </div>

      <p className="text-xl text-gray-600 mb-12 max-w-2xl mx-auto">
        Registra videoconferenze professionali con tracce separate per ogni partecipante.
        Monta video automaticamente con AI e ottieni risultati di qualità broadcast.
      </p>
    </div>
  )
}