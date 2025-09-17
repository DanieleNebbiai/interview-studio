'use client'

import { Button } from "@/components/ui/button"
import { Video, Plus } from "lucide-react"
import Link from "next/link"
import { User } from "@/types/auth"

interface Recording {
  id: string
  created_at: string
  duration: number
  file_size: number
  room: {
    name?: string
    daily_room_name: string
  }
  transcriptions?: Array<{
    word_timestamps?: {
      wordCount?: number
    }
  }>
}

interface RecentRecordingsProps {
  user: User | null
  recentRecordings: Recording[]
  loadingRecordings: boolean
  onCreateNewRoom: () => void
}

export function RecentRecordings({
  user,
  recentRecordings,
  loadingRecordings,
  onCreateNewRoom
}: RecentRecordingsProps) {
  if (!user) return null

  return (
    <div className="mt-16 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Le Tue Registrazioni Recenti</h2>
        <Link href="/recordings">
          <Button variant="outline" size="sm">
            Vedi Tutte
          </Button>
        </Link>
      </div>

      {loadingRecordings ? (
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="text-gray-600 mt-2">Caricamento registrazioni...</p>
        </div>
      ) : recentRecordings.length > 0 ? (
        <div className="grid gap-4">
          {recentRecordings.map((recording) => (
            <div key={recording.id} className="bg-white rounded-lg shadow-lg p-4 hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="bg-blue-100 rounded-full p-2">
                    <Video className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">
                      {recording.room?.name || recording.room?.daily_room_name}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {new Date(recording.created_at).toLocaleDateString('it-IT')} •
                      {Math.round(recording.duration / 60)} min •
                      {Math.round(recording.file_size / (1024 * 1024))} MB
                    </p>
                    {recording.transcriptions && recording.transcriptions.length > 0 && (
                      <p className="text-xs text-green-600 mt-1">
                        ✓ Trascrizione disponibile ({recording.transcriptions[0].word_timestamps?.wordCount || 0} parole)
                      </p>
                    )}
                  </div>
                </div>
                <Link href="/recordings">
                  <Button size="sm" variant="outline">
                    Visualizza
                  </Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-lg p-8 text-center">
          <Video className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Nessuna Registrazione</h3>
          <p className="text-gray-600 mb-4">Crea la tua prima room per iniziare a registrare!</p>
          <Button onClick={onCreateNewRoom}>
            <Plus className="h-4 w-4 mr-2" />
            Crea Prima Room
          </Button>
        </div>
      )}
    </div>
  )
}