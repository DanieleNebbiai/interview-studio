"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Header } from "@/components/home/Header";
import { SearchBar } from "@/components/recordings/SearchBar";
import { RecordingCard } from "@/components/recordings/RecordingCard";
import { EmptyState } from "@/components/recordings/EmptyState";
import { LoadingSpinner } from "@/components/recordings/LoadingSpinner";
import { AuthRequired } from "@/components/recordings/AuthRequired";
import AuthModal from "@/components/AuthModal";

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
      words: Array<{
        word: string;
        start: number;
        end: number;
        confidence?: number;
      }>;
      segments: Array<{
        id: number;
        start: number;
        end: number;
        text: string;
        words: Array<{
          word: string;
          start: number;
          end: number;
          confidence?: number;
        }>;
      }>;
      wordCount: number;
      totalDuration: number;
    };
    language: string;
    confidence: number;
  }[];
}

interface AIEditJob {
  jobId: string;
  status: "processing" | "completed" | "failed";
  progress: number;
  editedVideoUrl?: string;
  thumbnailUrl?: string;
}

export default function RecordingsPage() {
  const { user, loading: authLoading, signOut } = useAuth();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(false);
  const [roomSearch, setRoomSearch] = useState("");
  const [aiJobs, setAiJobs] = useState<{ [key: string]: AIEditJob }>({});
  const [error, setError] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!authLoading && user) {
      fetchRecordings();
    }
  }, [authLoading, user]);

  const fetchRecordings = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch("/api/recordings/list", {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch recordings");
      }

      const data = await response.json();
      setRecordings(data.recordings || []);
    } catch (error) {
      console.error("Error fetching recordings:", error);
      setError("Errore nel caricamento delle registrazioni");
    } finally {
      setLoading(false);
    }
  };

  const searchRecordings = async (query: string) => {
    setRoomSearch(query);

    if (!query.trim()) {
      fetchRecordings();
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/recordings/search?q=${encodeURIComponent(query)}`,
        {
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Search failed");
      }

      const data = await response.json();
      setRecordings(data.recordings || []);
    } catch (error) {
      console.error("Error searching recordings:", error);
      setError("Errore nella ricerca");
    } finally {
      setLoading(false);
    }
  };

  const startAIEdit = async (recordingId: string) => {
    try {
      const response = await fetch("/api/ai-edit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recordingIds: [recordingId],
          editingOptions: {
            style: "professional",
            removeFillers: true,
            addTransitions: true,
            enhanceAudio: true,
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        setAiJobs((prev) => ({
          ...prev,
          [recordingId]: {
            jobId: data.job.jobId,
            status: "processing",
            progress: 0,
          },
        }));

        // Simula progress updates
        const interval = setInterval(() => {
          setAiJobs((prev) => {
            const job = prev[recordingId];
            if (job && job.progress < 100) {
              return {
                ...prev,
                [recordingId]: {
                  ...job,
                  progress: Math.min(job.progress + Math.random() * 20, 100),
                  status: job.progress >= 99 ? "completed" : "processing",
                  editedVideoUrl:
                    job.progress >= 99 ? data.job.editedVideoUrl : undefined,
                  thumbnailUrl:
                    job.progress >= 99 ? data.job.thumbnailUrl : undefined,
                },
              };
            }
            if (job && job.progress >= 100) {
              clearInterval(interval);
            }
            return prev;
          });
        }, 1000);
      }
    } catch (error) {
      console.error("Error starting AI edit:", error);
    }
  };

  const createNewRoom = async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    try {
      const newRoomId = `room-${Date.now().toString().slice(-6)}-${Math.random()
        .toString(36)
        .substring(2, 5)}`;

      const response = await fetch("/api/rooms/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          roomName: newRoomId,
        }),
      });

      const data = await response.json();

      if (data.success) {
        router.push(`/room/${data.room.dailyRoomName}`);
      } else {
        router.push(`/room/${newRoomId}`);
      }
    } catch (error) {
      console.error("Error creating room:", error);
      const newRoomId = `room-${Date.now().toString().slice(-6)}-${Math.random()
        .toString(36)
        .substring(2, 5)}`;
      router.push(`/room/${newRoomId}`);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const filteredRecordings = recordings.filter((recording) => {
    const roomName =
      recording.room?.name || recording.room?.daily_room_name || "";
    return roomName.toLowerCase().includes(roomSearch.toLowerCase());
  });

  // Loading state
  if (authLoading || loading) {
    return <LoadingSpinner />;
  }

  // Authentication required
  if (!user) {
    return <AuthRequired />;
  }

  return (
    <div className="min-h-screen">
      <Header
        user={user}
        onSignOut={handleSignOut}
        onShowAuthModal={() => setShowAuthModal(true)}
        onCreateNewRoom={createNewRoom}
      />

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-center">Le Tue Registrazioni</h1>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <SearchBar onSearch={searchRecordings} loading={loading} />

          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredRecordings.map((recording) => (
              <RecordingCard
                key={recording.id}
                recording={recording}
              />
            ))}
          </div>

          {filteredRecordings.length === 0 && (
            <EmptyState hasSearchQuery={!!roomSearch} />
          )}
        </div>
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
      />
    </div>
  );
}
