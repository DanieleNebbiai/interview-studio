'use client'

import { Button } from "@/components/ui/button"
import { Video, LogOut } from "lucide-react"
import { User } from "@/types/auth"

interface HeaderProps {
  user: User | null
  onSignOut: () => void
  onShowAuthModal: () => void
}

export function Header({ user, onSignOut, onShowAuthModal }: HeaderProps) {
  return (
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
                  onClick={onSignOut}
                  variant="outline"
                  size="sm"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Esci</span>
                </Button>
              </>
            ) : (
              <Button
                onClick={onShowAuthModal}
              >
                Accedi / Registrati
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}