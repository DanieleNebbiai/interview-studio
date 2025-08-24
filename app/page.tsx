'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Video, Users, Plus, ArrowRight, LogOut } from 'lucide-react'
import { v4 as uuidv4 } from 'uuid'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import AuthModal from '@/components/AuthModal'

export default function Home() {
  const [roomId, setRoomId] = useState('')
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [recentRecordings, setRecentRecordings] = useState([])
  const [loadingRecordings, setLoadingRecordings] = useState(false)
  const router = useRouter()
  const { user, loading, signOut } = useAuth()

  useEffect(() => {
    if (user && !loading) {
      fetchRecentRecordings()
    }
  }, [user, loading])

  const fetchRecentRecordings = async () => {
    try {
      setLoadingRecordings(true)
      const response = await fetch('/api/recordings/list?limit=3', {
        credentials: 'include'
      })
      
      if (response.ok) {
        const data = await response.json()
        setRecentRecordings(data.recordings || [])
      }
    } catch (error) {
      console.error('Error fetching recent recordings:', error)
    } finally {
      setLoadingRecordings(false)
    }
  }

  const createNewRoom = async () => {
    if (!user) {
      setShowAuthModal(true)
      return
    }

    // Small delay to ensure auth cookies are set
    await new Promise(resolve => setTimeout(resolve, 100))
    
    try {
      // Generiamo un room ID più semplice e condivisibile
      const newRoomId = `room-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5)}`
      
      const response = await fetch('/api/rooms/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include', // Include cookies for authentication
        body: JSON.stringify({
          roomName: newRoomId
        })
      })

      const data = await response.json()

      if (data.success) {
        router.push(`/room/${data.room.dailyRoomName}`)
      } else {
        console.error('Failed to create room:', data.error)
        // Fallback to old method
        router.push(`/room/${newRoomId}`)
      }
    } catch (error) {
      console.error('Error creating room:', error)
      // Fallback to old method
      const newRoomId = `room-${Date.now().toString().slice(-6)}-${Math.random().toString(36).substring(2, 5)}`
      router.push(`/room/${newRoomId}`)
    }
  }

  const handleSignOut = async () => {
    await signOut()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  const joinRoom = () => {
    if (roomId.trim()) {
      router.push(`/room/${roomId}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header with Authentication */}
      <div className="border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <div className="bg-blue-600 rounded-lg p-2">
                <Video className="h-6 w-6 text-white" />
              </div>
              <h1 className="text-xl font-bold text-gray-900">Interview Studio</h1>
            </div>
            
            <div className="flex items-center space-x-4">
              {user ? (
                <>
                  <span className="text-gray-600">Ciao, {user.name || user.email}</span>
                  <Button
                    onClick={handleSignOut}
                    variant="outline"
                    size="sm"
                    className="flex items-center space-x-2"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Esci</span>
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => setShowAuthModal(true)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Accedi / Registrati
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-16">
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

          <div className="mb-8 text-center">
            <Link href="/recordings">
              <Button variant="outline" className="bg-white hover:bg-gray-50 border-gray-300">
                <Video className="h-4 w-4 mr-2" />
                Visualizza Registrazioni
              </Button>
            </Link>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200">
              <div className="bg-green-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
                <Plus className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-semibold mb-4">Crea Nuova Intervista</h2>
              <p className="text-gray-600 mb-6">
                {user 
                  ? 'Avvia una nuova sessione di registrazione con room dedicata'
                  : 'Accedi per creare room e gestire le registrazioni'
                }
              </p>
              <Button 
                onClick={createNewRoom}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-3 px-6 rounded-lg transition-colors"
              >
                <Plus className="h-5 w-5 mr-2" />
                Crea Room
              </Button>
            </div>

            <div className="bg-white p-8 rounded-2xl shadow-lg border border-gray-200">
              <div className="bg-blue-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <h2 className="text-2xl font-semibold mb-4">Partecipa alla Room</h2>
              <p className="text-gray-600 mb-6">
                Inserisci il codice room per unirti a una sessione esistente
              </p>
              <div className="space-y-4">
                <input
                  type="text"
                  placeholder="Inserisci Room ID"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                />
                <Button 
                  onClick={joinRoom}
                  disabled={!roomId.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-6 rounded-lg transition-colors"
                >
                  Unisciti <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
              </div>
            </div>
          </div>

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

          {/* Recent Recordings Section - Only show if user is logged in */}
          {user && (
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
                  {recentRecordings.map((recording: any) => (
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
                            {recording.transcriptions?.length > 0 && (
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
                  <Button onClick={createNewRoom} className="bg-blue-600 hover:bg-blue-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Crea Prima Room
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  )
}
