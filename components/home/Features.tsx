'use client'

import { Video, Users, Plus } from "lucide-react"

export function Features() {
  return (
    <div className="mt-16 grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
      <div className="text-center">
        <div className="bg-purple-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
          <Video className="h-6 w-6 text-purple-600" />
        </div>
        <h3 className="font-semibold mb-2">Registrazione Separata</h3>
        <p className="text-sm text-gray-600">Ogni partecipante viene registrato su traccia individuale</p>
      </div>

      <div className="text-center">
        <div className="bg-orange-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
          <Users className="h-6 w-6 text-orange-600" />
        </div>
        <h3 className="font-semibold mb-2">Multi-Partecipante</h3>
        <p className="text-sm text-gray-600">Supporta interviste con più persone simultaneamente</p>
      </div>

      <div className="text-center">
        <div className="bg-pink-100 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-4">
          <Plus className="h-6 w-6 text-pink-600" />
        </div>
        <h3 className="font-semibold mb-2">Montaggio AI</h3>
        <p className="text-sm text-gray-600">Editing automatico intelligente delle registrazioni</p>
      </div>
    </div>
  )
}