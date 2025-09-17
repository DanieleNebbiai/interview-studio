"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState, useCallback } from "react";
import DailyIframe, { DailyCall } from "@daily-co/daily-js";
import { LoadingState } from "@/components/room/LoadingState";
import { ErrorState } from "@/components/room/ErrorState";
import { RoomHeader } from "@/components/room/RoomHeader";
import { CallContainer } from "@/components/room/CallContainer";

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

  // Funzione robusta per gestire il leave
  const handleLeave = useCallback(async () => {
    console.log("Handling leave...", {
      isHost: permissions.isHost,
      isRecording,
      recordingInstancesCount: recordingInstances.length,
    });

    // Navigation logic - le registrazioni verranno gestite dal processing
    if (permissions.isHost) {
      console.log("Host leaving - redirecting to processing page");
      const recordingData = {
        roomId: roomId,
        roomName: permissions.roomId,
        recordings: [],
        hadRecordingsSession: isRecording || recordingInstances.length > 0,
      };
      console.log("Saving processing data:", recordingData);
      sessionStorage.setItem("processingData", JSON.stringify(recordingData));
      window.location.href = `/processing/${roomId}`;
    } else {
      console.log("Guest leaving - redirecting to home");
      window.location.href = "/";
    }
  }, [
    permissions.isHost,
    permissions.roomId,
    isRecording,
    recordingInstances.length,
    roomId,
  ]);

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

      try {
        callFrameRef.current = DailyIframe.createFrame({
          iframeStyle: {
            width: "100%",
            height: "100%",
            border: "none",
            borderRadius: "12px",
          },

          showLeaveButton: false,
          showFullscreenButton: true,
          showLocalVideo: true,
          showParticipantsBar: true,
          showUserNameChangeUI: true,
          theme: {
            colors: {
              accent: "#ff7a00",
              accentText: "#ffffff",
              background: "#1c1e21",
              backgroundAccent: "#2a2d31",
              baseText: "#ffffff",
              border: "#1c1e21",
              mainAreaBg: "#1c1e21",
              mainAreaBgAccent: "#2a2d31",
              mainAreaText: "#ffffff",
              supportiveText: "#b5b5b5",
            },
          },
          activeSpeakerMode: true,
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
            console.log("Recording started via Daily Prebuilt");
            setIsRecording(true);
          })
          .on("recording-stopped", () => {
            console.log("Recording stopped via Daily Prebuilt");
            setIsRecording(false);
          })
          .on("left-meeting", () => {
            console.log(
              "Left meeting via Daily Prebuilt - calling handleLeave"
            );
            handleLeave();
          });

        // Join the meeting
        callFrameRef.current.join({ url });

        // CSS injection sarà fatto solo dopo il join per non interferire con pre-call UI
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
  }, [roomId, handleLeave]);

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

      console.log(
        "Starting synchronized recording with minimal delay for timestamp capture..."
      );

      try {
        const response = await fetch("/api/recordings/start-synchronized", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            roomName: roomId,
            participantSessionIds: participantIds,
            delayMs: 1000, // Minimal 1 second delay just for API processing
          }),
        });

        const data = await response.json();

        if (data.success) {
          console.log(
            `Successfully started ${data.successCount} synchronized recordings`
          );
          console.log(`Timing spread: ${data.timingSpreadMs}ms`);

          console.log(
            "Recording timestamps will be handled by Daily.co's start_ts field"
          );

          // Convert successful results to RecordingInstance format
          const successfulRecordings: RecordingInstance[] = data.results
            .filter((result: { success: boolean }) => result.success)
            .map(
              (result: {
                instanceId: string;
                sessionId: string;
                recording?: { status?: string };
              }) => ({
                instanceId: result.instanceId,
                roomName: roomId,
                sessionId: result.sessionId,
                startTime: data.syncStartTime,
                status: result.recording?.status || "active",
              })
            );

          setRecordingInstances(successfulRecordings);
          setIsRecording(true);

          console.log(
            `Started ${successfulRecordings.length} synchronized recordings with timestamp tracking`
          );
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
            console.log(
              "Default room recording started:",
              fallbackData.recording
            );
            const defaultRecording: RecordingInstance = {
              instanceId:
                fallbackData.recording.recordingId ||
                fallbackData.recording.instanceId,
              roomName: roomId,
              sessionId: undefined,
              startTime: new Date().toISOString(),
              status: fallbackData.recording.status || "active",
            };
            setRecordingInstances([defaultRecording]);
            setIsRecording(true);
          } else {
            console.error(
              "Fallback recording also failed:",
              fallbackData.error
            );
          }
        }
      } catch (error) {
        console.error("Error with synchronized recording:", error);
      }
    } catch (error) {
      console.error("Error starting recordings:", error);
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

  const copyRoomUrl = () => {
    navigator.clipboard.writeText(window.location.href);
  };

  if (isCreatingRoom) {
    return <LoadingState />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <RoomHeader
        roomId={roomId}
        permissions={permissions}
        isRecording={isRecording}
        recordingInstances={recordingInstances}
        participantCount={participants.length + 1}
        onCopyRoomUrl={copyRoomUrl}
        onToggleRecording={toggleRecording}
        onLeaveCall={handleLeave}
      />

      <CallContainer callFrame={callFrameRef.current} />
    </div>
  );
}
