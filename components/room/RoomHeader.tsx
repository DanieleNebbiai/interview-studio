'use client'

import { Button } from "@/components/ui/button"
import { ArrowLeft, Crown, Shield, Circle, Users, Video, Square, PhoneOff } from "lucide-react"
import Link from "next/link"

interface RoomPermissions {
  canRecord: boolean
  role: "host" | "guest"
  isHost: boolean
  roomExists: boolean
  userId?: string
  roomId?: string
  hostId?: string
}

interface RecordingInstance {
  instanceId: string
  roomName: string
  sessionId?: string
  startTime: string
  status: string
}

interface RoomHeaderProps {
  roomId: string
  permissions: RoomPermissions
  isRecording: boolean
  recordingInstances: RecordingInstance[]
  participantCount: number
  onCopyRoomUrl: () => void
  onToggleRecording: () => void
  onLeaveCall: () => void
}

export function RoomHeader({
  roomId,
  permissions,
  isRecording,
  recordingInstances,
  participantCount,
  onCopyRoomUrl,
  onToggleRecording,
  onLeaveCall
}: RoomHeaderProps) {
  return (
    <div className="bg-gray-800 border-b border-gray-700 px-4 py-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/">
            <Button
              variant="outline"
              size="sm"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Home
            </Button>
          </Link>
          <h1 className="text-white text-lg font-semibold">
            Interview Studio - Room: {roomId.slice(0, 8)}...
          </h1>

          <div className="flex items-center space-x-2">
            {permissions.isHost ? (
              <div className="flex items-center text-yellow-400">
                <Crown className="h-4 w-4 mr-1" />
                <span className="text-sm font-medium">Host</span>
              </div>
            ) : (
              <div className="flex items-center text-blue-400">
                <Shield className="h-4 w-4 mr-1" />
                <span className="text-sm font-medium">Guest</span>
              </div>
            )}

            {isRecording && (
              <div className="flex items-center text-red-400 animate-pulse ml-4">
                <Circle className="h-4 w-4 mr-2 fill-current" />
                <span className="text-sm font-medium">
                  {recordingInstances.length} registrazion
                  {recordingInstances.length !== 1 ? "i" : "e"} separate
                  attive
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {permissions.canRecord && (
            <Button
              onClick={onToggleRecording}
              variant={isRecording ? "destructive" : "default"}
              size="sm"
              className={isRecording ? "animate-pulse" : ""}
            >
              {isRecording ? (
                <>
                  <Square className="h-4 w-4 mr-2" />
                  Stop Recording
                </>
              ) : (
                <>
                  <Video className="h-4 w-4 mr-2" />
                  Start Recording
                </>
              )}
            </Button>
          )}
          <Button
            onClick={onCopyRoomUrl}
            variant="outline"
            size="sm"
          >
            Condividi Room
          </Button>
          <Button
            onClick={onLeaveCall}
            variant="destructive"
            size="sm"
          >
            <PhoneOff className="h-4 w-4 mr-2" />
            Leave Call
          </Button>
          <div className="flex items-center text-gray-400">
            <Users className="h-4 w-4 mr-1" />
            <span className="text-sm">{participantCount}</span>
          </div>
        </div>
      </div>
    </div>
  )
}