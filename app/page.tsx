'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import AuthModal from '@/components/AuthModal'
import { Header } from '@/components/home/Header'
import { HeroSection } from '@/components/home/HeroSection'
import { ViewRecordingsButton } from '@/components/home/ViewRecordingsButton'
import { ActionCards } from '@/components/home/ActionCards'
import { Features } from '@/components/home/Features'
import { RecentRecordings } from '@/components/home/RecentRecordings'
import { LoadingSpinner } from '@/components/home/LoadingSpinner'

export default function Home() {
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
    return <LoadingSpinner />
  }

  const joinRoom = (roomId: string) => {
    if (roomId.trim()) {
      router.push(`/room/${roomId}`)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <Header
        user={user}
        onSignOut={handleSignOut}
        onShowAuthModal={() => setShowAuthModal(true)}
      />

      <div className="container mx-auto px-4 py-16">
        <HeroSection />
        <ViewRecordingsButton />
        <ActionCards
          user={user}
          onCreateNewRoom={createNewRoom}
          onJoinRoom={joinRoom}
        />
        <Features />
        <RecentRecordings
          user={user}
          recentRecordings={recentRecordings}
          loadingRecordings={loadingRecordings}
          onCreateNewRoom={createNewRoom}
        />
      </div>

      <AuthModal 
        isOpen={showAuthModal} 
        onClose={() => setShowAuthModal(false)} 
      />
    </div>
  )
}
