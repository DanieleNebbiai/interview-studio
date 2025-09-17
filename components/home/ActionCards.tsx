'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Plus, Users, ArrowRight } from "lucide-react"
import { User } from "@/types/auth"

interface ActionCardsProps {
  user: User | null
  onCreateNewRoom: () => void
  onJoinRoom: (roomId: string) => void
}

export function ActionCards({ user, onCreateNewRoom, onJoinRoom }: ActionCardsProps) {
  const [roomId, setRoomId] = useState('')

  const handleJoinRoom = () => {
    if (roomId.trim()) {
      onJoinRoom(roomId.trim())
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleJoinRoom()
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
      {/* Create Room Card */}
      <Card className="border border-gray-200 shadow-lg">
        <CardHeader className="text-center">
          <div className="bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <Plus className="h-8 w-8 text-green-600" />
          </div>
          <CardTitle className="text-2xl font-semibold">Crea Nuova Intervista</CardTitle>
          <CardDescription className="text-gray-600">
            {user
              ? 'Avvia una nuova sessione di registrazione con room dedicata'
              : 'Accedi per creare room e gestire le registrazioni'
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={onCreateNewRoom}
            className="w-full"
          >
            <Plus className="h-5 w-5 mr-2" />
            Crea Room
          </Button>
        </CardContent>
      </Card>

      {/* Join Room Card */}
      <Card className="border border-gray-200 shadow-lg">
        <CardHeader className="text-center">
          <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
            <Users className="h-8 w-8 text-blue-600" />
          </div>
          <CardTitle className="text-2xl font-semibold">Partecipa alla Room</CardTitle>
          <CardDescription className="text-gray-600">
            Inserisci il codice room per unirti a una sessione esistente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="text"
            placeholder="Inserisci Room ID"
            value={roomId}
            onChange={(e) => setRoomId(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full"
          />
          <Button
            onClick={handleJoinRoom}
            disabled={!roomId.trim()}
            className="w-full"
          >
            Unisciti <ArrowRight className="h-5 w-5 ml-2" />
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}