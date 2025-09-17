"use client";

import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import {
  ArrowLeft,
  Crown,
  Shield,
  Circle,
  Users,
  PhoneOff,
  Link2,
  Check,
  Video,
  Square,
} from "lucide-react";
import { useState } from "react";
import Link from "next/link";

interface RoomPermissions {
  canRecord: boolean;
  role: "host" | "guest";
  isHost: boolean;
  roomExists: boolean;
  userId?: string;
  roomId?: string;
  hostId?: string;
}

interface RecordingInstance {
  instanceId: string;
  roomName: string;
  sessionId?: string;
  startTime: string;
  status: string;
}

interface RoomHeaderProps {
  roomId: string;
  permissions: RoomPermissions;
  isRecording: boolean;
  recordingInstances: RecordingInstance[];
  participantCount: number;
  onCopyRoomUrl: () => void;
  onToggleRecording: () => void;
  onLeaveCall: () => void;
}

export function RoomHeader({
  roomId,
  permissions,
  isRecording,
  recordingInstances,
  participantCount,
  onCopyRoomUrl,
  onToggleRecording,
  onLeaveCall,
}: RoomHeaderProps) {
  const [linkCopied, setLinkCopied] = useState(false);

  const handleCopyLink = () => {
    onCopyRoomUrl();
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const handleTitleClick = () => {
    handleCopyLink();
  };

  return (
    <div className="bg-card border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-6">
          <Link href="/">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Home
            </Button>
          </Link>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleTitleClick}
              className="text-foreground text-lg font-semibold hover:text-primary transition-colors cursor-pointer"
            >
              Interview Studio - Room: {roomId.slice(0, 8)}...
            </button>

            <Button
              onClick={handleCopyLink}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
            >
              {linkCopied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Link2 className="h-4 w-4" />
              )}
            </Button>

            {linkCopied && (
              <span className="text-sm text-green-500 font-medium">
                Link copiato!
              </span>
            )}
          </div>

          <div className="flex items-center space-x-4">
            {permissions.isHost ? (
              <div className="flex items-center text-yellow-500">
                <Crown className="h-4 w-4 mr-1" />
                <span className="text-sm font-medium">Host</span>
              </div>
            ) : (
              <div className="flex items-center text-blue-500">
                <Shield className="h-4 w-4 mr-1" />
                <span className="text-sm font-medium">Guest</span>
              </div>
            )}

            {isRecording && (
              <div className="flex items-center text-red-500 animate-pulse">
                <Circle className="h-4 w-4 mr-2 fill-current" />
                <span className="text-sm font-medium">
                  {recordingInstances.length} registrazion
                  {recordingInstances.length !== 1 ? "i" : "e"} separate attive
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {permissions.canRecord && (
            <Toggle
              pressed={isRecording}
              onPressedChange={onToggleRecording}
              variant={isRecording ? "destructive" : "outline"}
              size="sm"
              className={
                isRecording
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90 data-[state=on]:bg-destructive data-[state=on]:text-destructive-foreground"
                  : ""
              }
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
            </Toggle>
          )}

          <Button onClick={onLeaveCall} variant="destructive" size="sm">
            <PhoneOff className="h-4 w-4 mr-2" />
            Leave Call
          </Button>

          <div className="flex items-center text-muted-foreground">
            <Users className="h-4 w-4 mr-1" />
            <span className="text-sm">{participantCount}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
