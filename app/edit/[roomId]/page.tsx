"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  ArrowLeft,
  MoreHorizontal,
} from "lucide-react";

interface Recording {
  id: string;
  recording_url: string;
  duration: number;
  file_size: number;
}

interface Transcription {
  id: string;
  transcript_text: string;
  word_timestamps: {
    words: Array<{
      word: string;
      start: number;
      end: number;
    }>;
    wordCount: number;
    totalDuration: number;
  };
}

interface EditData {
  recordings: Recording[];
  transcriptions: Transcription[];
  roomName: string;
}

interface ZoomRange {
  id: string;
  startTime: number;
  endTime: number;
  focusOn: string; // recording ID to focus on
  participantIndex: number;
}

export default function EditPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;

  const [editData, setEditData] = useState<EditData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [mutedVideos, setMutedVideos] = useState<Set<string>>(new Set());
  const videoRefs = useRef<{ [key: string]: HTMLVideoElement }>({});

  // Zoom system states
  const [selectedFocus, setSelectedFocus] = useState<string>(""); // recording ID
  const [showZoomMenu, setShowZoomMenu] = useState(false);
  const [zoomRanges, setZoomRanges] = useState<ZoomRange[]>([]);
  const [isSelectingZoomRange, setIsSelectingZoomRange] = useState(false);
  const [zoomRangeStart, setZoomRangeStart] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragCurrentTime, setDragCurrentTime] = useState<number | null>(null);
  const [videoErrors, setVideoErrors] = useState<Set<string>>(new Set());
  const [focusedVideo, setFocusedVideo] = useState<string | null>(null);

  const fetchEditData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch recordings and transcriptions for this room
      const response = await fetch(`/api/recordings/list?roomId=${roomId}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch edit data");
      }

      const data = await response.json();

      if (data.recordings && data.recordings.length > 0) {
        setEditData({
          recordings: data.recordings,
          transcriptions: data.recordings.flatMap(
            (r: Recording & { transcriptions?: Transcription[] }) =>
              r.transcriptions || []
          ),
          roomName: data.recordings[0].room?.name || roomId,
        });

        // Set duration to the longest recording
        const maxDuration = Math.max(
          ...data.recordings.map((r: Recording) => r.duration)
        );
        setDuration(maxDuration);
      } else {
        throw new Error("No recordings found for this room");
      }
    } catch (error) {
      console.error("Error fetching edit data:", error);
      setError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [roomId]);

  useEffect(() => {
    fetchEditData();
  }, [fetchEditData]);

  const togglePlay = () => {
    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);

    // Control all videos
    Object.values(videoRefs.current).forEach((video) => {
      if (video) {
        if (newIsPlaying) {
          video.play().catch(console.error);
        } else {
          video.pause();
        }
      }
    });

    // Check if we're in a focus range
    checkFocusState();
  };

  // const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
  //   const rect = event.currentTarget.getBoundingClientRect();
  //   const clickX = event.clientX - rect.left;
  //   const percentage = clickX / rect.width;
  //   const newTime = percentage * duration;
  //   setCurrentTime(newTime);
  //
  //   // Seek all videos to new time
  //   Object.values(videoRefs.current).forEach((video) => {
  //     if (video) {
  //       video.currentTime = newTime;
  //     }
  //   });
  // };

  const toggleMute = (recordingId: string) => {
    const newMutedVideos = new Set(mutedVideos);
    if (newMutedVideos.has(recordingId)) {
      newMutedVideos.delete(recordingId);
    } else {
      newMutedVideos.add(recordingId);
    }
    setMutedVideos(newMutedVideos);
  };

  const getVideoGridClass = (count: number) => {
    if (count === 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count <= 4) return "grid-cols-2";
    return "grid-cols-3";
  };

  // Sync all videos to a specific time
  const syncAllVideosToTime = useCallback((time: number) => {
    console.log(`Syncing all videos to time: ${time}s`);
    Object.entries(videoRefs.current).forEach(([recordingId, video]) => {
      if (video) {
        const currentVideoTime = video.currentTime;
        const timeDiff = Math.abs(currentVideoTime - time);
        console.log(
          `Video ${recordingId}: current=${currentVideoTime}s, target=${time}s, diff=${timeDiff}s`
        );

        // Always sync for precision, remove the 0.5s tolerance for focus transitions
        video.currentTime = time;
        console.log(`Video ${recordingId}: set to ${time}s`);
      }
    });
  }, []);

  // Check if current time is in any focus range and update focused video
  const checkFocusState = useCallback(() => {
    const activeFocusRange = zoomRanges.find(
      (range) => currentTime >= range.startTime && currentTime <= range.endTime
    );

    if (activeFocusRange) {
      if (focusedVideo !== activeFocusRange.focusOn) {
        console.log(
          `Entering focus mode: ${activeFocusRange.focusOn} at time ${currentTime}s`
        );
        setFocusedVideo(activeFocusRange.focusOn);
      }
    } else {
      if (focusedVideo !== null) {
        console.log(
          `Exiting focus mode at time ${currentTime}s, syncing all videos`
        );
        // Sync all videos when exiting focus to current time
        const syncTime = currentTime;
        setTimeout(() => {
          syncAllVideosToTime(syncTime);
        }, 100); // Small delay to ensure focus transition completes
        setFocusedVideo(null);
      }
    }
  }, [currentTime, zoomRanges, focusedVideo, syncAllVideosToTime]);

  // Monitor time changes to handle focus transitions
  useEffect(() => {
    checkFocusState();
  }, [checkFocusState]);

  // Get current captions for display
  const getCurrentCaptions = useCallback(() => {
    if (!editData?.transcriptions) return null;

    // Find all words that should be visible at current time
    const activeWords: Array<{
      word: string;
      start: number;
      end: number;
      isActive: boolean;
      participantIndex: number;
    }> = [];

    editData.transcriptions.forEach((transcription, participantIndex) => {
      if (transcription.word_timestamps?.words) {
        transcription.word_timestamps.words.forEach((wordData) => {
          // Show word if current time is within a reasonable window
          const showWindow = 3; // Show words 3 seconds before and after
          if (
            currentTime >= wordData.start - showWindow &&
            currentTime <= wordData.end + showWindow
          ) {
            activeWords.push({
              ...wordData,
              isActive:
                currentTime >= wordData.start && currentTime <= wordData.end,
              participantIndex: participantIndex + 1,
            });
          }
        });
      }
    });

    // Sort by start time
    return activeWords.sort((a, b) => a.start - b.start);
  }, [editData, currentTime]);

  const currentCaptions = getCurrentCaptions();

  // Zoom system functions
  const handleParticipantFocus = (recordingId: string) => {
    setSelectedFocus(recordingId);
    if (!isSelectingZoomRange) {
      setIsSelectingZoomRange(true);
      setZoomRangeStart(null); // Reset to null, will be set on first click
    }
  };

  // Handle regular timeline clicks (just seeking)
  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const clickTime = percentage * duration;

    // Normal timeline click - seek video
    setCurrentTime(clickTime);
    syncAllVideosToTime(clickTime);
  };

  // Handle focus timeline mouse events (for drag selection)
  const handleFocusTimelineMouseDown = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const clickTime = percentage * duration;

    if (isSelectingZoomRange && selectedFocus) {
      // Start drag selection
      setZoomRangeStart(clickTime);
      setDragCurrentTime(clickTime);
      setIsDragging(true);
    } else {
      // Normal seeking
      setCurrentTime(clickTime);
      Object.values(videoRefs.current).forEach((video) => {
        if (video) {
          video.currentTime = clickTime;
        }
      });
    }
  };

  const handleFocusTimelineMouseMove = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (!isDragging || !isSelectingZoomRange) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const clickTime = percentage * duration;

    setDragCurrentTime(clickTime);
  };

  const handleFocusTimelineMouseUp = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (
      !isDragging ||
      !isSelectingZoomRange ||
      !zoomRangeStart ||
      !selectedFocus
    )
      return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const endTime = percentage * duration;

    // Complete zoom range selection
    const startTime = Math.min(zoomRangeStart, endTime);
    const finalEndTime = Math.max(zoomRangeStart, endTime);

    if (finalEndTime - startTime >= 1) {
      // Minimum 1 second range
      const participantIndex =
        editData?.recordings.findIndex((r) => r.id === selectedFocus) || 0;
      const newZoomRange: ZoomRange = {
        id: `zoom-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
        startTime,
        endTime: finalEndTime,
        focusOn: selectedFocus,
        participantIndex: participantIndex + 1,
      };

      setZoomRanges((prev) => [...prev, newZoomRange]);
    }

    // Reset selection state
    setIsSelectingZoomRange(false);
    setZoomRangeStart(null);
    setSelectedFocus("");
    setIsDragging(false);
    setDragCurrentTime(null);
  };

  const removeZoomRange = (id: string) => {
    setZoomRanges((prev) => prev.filter((range) => range.id !== id));
  };

  const clearAllZoomRanges = () => {
    setZoomRanges([]);
  };

  const cancelZoomSelection = () => {
    setIsSelectingZoomRange(false);
    setZoomRangeStart(null);
    setSelectedFocus("");
    setIsDragging(false);
    setDragCurrentTime(null);
  };

  const handleVideoError = (recordingId: string) => {
    setVideoErrors((prev) => new Set(prev).add(recordingId));
  };

  const retryVideo = (recordingId: string) => {
    setVideoErrors((prev) => {
      const newErrors = new Set(prev);
      newErrors.delete(recordingId);
      return newErrors;
    });

    // Try to reload the video
    const video = videoRefs.current[recordingId];
    if (video) {
      video.load();
    }
  };

  const renderVideoCard = (recording: Recording, index: number) => {
    const isSelected = selectedFocus === recording.id;
    const isInZoomRange = zoomRanges.some(
      (range) =>
        range.focusOn === recording.id &&
        currentTime >= range.startTime &&
        currentTime <= range.endTime
    );
    const hasVideoError = videoErrors.has(recording.id);

    return (
      <div
        key={recording.id}
        className={`relative bg-black rounded-lg overflow-hidden w-full h-full cursor-pointer transition-all duration-200 ${
          isSelected
            ? "ring-4 ring-blue-500"
            : isInZoomRange
            ? "ring-2 ring-green-400"
            : ""
        }`}
        onClick={() => handleParticipantFocus(recording.id)}
      >
        <video
          ref={(el) => {
            if (el) {
              videoRefs.current[recording.id] = el;
            }
          }}
          src={recording.recording_url}
          controls={false}
          muted={mutedVideos.has(recording.id)}
          className="w-full h-full object-cover"
          crossOrigin="anonymous"
          onLoadedMetadata={(e) => {
            const video = e.currentTarget;
            console.log(
              `Video loaded: ${recording.id}, duration: ${video.duration}s`
            );
            // Update duration with the longest video
            setDuration((prev) => Math.max(prev, video.duration));
          }}
          onTimeUpdate={(e) => {
            const video = e.currentTarget;
            // Update current time from the focused video, or first video if no focus
            const masterVideoId = focusedVideo || editData?.recordings[0].id;
            if (recording.id === masterVideoId) {
              setCurrentTime(video.currentTime);
            }
          }}
          onError={(e) => {
            console.error(
              `Video error for ${recording.id}:`,
              e.currentTarget.error
            );
            console.log(`Video URL: ${recording.recording_url}`);
            handleVideoError(recording.id);
          }}
          onLoadStart={() => {
            console.log(`Loading video: ${recording.id}`);
          }}
        />

        {/* Video Error Fallback */}
        {hasVideoError && (
          <div className="absolute inset-0 bg-gray-800 flex flex-col items-center justify-center text-white">
            <div className="text-center p-4">
              <div className="text-red-400 mb-2">⚠️ Errore Video</div>
              <div className="text-sm text-gray-300">
                Video non disponibile o scaduto
              </div>
              <Button
                onClick={() => retryVideo(recording.id)}
                size="sm"
                variant="outline"
                className="mt-2 text-white border-white hover:bg-white hover:text-black"
              >
                Riprova
              </Button>
            </div>
          </div>
        )}

        {/* Video Controls Overlay */}
        <div className="absolute bottom-2 right-2 flex space-x-2">
          <Button
            size="sm"
            variant={mutedVideos.has(recording.id) ? "secondary" : "default"}
            onClick={() => toggleMute(recording.id)}
            className="bg-black/50 hover:bg-black/70 text-white"
          >
            {mutedVideos.has(recording.id) ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Participant Label */}
        <div className="absolute top-2 left-2 bg-black/50 text-white px-2 py-1 rounded text-sm">
          Partecipante {index + 1}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !editData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Errore</h1>
          <p className="text-gray-600 mb-6">{error || "Dati non trovati"}</p>
          <Button
            onClick={() => router.push("/recordings")}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Torna alle Registrazioni
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-blue-50">
      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-4">
            <Button
              onClick={() => router.push("/recordings")}
              variant="outline"
              className="bg-white"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Indietro
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Editor Video</h1>
              <p className="text-gray-600">Room: {editData.roomName}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              onClick={fetchEditData}
              variant="outline"
              size="sm"
              className="bg-white"
              disabled={loading}
            >
              {loading ? "Aggiornamento..." : "Aggiorna Video"}
            </Button>
          </div>
        </div>

        <div className="pr-96">
          {" "}
          {/* Add right margin for fixed sidebar */}
          {/* Video Area - Fixed Size Layout */}
          <div className="bg-white rounded-lg shadow-lg p-4 mb-6 relative">
            <div className="w-full h-[400px] mx-auto relative overflow-hidden">
              <div
                className={`w-full h-full transition-all duration-500 ease-in-out ${
                  focusedVideo
                    ? "flex items-center justify-center"
                    : `grid gap-2 ${getVideoGridClass(
                        editData.recordings.length
                      )}`
                }`}
              >
                {/* Always render all videos, but show/hide them with CSS */}
                {editData.recordings.map((recording, index) => {
                  const isFocused = focusedVideo === recording.id;
                  const shouldShow = !focusedVideo || isFocused;

                  return (
                    <div
                      key={recording.id}
                      className={`transform transition-all duration-500 ease-in-out ${
                        shouldShow
                          ? "opacity-100 scale-100 relative"
                          : "opacity-0 scale-95 absolute top-0 left-0 pointer-events-none"
                      } ${isFocused ? "w-full h-full" : ""}`}
                    >
                      {renderVideoCard(recording, index)}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Captions Overlay */}
            {currentCaptions && currentCaptions.length > 0 && (
              <div className="absolute top-4 left-4 right-4 bottom-4 flex items-end justify-center pointer-events-none">
                <div className="bg-black bg-opacity-75 rounded-lg p-4 max-w-[600px]">
                  <div className="flex flex-wrap gap-1 text-white text-lg font-medium leading-relaxed">
                    {currentCaptions.map((caption, index) => (
                      <span
                        key={`${caption.start}-${index}`}
                        className={`transition-all duration-300 px-1 rounded ${
                          caption.isActive
                            ? "bg-yellow-400 text-black font-bold scale-110"
                            : caption.participantIndex === 1
                            ? "text-blue-300"
                            : "text-green-300"
                        }`}
                        style={{
                          transitionDelay: caption.isActive ? "0ms" : "100ms",
                        }}
                      >
                        {caption.word}
                      </span>
                    ))}
                  </div>

                  {/* Participant indicator */}
                  <div className="text-xs text-gray-300 mt-2">
                    {currentCaptions.some((c) => c.isActive) && (
                      <>
                        Partecipante{" "}
                        {
                          currentCaptions.find((c) => c.isActive)
                            ?.participantIndex
                        }
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
          {/* Timeline Section */}
          <div className="bg-white rounded-lg shadow-lg p-4 space-y-6">
            {/* Playback Controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <Button
                  onClick={togglePlay}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </Button>

                <div className="text-sm text-gray-600">
                  {Math.floor(currentTime / 60)}:
                  {(currentTime % 60).toFixed(0).padStart(2, "0")} /{" "}
                  {Math.floor(duration / 60)}:
                  {(duration % 60).toFixed(0).padStart(2, "0")}
                </div>
              </div>
            </div>

            {/* Main Timeline Bar */}
            <div className="space-y-2">
              <span className="text-xs text-gray-400">Timeline</span>
              <div
                className="w-full h-8 bg-gray-200 rounded-full cursor-pointer relative"
                onClick={handleTimelineClick}
              >
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
                <div
                  className="absolute top-0 h-full w-1 bg-blue-800 rounded"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              </div>
            </div>

            {/* Focus Controls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-400">Focus Timeline</span>
                  {editData && editData.recordings.length > 0 && (
                    <div className="flex gap-2">
                      {editData.recordings.map((recording, index) => (
                        <Button
                          key={recording.id}
                          onClick={() => handleParticipantFocus(recording.id)}
                          size="sm"
                          variant={
                            selectedFocus === recording.id
                              ? "default"
                              : "outline"
                          }
                          className={`text-xs h-6 px-3 ${
                            selectedFocus === recording.id
                              ? "bg-blue-600 hover:bg-blue-700"
                              : ""
                          }`}
                        >
                          Partecipante {index + 1}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                <Button
                  onClick={() => setShowZoomMenu(!showZoomMenu)}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-gray-600 h-6 w-6 p-0"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </Button>
              </div>

              {/* Focus Timeline Bar */}
              <div
                className="w-full h-8 bg-gray-200 rounded-full cursor-pointer relative"
                onMouseDown={handleFocusTimelineMouseDown}
                onMouseMove={handleFocusTimelineMouseMove}
                onMouseUp={handleFocusTimelineMouseUp}
              >
                {/* Focus ranges */}
                {zoomRanges.map((range) => (
                  <div
                    key={range.id}
                    className="absolute top-0 h-full bg-green-400 bg-opacity-50 rounded"
                    style={{
                      left: `${(range.startTime / duration) * 100}%`,
                      width: `${
                        ((range.endTime - range.startTime) / duration) * 100
                      }%`,
                    }}
                    title={`Partecipante ${
                      range.participantIndex
                    }: ${range.startTime.toFixed(1)}s - ${range.endTime.toFixed(
                      1
                    )}s`}
                  />
                ))}

                {/* Current selection range */}
                {isSelectingZoomRange &&
                  zoomRangeStart !== null &&
                  dragCurrentTime !== null && (
                    <div
                      className="absolute top-0 h-full bg-blue-400 bg-opacity-30 rounded"
                      style={{
                        left: `${
                          (Math.min(zoomRangeStart, dragCurrentTime) /
                            duration) *
                          100
                        }%`,
                        width: `${
                          (Math.abs(dragCurrentTime - zoomRangeStart) /
                            duration) *
                          100
                        }%`,
                      }}
                    />
                  )}

                <div
                  className="h-full bg-gray-400 rounded-full"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />
                <div
                  className="absolute top-0 h-full w-1 bg-gray-600 rounded"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              </div>

              {/* Zoom Menu */}
              {showZoomMenu && (
                <div className="absolute right-4 mt-2 w-64 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-10">
                  <div className="py-1">
                    {zoomRanges.length > 0 ? (
                      <>
                        {zoomRanges.map((range) => (
                          <div
                            key={range.id}
                            className="flex items-center justify-between px-4 py-2 hover:bg-gray-100"
                          >
                            <span className="text-sm">
                              Partecipante {range.participantIndex}:{" "}
                              {range.startTime.toFixed(1)}s -{" "}
                              {range.endTime.toFixed(1)}s
                            </span>
                            <button
                              onClick={() => removeZoomRange(range.id)}
                              className="text-red-500 hover:text-red-700 text-sm"
                            >
                              Rimuovi
                            </button>
                          </div>
                        ))}
                        <div className="border-t border-gray-200" />
                        <button
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
                          onClick={clearAllZoomRanges}
                        >
                          Rimuovi Tutti
                        </button>
                      </>
                    ) : (
                      <div className="px-4 py-2 text-sm text-gray-500">
                        Nessun range di focus creato
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Instructions */}
              {isSelectingZoomRange && (
                <div className="bg-blue-50 border border-blue-200 rounded p-2 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-blue-800">
                      Clicca sulla focus timeline per completare il range per
                      Partecipante{" "}
                      {(editData?.recordings.findIndex(
                        (r) => r.id === selectedFocus
                      ) ?? -1) + 1}
                    </span>
                    <Button
                      onClick={cancelZoomSelection}
                      size="sm"
                      variant="ghost"
                      className="text-blue-600 hover:text-blue-800"
                    >
                      Annulla
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Right Sidebar - Transcriptions */}
      <div className="fixed right-6 top-20 bottom-6 w-80 bg-white rounded-lg shadow-lg p-4 overflow-hidden flex flex-col">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Trascrizioni
        </h3>

        <div className="flex-1 overflow-y-auto space-y-6">
          {editData.transcriptions.length > 0 ? (
            editData.transcriptions.map((transcription, index) => (
              <div
                key={transcription.id}
                className="border-b border-gray-200 pb-4 last:border-b-0"
              >
                <h4 className="font-medium text-gray-800 mb-2">
                  Partecipante {index + 1}
                </h4>
                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
                  {transcription.transcript_text}
                </p>
                <div className="text-xs text-gray-400 mt-2">
                  {transcription.word_timestamps?.wordCount || 0} parole
                </div>
              </div>
            ))
          ) : (
            <div className="text-center text-gray-500">
              <p>Nessuna trascrizione disponibile</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
