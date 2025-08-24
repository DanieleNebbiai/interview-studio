"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import DailyIframe, { DailyCall } from "@daily-co/daily-js";
import { Button } from "@/components/ui/button";
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Phone,
  Circle,
  Users,
  ArrowLeft,
  Square,
  Crown,
  Shield,
} from "lucide-react";
import Link from "next/link";

interface RecordingInstance {
  instanceId: string;
  roomName: string;
  sessionId?: string;
  startTime: string;
  status: string;
}

interface DailyJoinedMeetingEvent {
  participants?: {
    local?: {
      session_id?: string;
    };
  };
}

interface RoomPermissions {
  canRecord: boolean;
  role: "host" | "guest";
  isHost: boolean;
  roomExists: boolean;
  userId?: string;
  roomId?: string;
  hostId?: string;
}

export default function RoomPage() {
  const params = useParams();
  const roomId = params.roomId as string;
  const callFrameRef = useRef<DailyCall | null>(null);
  const initRef = useRef<boolean>(false);
  const [isAudioOn, setIsAudioOn] = useState(true);
  const [isVideoOn, setIsVideoOn] = useState(true);
  const [isRecording, setIsRecording] = useState(false);
  const [participants, setParticipants] = useState<unknown[]>([]);
  const [isCreatingRoom, setIsCreatingRoom] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [recordingInstances, setRecordingInstances] = useState<
    RecordingInstance[]
  >([]);
  const [permissions, setPermissions] = useState<RoomPermissions>({
    canRecord: false,
    role: "guest",
    isHost: false,
    roomExists: false,
  });

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const checkPermissions = async () => {
      try {
        const response = await fetch(`/api/rooms/${roomId}/permissions`, {
          credentials: "include", // Include cookies for authentication
        });
        const data = await response.json();

        if (data.success) {
          setPermissions(data.permissions);
          console.log("Room permissions:", data.permissions);
        } else {
          console.error("Failed to get permissions:", data.error);
        }
      } catch (error) {
        console.error("Error checking permissions:", error);
      }
    };

    const initializeDailyCall = (url: string) => {
      // Ensure any existing instance is properly destroyed
      if (callFrameRef.current) {
        try {
          callFrameRef.current.destroy();
        } catch (error) {
          console.warn("Error destroying previous Daily instance:", error);
        }
        callFrameRef.current = null;
      }

      // Create new instance only if we don't have one
      try {
        callFrameRef.current = DailyIframe.createFrame({
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "none",
            borderRadius: "12px",
          },
          showLeaveButton: false,
          showFullscreenButton: false,
        });

        // Event listeners
        callFrameRef.current
          .on("joined-meeting", (event: DailyJoinedMeetingEvent) => {
            console.log("Joined meeting", event);
            // Ottieni il session ID del partecipante locale
            const sessionId = event.participants?.local?.session_id;
            if (sessionId) {
              setCurrentSessionId(sessionId);
              console.log("Local session ID:", sessionId);
            }
            updateParticipants();
          })
          .on("participant-joined", (event: unknown) => {
            console.log("Participant joined", event);
            updateParticipants();
          })
          .on("participant-left", (event: unknown) => {
            console.log("Participant left", event);
            updateParticipants();
            // Note: Individual participant recordings might auto-stop when they leave
            // This is expected behavior for single-participant layout recordings
          })
          .on("recording-started", () => {
            console.log(
              "Recording started via Daily (event only, not updating UI state)"
            );
            // Don't update UI state here - we manage it manually
          })
          .on("recording-stopped", () => {
            console.log(
              "Recording stopped via Daily (event only, not updating UI state)"
            );
            // Don't update UI state here - we manage it manually
            // This event might fire automatically when participants leave
          });

        // Join the meeting
        callFrameRef.current.join({ url });
      } catch (error) {
        console.error("Error creating Daily instance:", error);
        setIsCreatingRoom(false);
      }
    };

    const createAndJoinRoom = async () => {
      try {
        setIsCreatingRoom(true);

        // Check permissions first
        await checkPermissions();

        // Crea la room su Daily.co
        const response = await fetch("/api/create-room", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ roomName: roomId }),
        });

        const data = await response.json();

        if (data.success) {
          initializeDailyCall(data.roomUrl);
        } else {
          console.error("Failed to create room:", data.error);
          setError(data.error || "Failed to create room");
        }
      } catch (error) {
        console.error("Error creating room:", error);
        setError("Network error while creating room");
      } finally {
        setIsCreatingRoom(false);
      }
    };

    createAndJoinRoom();

    return () => {
      if (callFrameRef.current) {
        try {
          // Then cleanup the call
          callFrameRef.current
            .leave()
            .catch((error) =>
              console.warn("Error leaving call on unmount:", error)
            );

          callFrameRef.current.destroy();
          callFrameRef.current = null;
        } catch (error) {
          console.warn("Error destroying Daily instance on unmount:", error);
        }
      }
    };
  }, [roomId]);

  const updateParticipants = () => {
    if (callFrameRef.current) {
      const participants = callFrameRef.current.participants();
      setParticipants(Object.values(participants));
    }
  };

  const startRecordingForAllParticipants = async () => {
    try {
      console.log("Starting synchronized recordings for all participants...");

      if (!callFrameRef.current) {
        console.error("Daily call not initialized");
        return;
      }

      // Get all participants from the call
      const allParticipants = callFrameRef.current.participants();
      console.log("All participants data:", allParticipants);

      // Extract session IDs from participant data
      const participantIds: string[] = [];

      // Add local participant session ID if available
      if (currentSessionId) {
        participantIds.push(currentSessionId);
        console.log("Added local session ID:", currentSessionId);
      }

      // Add remote participants session IDs
      Object.entries(allParticipants).forEach(([sessionId]) => {
        // Skip 'local' as it's not a valid session ID, we already have the actual local session ID
        if (!participantIds.includes(sessionId) && sessionId !== "local") {
          participantIds.push(sessionId);
          console.log("Added remote session ID:", sessionId);
        }
      });

      console.log("Final participant IDs for recording:", participantIds);

      if (participantIds.length === 0) {
        console.error("No participants found for recording");
        return;
      }

      try {
        console.log("Starting synchronized recording with 2 second delay...");
        
        const response = await fetch("/api/recordings/start-synchronized", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomName: roomId,
            participantSessionIds: participantIds,
            delayMs: 5000 // 5 second delay for better sync
          }),
        });

        const data = await response.json();

        if (data.success) {
          console.log(`Successfully started ${data.successCount} synchronized recordings`);
          console.log(`Timing spread: ${data.timingSpreadMs}ms`);
          
          // Convert successful results to RecordingInstance format
          const successfulRecordings: RecordingInstance[] = data.results
            .filter((result: { success: boolean }) => result.success)
            .map((result: { instanceId: string; sessionId: string; recording?: { status?: string } }) => ({
              instanceId: result.instanceId,
              roomName: roomId,
              sessionId: result.sessionId,
              startTime: data.syncStartTime,
              status: result.recording?.status || "active",
            }));

          setRecordingInstances(successfulRecordings);
          setIsRecording(true);

          console.log(`Started ${successfulRecordings.length} synchronized recordings`);
        } else {
          console.error("Synchronized recording failed:", data.error);
          
          // Fallback to default room recording
          console.log("Trying fallback default room recording...");
          const fallbackResponse = await fetch("/api/recordings/start", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              roomName: roomId,
              layout: "default",
            }),
          });

          const fallbackData = await fallbackResponse.json();

          if (fallbackData.success) {
            console.log("Default room recording started:", fallbackData.recording);
            const defaultRecording: RecordingInstance = {
              instanceId: fallbackData.recording.recordingId || fallbackData.recording.instanceId,
              roomName: roomId,
              sessionId: undefined,
              startTime: new Date().toISOString(),
              status: fallbackData.recording.status || "active",
            };
            setRecordingInstances([defaultRecording]);
            setIsRecording(true);
          } else {
            console.error("Fallback recording also failed:", fallbackData.error);
          }
        }
      } catch (error) {
        console.error("Error with synchronized recording:", error);
      }
    } catch (error) {
      console.error("Error starting recordings:", error);
    }
  };

  const toggleAudio = () => {
    if (callFrameRef.current) {
      callFrameRef.current.setLocalAudio(!isAudioOn);
      setIsAudioOn(!isAudioOn);
    }
  };

  const toggleVideo = () => {
    if (callFrameRef.current) {
      callFrameRef.current.setLocalVideo(!isVideoOn);
      setIsVideoOn(!isVideoOn);
    }
  };

  const stopAllRecordings = async () => {
    try {
      console.log("Stopping all recordings...");
      console.log("Recording instances to stop:", recordingInstances);

      // First, try to stop individual recordings
      const stopPromises = recordingInstances.map(async (recording) => {
        try {
          console.log(
            `Trying to stop recording with instanceId: ${recording.instanceId}`
          );

          const response = await fetch("/api/recordings/stop", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              roomName: roomId,
              instanceId: recording.instanceId,
            }),
          });

          const data = await response.json();

          if (data.success) {
            console.log(
              `Recording stopped for instance ${recording.instanceId}`
            );
            return true;
          } else {
            // Check if the error is because recording already stopped
            const errorMsg = data.error?.toLowerCase() || "";
            if (
              errorMsg.includes("does not have an active recording") ||
              errorMsg.includes("recording not found") ||
              errorMsg.includes("already stopped")
            ) {
              console.log(
                `Recording for instance ${recording.instanceId} was already stopped (auto-stopped)`
              );
              return true; // Consider this a success since the recording is stopped
            } else {
              console.error(
                `Failed to stop recording for instance ${recording.instanceId}:`,
                data.error
              );
              return false;
            }
          }
        } catch (error) {
          console.error(
            `Error stopping recording for instance ${recording.instanceId}:`,
            error
          );
          return false;
        }
      });

      const stopResults = await Promise.all(stopPromises);
      const successfulStops = stopResults.filter(Boolean);

      // If no individual stops succeeded, try stopping all recordings for the room
      if (successfulStops.length === 0 && recordingInstances.length > 0) {
        console.log(
          "Individual recording stops failed, trying to stop all recordings for room..."
        );

        try {
          const response = await fetch("/api/recordings/stop", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              roomName: roomId,
              // Don't send instanceId to stop all recordings
            }),
          });

          const data = await response.json();

          if (data.success) {
            console.log("All recordings stopped successfully (fallback)");
          } else {
            console.error("Failed to stop all recordings:", data.error);
          }
        } catch (error) {
          console.error("Error stopping all recordings:", error);
        }
      }

      setRecordingInstances([]);
      setIsRecording(false);

      console.log(
        `Successfully stopped ${successfulStops.length} out of ${recordingInstances.length} recordings`
      );
    } catch (error) {
      console.error("Error stopping recordings:", error);
    }
  };

  const toggleRecording = async () => {
    try {
      if (isRecording) {
        await stopAllRecordings();
      } else {
        await startRecordingForAllParticipants();
      }
    } catch (error) {
      console.error("Error toggling recording:", error);
    }
  };

  const leaveCall = async () => {
    // Save recording state BEFORE cleanup (since stopAllRecordings clears recordingInstances)
    const hadRecordings = recordingInstances.length > 0;
    const recordingsSnapshot = [...recordingInstances]; // Create a copy

    try {
      if (callFrameRef.current) {
        // First stop any active recordings gracefully
        if (isRecording && recordingInstances.length > 0) {
          console.log("Stopping recordings before leaving...");
          await stopAllRecordings();
        }

        // Add a small delay to allow recording stop to complete
        await new Promise((resolve) => setTimeout(resolve, 500));

        // Then leave and destroy the call
        try {
          await callFrameRef.current.leave();
        } catch (leaveError) {
          console.warn(
            "Error leaving call (expected if already disconnected):",
            leaveError
          );
        }

        try {
          callFrameRef.current.destroy();
        } catch (destroyError) {
          console.warn("Error destroying call frame:", destroyError);
        }

        callFrameRef.current = null;
      }
    } catch (error) {
      console.error("Error during call cleanup:", error);
    }

    // If host is leaving, always redirect to processing page (it will handle empty recordings)
    if (permissions.isHost) {
      console.log("Host leaving - redirecting to processing page");
      console.log("Had recordings before cleanup:", hadRecordings);
      console.log("Recordings snapshot:", recordingsSnapshot);
      
      const recordingData = {
        roomId: roomId,
        roomName: permissions.roomId,
        recordings: [], // Not needed anymore - API will find by room
        hadRecordingsSession: hadRecordings,
      };

      console.log("Saving processing data:", recordingData);
      // Store recording data in sessionStorage for processing page
      sessionStorage.setItem("processingData", JSON.stringify(recordingData));
      window.location.href = `/processing/${roomId}`;
    } else {
      console.log("Guest leaving - redirecting to home");
      window.location.href = "/";
    }
  };

  const copyRoomUrl = () => {
    navigator.clipboard.writeText(window.location.href);
  };

  if (isCreatingRoom) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <h2 className="text-white text-xl">Creazione room in corso...</h2>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="bg-red-600 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-6">
            <span className="text-white text-2xl">⚠</span>
          </div>
          <h2 className="text-white text-2xl font-semibold mb-4">
            Errore nella creazione della room
          </h2>
          <p className="text-gray-300 mb-6">{error}</p>
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Per utilizzare Interview Studio hai bisogno di una API key di
              Daily.co:
            </p>
            <ol className="text-sm text-gray-400 text-left list-decimal list-inside space-y-2">
              <li>
                Registrati su{" "}
                <a
                  href="https://dashboard.daily.co/"
                  className="text-blue-400 underline"
                  target="_blank"
                >
                  dashboard.daily.co
                </a>
              </li>
              <li>Vai nella sezione Developers</li>
              <li>Copia la tua API key</li>
              <li>Aggiungila al file .env.local come DAILY_API_KEY</li>
            </ol>
            <Link href="/">
              <Button className="bg-blue-600 hover:bg-blue-700 mt-6">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Torna alla Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/">
              <Button
                variant="outline"
                size="sm"
                className="bg-gray-700 border-gray-600 hover:bg-gray-600"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Home
              </Button>
            </Link>
            <h1 className="text-white text-lg font-semibold">
              Interview Studio - Room: {roomId.slice(0, 8)}...
            </h1>

            {/* Role indicator */}
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
            <Button
              onClick={copyRoomUrl}
              variant="outline"
              size="sm"
              className="bg-gray-700 border-gray-600 hover:bg-gray-600 text-white"
            >
              Condividi Room
            </Button>
            <div className="flex items-center text-gray-400">
              <Users className="h-4 w-4 mr-1" />
              <span className="text-sm">{participants.length + 1}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        <div
          id="daily-call-container"
          className="w-full h-full absolute inset-0"
          ref={(el) => {
            if (el && callFrameRef.current && !el.hasChildNodes()) {
              const iframe = callFrameRef.current.iframe();
              if (iframe) {
                // Assicuriamoci che l'iframe occupi tutto lo spazio disponibile
                iframe.style.width = "100%";
                iframe.style.height = "100%";
                iframe.style.border = "none";
                el.appendChild(iframe);
              }
            }
          }}
        />

        <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2">
          <div className="flex items-center space-x-4 bg-gray-800/90 backdrop-blur rounded-full px-6 py-4">
            <Button
              onClick={toggleAudio}
              size="lg"
              className={`rounded-full w-14 h-14 ${
                isAudioOn
                  ? "bg-gray-700 hover:bg-gray-600"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {isAudioOn ? (
                <Mic className="h-6 w-6" />
              ) : (
                <MicOff className="h-6 w-6" />
              )}
            </Button>

            <Button
              onClick={toggleVideo}
              size="lg"
              className={`rounded-full w-14 h-14 ${
                isVideoOn
                  ? "bg-gray-700 hover:bg-gray-600"
                  : "bg-red-600 hover:bg-red-700"
              }`}
            >
              {isVideoOn ? (
                <Video className="h-6 w-6" />
              ) : (
                <VideoOff className="h-6 w-6" />
              )}
            </Button>

            {/* Recording button - only show for hosts */}
            {permissions.canRecord ? (
              <Button
                onClick={toggleRecording}
                size="lg"
                className={`rounded-full w-14 h-14 ${
                  isRecording
                    ? "bg-red-600 hover:bg-red-700 animate-pulse"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
                title={isRecording ? "Stop Recording" : "Start Recording"}
              >
                {isRecording ? (
                  <Square className="h-6 w-6 fill-current" />
                ) : (
                  <Circle className="h-6 w-6" />
                )}
              </Button>
            ) : (
              // Show disabled recording button with tooltip for guests
              <Button
                size="lg"
                disabled
                className="rounded-full w-14 h-14 bg-gray-800 cursor-not-allowed opacity-50"
                title="Solo l'host può avviare le registrazioni"
              >
                <Circle className="h-6 w-6" />
              </Button>
            )}

            <Button
              onClick={leaveCall}
              size="lg"
              className="rounded-full w-14 h-14 bg-red-600 hover:bg-red-700"
            >
              <Phone className="h-6 w-6 transform rotate-[135deg]" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
