"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Play, Eye, MessageSquare, Smile } from "lucide-react";
import { useRouter } from "next/navigation";

interface Recording {
  id: string;
  room_id: string;
  daily_recording_id: string;
  recording_url: string;
  duration: number;
  file_size: number;
  status: string;
  created_at: string;
  room: {
    name: string;
    daily_room_name: string;
  };
  transcriptions: {
    id: string;
    transcript_text: string;
    word_timestamps: {
      wordCount: number;
    };
    language: string;
    confidence: number;
  }[];
}

interface RecordingCardProps {
  recording: Recording;
}

export function RecordingCard({ recording }: RecordingCardProps) {
  const router = useRouter();

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInDays = Math.floor(
      (now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (diffInDays === 0) return "Today";
    if (diffInDays === 1) return "Yesterday";
    if (diffInDays < 7) return `${diffInDays} days ago`;
    return date.toLocaleDateString("it-IT", {
      month: "short",
      day: "numeric",
    });
  };

  const handleCardClick = () => {
    router.push(`/edit/${recording.room_id}`);
  };

  const roomName =
    recording.room?.name || recording.room?.daily_room_name || "Recording";

  return (
    <Card
      className="overflow-hidden cursor-pointer hover:bg-muted bg-accent hover:shadow-lg transition-shadow group py-0"
      onClick={handleCardClick}
    >
      {/* Video Thumbnail */}
      <div className="relative aspect-video bg-gradient-to-br from-blue-100 to-purple-100">
        <div className="w-full h-full flex items-center justify-center">
          <Play className="h-12 w-12 text-blue-600 opacity-80 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Duration Badge */}
        <div className="absolute bottom-2 right-2 bg-black/70 text-white px-2 py-1 rounded text-xs font-medium">
          {formatDuration(recording.duration)}
        </div>

        {/* Hover Actions */}
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex space-x-2">
          <div className="bg-white/90 backdrop-blur-sm rounded-full p-1.5 hover:bg-white transition-colors">
            <Eye className="h-3 w-3 text-gray-700" />
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-full p-1.5 hover:bg-white transition-colors">
            <MessageSquare className="h-3 w-3 text-gray-700" />
          </div>
          <div className="bg-white/90 backdrop-blur-sm rounded-full p-1.5 hover:bg-white transition-colors">
            <Smile className="h-3 w-3 text-gray-700" />
          </div>
        </div>
      </div>

      <CardContent className="p-4">
        {/* Title */}
        <h3 className="font-semibold text-base text-foreground mb-3 line-clamp-2 leading-tight">
          {roomName}
        </h3>
      </CardContent>
    </Card>
  );
}
