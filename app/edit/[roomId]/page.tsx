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
  Download,
} from "lucide-react";
import { useVideoExport, ExportSettings } from "@/hooks/useVideoExport";
import { useEditSave } from "@/hooks/useEditSave";

interface Recording {
  id: string;
  recording_url: string;
  duration: number;
  file_size: number;
  recording_started_at?: string; // ISO timestamp for synchronization
  created_at?: string; // Fallback timestamp if recording_started_at is not available
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

// LEGACY: ZoomRange interface removed - focus now handled via VideoSection.focusedParticipantId

interface VideoSection {
  id: string;
  startTime: number;
  endTime: number;
  isDeleted: boolean;
  playbackSpeed: number; // 1.0 = normal, 0.5 = half speed, 2.0 = double speed
  focusedParticipantId?: string; // recording ID to focus on (replaces separate focus timeline)
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

  // LEGACY: Focus segments removed - now using videoSections.focusedParticipantId
  const [videoErrors, setVideoErrors] = useState<Set<string>>(new Set());
  const [focusedVideo, setFocusedVideo] = useState<string | null>(null);
  const [syncOffsets, setSyncOffsets] = useState<{
    [recordingId: string]: number;
  }>({});

  // Video loading tracking for accurate duration calculation
  const [videosLoaded, setVideosLoaded] = useState<Set<string>>(new Set());

  // Split/Section system
  const [splitPoints, setSplitPoints] = useState<number[]>([]);
  const [videoSections, setVideoSections] = useState<VideoSection[]>([]);
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    sectionId: string;
    openUpward?: boolean;
  } | null>(null);

  // Edit save functionality
  const { saveEditState, loadEditState, isSaving, lastSaved, saveError } =
    useEditSave();

  // Export system
  const { exportStatus, isExporting, startExport, cancelExport, resetExport } =
    useVideoExport();
  const [showExportModal, setShowExportModal] = useState(false);

  // Split point interaction states
  const [isDraggingSplit, setIsDraggingSplit] = useState(false);
  const [draggingSplitIndex, setDraggingSplitIndex] = useState<number | null>(
    null
  );
  const [splitContextMenu, setSplitContextMenu] = useState<{
    x: number;
    y: number;
    splitIndex: number;
  } | null>(null);

  // Calculate cut offsets based on recording start timestamps (with created_at fallback)
  // These offsets are used to automatically "cut" the beginning of videos to synchronize their start points
  // Example: Video A starts at 00:00, Video B starts at 00:02 -> Video A gets 2s cut, both effectively start at 00:02
  // Calculate real duration based on loaded video elements
  const updateRealDuration = useCallback(() => {
    if (!editData) return;

    const allVideosLoaded = editData.recordings.every((r) =>
      videosLoaded.has(r.id)
    );
    if (!allVideosLoaded) {
      console.log(
        "⏳ Waiting for all videos to load before calculating real duration"
      );
      return;
    }

    // Get real durations from loaded video elements
    const realDurations = editData.recordings.map((recording) => {
      const video = videoRefs.current[recording.id];
      const realDuration = video ? video.duration : recording.duration;
      console.log(
        `📹 Video ${recording.id}: DB duration=${recording.duration}s, Real duration=${realDuration}s`
      );
      return realDuration;
    });

    // Handle sync offsets - subtract max offset from max real duration
    const offsetValues = Object.values(syncOffsets);
    const maxOffset = offsetValues.length > 0 ? Math.max(...offsetValues) : 0;
    const maxRealDuration = Math.max(...realDurations);
    const finalRealDuration = maxRealDuration - maxOffset;

    console.log(
      `🎬 Duration calculation: maxReal=${maxRealDuration}s, maxOffset=${maxOffset}s, final=${finalRealDuration}s`
    );

    // Only update if duration actually changed significantly (more than 0.1s difference)
    if (Math.abs(duration - finalRealDuration) > 0.1) {
      console.log(
        `📐 Updating duration from ${duration}s to ${finalRealDuration}s`
      );
      setDuration(finalRealDuration);

      // Update video sections to the new duration if they extend beyond it
      setVideoSections((prevSections) => {
        const updated = prevSections.map((section) => {
          if (section.endTime > finalRealDuration) {
            console.log(
              `✂️ Trimming section ${section.id} from ${section.endTime}s to ${finalRealDuration}s`
            );
            return { ...section, endTime: finalRealDuration };
          }
          return section;
        });
        return updated;
      });
    }
  }, [editData, videosLoaded, syncOffsets, duration, videoRefs]);

  const calculateSyncOffsets = useCallback((recordings: Recording[]) => {
    console.log("=== AUTO-CUT OFFSET CALCULATION ===");
    console.log(
      "Raw recordings data:",
      recordings.map((r) => ({
        id: r.id,
        recording_started_at: r.recording_started_at,
        created_at: r.created_at,
      }))
    );

    // Try recording_started_at first, fallback to created_at
    const recordingsWithTimestamps = recordings.filter(
      (r) => r.recording_started_at || r.created_at
    );

    if (recordingsWithTimestamps.length < 1) {
      console.log("No recordings with timestamps found");
      return {};
    }

    if (recordingsWithTimestamps.length < 2) {
      console.log("Only one recording found, no synchronization needed");
      // Return zero offset for the single recording
      const singleOffset: { [recordingId: string]: number } = {};
      singleOffset[recordingsWithTimestamps[0].id] = 0;
      setSyncOffsets(singleOffset);
      return singleOffset;
    }

    // Determine which timestamp to use and log the source
    const usingRecordingStarted = recordings.some(
      (r) => r.recording_started_at
    );
    const timestampSource = usingRecordingStarted
      ? "recording_started_at"
      : "created_at";
    console.log(`Using ${timestampSource} for auto-cut synchronization`);

    // Find the latest recording start time as reference point (all videos will be cut to start from this point)
    const timestamps = recordingsWithTimestamps
      .map((r) => {
        const timestampStr = r.recording_started_at || r.created_at!;
        const timestamp = new Date(timestampStr).getTime();
        console.log(`Recording ${r.id}: ${timestampStr} -> ${timestamp}ms`);

        // Validate timestamp
        if (!isFinite(timestamp) || timestamp <= 0) {
          console.error(
            `Invalid timestamp for recording ${r.id}: ${timestampStr} -> ${timestamp}ms`
          );
          return null;
        }

        return {
          id: r.id,
          timestamp,
        };
      })
      .filter((t) => t !== null) as Array<{ id: string; timestamp: number }>;

    if (timestamps.length === 0) {
      console.error("No valid timestamps found");
      return {};
    }

    const latestTime = Math.max(...timestamps.map((t) => t.timestamp));
    console.log(
      `Latest time (sync reference): ${latestTime}ms (${new Date(
        latestTime
      ).toISOString()})`
    );

    // Calculate cut offset for each recording (how much to cut from the beginning)
    const offsets: { [recordingId: string]: number } = {};
    timestamps.forEach(({ id, timestamp }) => {
      const cutMs = latestTime - timestamp;
      const cutSec = cutMs / 1000;
      offsets[id] = cutSec;
      console.log(
        `Recording ${id}: will cut ${cutMs}ms = ${cutSec.toFixed(
          3
        )}s from start (using ${timestampSource})`
      );
    });

    console.log("Final cut offsets:", offsets);
    console.log("=== END AUTO-CUT CALCULATION ===");

    setSyncOffsets(offsets);
    return offsets;
  }, []);

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

        // Offsets already calculated above

        // Calculate sync offsets first
        const offsets = calculateSyncOffsets(data.recordings);

        // Set duration to the longest recording minus the maximum offset (to align all videos)
        const maxDuration = Math.max(
          ...data.recordings.map((r: Recording) => r.duration)
        );

        // Handle case where offsets might be empty
        const offsetValues = Object.values(offsets);
        const maxOffset =
          offsetValues.length > 0 ? Math.max(...offsetValues) : 0;
        const adjustedDuration = maxDuration - maxOffset;

        // Validate duration before setting
        const finalDuration =
          isFinite(adjustedDuration) && adjustedDuration > 0
            ? adjustedDuration
            : maxDuration;
        setDuration(finalDuration);

        if (finalDuration === adjustedDuration) {
          console.log(
            `Set duration to ${finalDuration}s (maxDuration: ${maxDuration}s, maxOffset: ${maxOffset}s)`
          );
        } else {
          console.error(
            `Invalid duration calculation: ${adjustedDuration} (maxDuration: ${maxDuration}, maxOffset: ${maxOffset}), using fallback: ${finalDuration}s`
          );
        }

        // Initialize with one full section (0 to finalDuration)
        setVideoSections([
          {
            id: `section-0-${finalDuration}`,
            startTime: 0,
            endTime: finalDuration,
            isDeleted: false,
            playbackSpeed: 1.0,
          },
        ]);
      } else {
        throw new Error("No recordings found for this room");
      }
    } catch (error) {
      console.error("Error fetching edit data:", error);
      setError(error instanceof Error ? error.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [roomId, calculateSyncOffsets]);

  // DISABLED: Legacy focus segments - now everything is managed via video_sections

  // Load video sections on component mount (either AI-generated during processing or user-modified)
  const [sectionsLoaded, setSectionsLoaded] = useState(false);

  useEffect(() => {
    const loadVideoSections = async () => {
      if (roomId && duration > 0 && !sectionsLoaded) {
        try {
          console.log("📖 Loading video sections from database...");
          const savedState = await loadEditState(roomId);
          console.log("📊 Loaded sections:", savedState);

          if (savedState && savedState.videoSections.length > 0) {
            console.log(
              "✅ Loading",
              savedState.videoSections.length,
              "video sections"
            );
            setVideoSections(savedState.videoSections);
            // LEGACY: zoomRanges removed - focus now in videoSections
            if (savedState.splitPoints.length > 0) {
              setSplitPoints(savedState.splitPoints);
            }
          } else {
            console.log(
              "⚠️ No video sections found in database, keeping default"
            );
          }
          setSectionsLoaded(true);
        } catch (error) {
          console.error("❌ Failed to load video sections:", error);
          setSectionsLoaded(true);
        }
      }
    };

    loadVideoSections();
  }, [roomId, duration, sectionsLoaded, loadEditState]);

  useEffect(() => {
    fetchEditData();
  }, [fetchEditData]);

  // DISABLED: Legacy focus segments - now using video_sections
  // useEffect(() => {
  //   if (editData) {
  //     loadFocusSegments();
  //   }
  // }, [editData, loadFocusSegments]);

  // Close context menus when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
      setSplitContextMenu(null);
    };
    if (contextMenu || splitContextMenu) {
      document.addEventListener("click", handleClickOutside);
      return () => document.removeEventListener("click", handleClickOutside);
    }
  }, [contextMenu, splitContextMenu]);

  const togglePlay = () => {
    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);

    if (newIsPlaying) {
      console.log("=== PLAYING WITH AUTO-CUT SYNC ===");
      // First, sync all videos to current time (applying cut offsets)
      // Validate currentTime before syncing
      if (!isFinite(currentTime) || currentTime < 0) {
        console.error(
          `Invalid currentTime in togglePlay: ${currentTime}, resetting to 0`
        );
        setCurrentTime(0);
        syncAllVideosToTime(0);
      } else {
        syncAllVideosToTime(currentTime);
      }

      // Small delay to ensure seeking completes before playing
      setTimeout(() => {
        // Then start playing all videos
        Object.values(videoRefs.current).forEach((video) => {
          if (video) {
            video.play().catch(console.error);
          }
        });
      }, 100);
    } else {
      // Just pause all videos
      Object.values(videoRefs.current).forEach((video) => {
        if (video) {
          video.pause();
        }
      });
    }

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

  // Sync all videos to a specific time, applying cut offsets (videos start from their offset point)
  const syncAllVideosToTime = useCallback(
    (time: number) => {
      // Validate input time
      if (!isFinite(time) || time < 0) {
        console.error(`Invalid time value: ${time}`);
        return;
      }

      console.log(`Syncing all videos to time: ${time}s with cut offsets`);
      Object.entries(videoRefs.current).forEach(([recordingId, video]) => {
        if (video) {
          // Apply cut offset - video time = timeline time + its starting offset
          const offset = syncOffsets[recordingId] || 0;

          // Validate offset
          if (!isFinite(offset)) {
            console.error(`Invalid offset for video ${recordingId}: ${offset}`);
            return;
          }

          const videoTime = time + offset;

          // Validate final video time
          if (!isFinite(videoTime) || videoTime < 0) {
            console.error(
              `Invalid video time for ${recordingId}: ${videoTime} (time: ${time}, offset: ${offset})`
            );
            return;
          }

          // Ensure video time doesn't exceed video duration
          if (video.duration && videoTime > video.duration) {
            console.warn(
              `Video time ${videoTime}s exceeds duration ${video.duration}s for ${recordingId}, clamping to duration`
            );
            video.currentTime = video.duration;
          } else {
            video.currentTime = videoTime;
          }

          console.log(
            `Video ${recordingId}: timeline ${time}s -> video time ${videoTime}s (cut offset: ${offset}s)`
          );
        }
      });
    },
    [syncOffsets]
  );

  // Check if current time is in a section with focus and update focused video
  const checkFocusState = useCallback(() => {
    // Find the current video section
    const currentSection = videoSections.find(
      (section) =>
        currentTime >= section.startTime &&
        currentTime < section.endTime &&
        !section.isDeleted
    );

    if (currentSection && currentSection.focusedParticipantId) {
      // This section has a focus - apply it
      if (focusedVideo !== currentSection.focusedParticipantId) {
        console.log(
          `Entering section focus mode: ${
            currentSection.focusedParticipantId
          } at time ${currentTime}s (section ${currentSection.startTime.toFixed(
            1
          )}s-${currentSection.endTime.toFixed(1)}s)`
        );
        setFocusedVideo(currentSection.focusedParticipantId);
      }
    } else {
      // No section focus or in deleted section - exit focus mode
      if (focusedVideo !== null) {
        console.log(`Exiting section focus mode at time ${currentTime}s`);
        setFocusedVideo(null);
      }
    }
  }, [currentTime, videoSections, focusedVideo]);

  // Monitor time changes to handle focus transitions
  useEffect(() => {
    checkFocusState();
  }, [checkFocusState]);

  // Auto-save edit state when sections change
  const saveCurrentEditState = useCallback(async () => {
    console.log("🔄 saveCurrentEditState called", {
      sectionsLength: videoSections.length,
      splitPointsLength: splitPoints.length,
      roomId,
      hasDeletedSections: videoSections.filter((s) => s.isDeleted).length,
      sectionsWithFocus: videoSections.filter((s) => s.focusedParticipantId)
        .length,
    });

    if (videoSections.length > 0 && roomId && sectionsLoaded) {
      try {
        console.log("💾 Attempting to save edit state...");
        const result = await saveEditState(roomId, {
          videoSections,
          zoomRanges: [], // Empty - focus now in videoSections
          splitPoints,
        });
        console.log("✅ Edit state saved successfully:", result);
      } catch (error) {
        console.error("❌ Failed to auto-save edit state:", error);
      }
    } else {
      console.log("⚠️ Not saving: insufficient data", {
        sectionsLength: videoSections.length,
        roomId,
      });
    }
  }, [videoSections, splitPoints, roomId, saveEditState, sectionsLoaded]);

  // Update real duration when videos are loaded
  useEffect(() => {
    updateRealDuration();
  }, [updateRealDuration, videosLoaded, syncOffsets]);

  // Auto-save when videoSections change (with debounce)
  useEffect(() => {
    if (videoSections.length > 0 && sectionsLoaded && roomId) {
      const timeoutId = setTimeout(() => {
        console.log("🔄 Auto-save triggered by videoSections change");
        saveCurrentEditState();
      }, 500);

      return () => clearTimeout(timeoutId);
    }
  }, [videoSections, sectionsLoaded, roomId, saveCurrentEditState]);

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

  // Legacy functions (to be removed)
  // TODO: Remove these functions after migration complete

  // Handle regular timeline clicks (seeking or splitting)
  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const clickTime = percentage * duration;

    // Validate click time before proceeding
    if (!isFinite(clickTime) || clickTime < 0 || clickTime > duration) {
      console.error(
        `Invalid click time: ${clickTime} (percentage: ${percentage}, duration: ${duration})`
      );
      return;
    }

    if (isSplitMode) {
      // Split mode - create split point
      createSplitAtTime(clickTime);
    } else {
      // Normal mode - seek video
      // Check if clicking on a deleted section
      const clickedSection = videoSections.find(
        (section) =>
          clickTime >= section.startTime && clickTime < section.endTime
      );

      if (clickedSection && clickedSection.isDeleted) {
        console.log(
          "Cannot seek to deleted section, finding nearest available time"
        );
        // Find nearest non-deleted section
        const availableSections = videoSections.filter((s) => !s.isDeleted);

        if (availableSections.length > 0) {
          // Find closest available section
          const closest = availableSections.reduce((prev, curr) => {
            const prevDist = Math.min(
              Math.abs(prev.startTime - clickTime),
              Math.abs(prev.endTime - clickTime)
            );
            const currDist = Math.min(
              Math.abs(curr.startTime - clickTime),
              Math.abs(curr.endTime - clickTime)
            );
            return currDist < prevDist ? curr : prev;
          });

          // Seek to start of closest section
          const seekTime = closest.startTime;
          if (isFinite(seekTime) && seekTime >= 0) {
            setCurrentTime(seekTime);
            syncAllVideosToTime(seekTime);
          } else {
            console.error(`Invalid seek time: ${seekTime}`);
          }
        }
      } else {
        // Normal seek to available section - already validated clickTime above
        setCurrentTime(clickTime);
        syncAllVideosToTime(clickTime);
      }
    }
  };

  // Legacy focus handlers removed - focus is now part of video sections

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

  // Split/Section functions
  const toggleSplitMode = () => {
    setIsSplitMode(!isSplitMode);
    console.log(`Split mode ${!isSplitMode ? "enabled" : "disabled"}`);
  };

  const createSplitAtTime = (time: number) => {
    // Don't create split at exact start or end
    if (time <= 0 || time >= duration) return;

    // Don't create duplicate splits
    if (splitPoints.includes(time)) return;

    // Add new split point and sort
    const newSplitPoints = [...splitPoints, time].sort((a, b) => a - b);
    setSplitPoints(newSplitPoints);

    // Recreate sections based on split points
    const newSections: VideoSection[] = [];
    const allPoints = [0, ...newSplitPoints, duration];

    for (let i = 0; i < allPoints.length - 1; i++) {
      const start = allPoints[i];
      const end = allPoints[i + 1];

      // Check if this section already exists (exact match)
      const existingSection = videoSections.find(
        (s) =>
          Math.abs(s.startTime - start) < 0.1 && Math.abs(s.endTime - end) < 0.1
      );

      if (existingSection) {
        // Keep existing section as-is
        newSections.push(existingSection);
      } else {
        // This is a new section created by splitting
        // Find the original section that contained this time range
        const originalSection = videoSections.find(
          (s) =>
            start >= s.startTime &&
            end <= s.endTime &&
            s.endTime - s.startTime > end - start // Make sure it's larger (being split)
        );

        // Inherit properties from the original section being split
        newSections.push({
          id: `section-${start}-${end}`,
          startTime: start,
          endTime: end,
          isDeleted: originalSection?.isDeleted || false,
          playbackSpeed: originalSection?.playbackSpeed || 1.0,
        });

        console.log(
          `📄 Created new section ${start}-${end} inheriting from original: deleted=${originalSection?.isDeleted}, speed=${originalSection?.playbackSpeed}x`
        );
      }
    }

    setVideoSections(newSections);
    console.log(
      `Created split at ${time}s. Total sections: ${newSections.length}`
    );
    // Auto-save will be triggered by useEffect when videoSections changes
  };

  // Manual save trigger - only call when user makes actual modifications

  const deleteSection = (sectionId: string) => {
    setVideoSections((prev) =>
      prev.map((section) =>
        section.id === sectionId ? { ...section, isDeleted: true } : section
      )
    );
    setContextMenu(null);
    console.log(`Deleted section: ${sectionId}`);
    // Auto-save will be triggered by useEffect when videoSections changes
  };

  const restoreSection = (sectionId: string) => {
    setVideoSections((prev) =>
      prev.map((section) =>
        section.id === sectionId ? { ...section, isDeleted: false } : section
      )
    );
    setContextMenu(null);
    console.log(`Restored section: ${sectionId}`);
    // Auto-save will be triggered by useEffect when videoSections changes
  };

  const setPlaybackSpeed = (sectionId: string, speed: number) => {
    setVideoSections((prev) => {
      const updated = prev.map((section) =>
        section.id === sectionId
          ? { ...section, playbackSpeed: speed }
          : section
      );
      console.log(`Set playback speed for section ${sectionId}: ${speed}x`);
      console.log(
        "📝 Updated sections:",
        updated.map((s) => ({
          id: s.id,
          speed: s.playbackSpeed,
          deleted: s.isDeleted,
        }))
      );
      return updated;
    });
    setContextMenu(null);
    // Auto-save will be triggered by useEffect when videoSections changes
  };

  const setSectionFocus = (sectionId: string, participantId?: string) => {
    setVideoSections((prev) => {
      const updated = prev.map((section) =>
        section.id === sectionId
          ? { ...section, focusedParticipantId: participantId }
          : section
      );
      console.log(
        `Set focus for section ${sectionId}: ${participantId || "none"}`
      );
      console.log(
        "📝 Updated sections:",
        updated.map((s) => ({
          id: s.id,
          focus: s.focusedParticipantId || "none",
        }))
      );
      return updated;
    });
    setContextMenu(null);
    // Auto-save will be triggered by useEffect when videoSections changes
  };

  // Debug function to test direct API call
  const debugSaveSection = async (sectionId: string, speed: number) => {
    const section = videoSections.find((s) => s.id === sectionId);
    if (!section) return;

    const testSection = {
      ...section,
      playbackSpeed: speed,
    };

    console.log("🚨 DEBUG: Testing direct API call with section:", testSection);

    try {
      const response = await fetch("/api/debug-save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId,
          testSection,
        }),
      });

      const result = await response.json();
      console.log("🚨 DEBUG API Response:", result);
    } catch (error) {
      console.error("🚨 DEBUG API Error:", error);
    }
  };

  const resetSplits = () => {
    setSplitPoints([]);
    setVideoSections([
      {
        id: `section-0-${duration}`,
        startTime: 0,
        endTime: duration,
        isDeleted: false,
        playbackSpeed: 1.0,
      },
    ]);
    console.log("All splits reset");
  };

  // Split point drag and drop functions
  const handleSplitMouseDown = (
    event: React.MouseEvent,
    splitIndex: number
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingSplit(true);
    setDraggingSplitIndex(splitIndex);
    console.log(
      `Started dragging split ${splitIndex} at ${splitPoints[splitIndex]}s`
    );
  };

  const handleSplitMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!isDraggingSplit || draggingSplitIndex === null) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = Math.max(
      0.1,
      Math.min(duration - 0.1, percentage * duration)
    );

    // Update the split point position
    const newSplitPoints = [...splitPoints];
    newSplitPoints[draggingSplitIndex] = newTime;
    setSplitPoints(newSplitPoints.sort((a, b) => a - b));
  };

  const handleSplitMouseUp = () => {
    if (isDraggingSplit && draggingSplitIndex !== null) {
      console.log(
        `Finished dragging split to ${splitPoints[draggingSplitIndex]}s`
      );
      // Recreate sections with new split point
      recreateSectionsFromSplits();
    }
    setIsDraggingSplit(false);
    setDraggingSplitIndex(null);
  };

  const recreateSectionsFromSplits = () => {
    const newSections: VideoSection[] = [];
    const allPoints = [0, ...splitPoints, duration];

    for (let i = 0; i < allPoints.length - 1; i++) {
      const start = allPoints[i];
      const end = allPoints[i + 1];

      // Try to find exact match first
      const existingSection = videoSections.find(
        (s) =>
          Math.abs(s.startTime - start) < 0.1 && Math.abs(s.endTime - end) < 0.1
      );

      if (existingSection) {
        // Perfect match - keep the existing section
        newSections.push({
          ...existingSection,
          startTime: start, // Update to exact new times
          endTime: end,
        });
      } else {
        // No exact match - find the section that contributes most to this range
        const overlappingSections = videoSections.filter(
          (s) => start < s.endTime && end > s.startTime
        );

        let bestSection: VideoSection | undefined;
        let maxOverlap = 0;

        // Find the section with maximum overlap
        for (const section of overlappingSections) {
          const overlapStart = Math.max(start, section.startTime);
          const overlapEnd = Math.min(end, section.endTime);
          const overlapDuration = Math.max(0, overlapEnd - overlapStart);

          if (overlapDuration > maxOverlap) {
            maxOverlap = overlapDuration;
            bestSection = section;
          }
        }

        // Create new section inheriting from the section with most overlap
        newSections.push({
          id: `section-${start.toFixed(3)}-${end.toFixed(3)}`,
          startTime: start,
          endTime: end,
          isDeleted: bestSection?.isDeleted || false,
          playbackSpeed: bestSection?.playbackSpeed || 1.0,
          focusedParticipantId: bestSection?.focusedParticipantId,
        });

        console.log(
          `Created section ${start.toFixed(1)}s-${end.toFixed(
            1
          )}s inheriting from section with ${maxOverlap.toFixed(1)}s overlap`
        );
      }
    }

    console.log(
      `Recreated ${newSections.length} sections from splits:`,
      newSections.map(
        (s) =>
          `${s.startTime.toFixed(1)}-${s.endTime.toFixed(1)} (${
            s.playbackSpeed
          }x, focus: ${s.focusedParticipantId ? "yes" : "no"})`
      )
    );
    setVideoSections(newSections);
  };

  const deleteSplitPoint = (splitIndex: number) => {
    const splitTime = splitPoints[splitIndex];
    const newSplitPoints = splitPoints.filter(
      (_, index) => index !== splitIndex
    );
    setSplitPoints(newSplitPoints);

    console.log(`Deleted split point at ${splitTime}s`);
    recreateSectionsFromSplits();
    setSplitContextMenu(null);
  };

  const handleSplitContextMenu = (
    event: React.MouseEvent,
    splitIndex: number
  ) => {
    event.preventDefault();
    event.stopPropagation();
    setSplitContextMenu({
      x: event.clientX,
      y: event.clientY,
      splitIndex,
    });
  };

  const renderVideoCard = (recording: Recording, index: number) => {
    // Check if current section has focus on this participant
    const currentSection = videoSections.find(
      (section) =>
        currentTime >= section.startTime && currentTime < section.endTime
    );
    const isInFocus = currentSection?.focusedParticipantId === recording.id;
    const hasVideoError = videoErrors.has(recording.id);

    return (
      <div
        key={recording.id}
        className={`relative bg-black rounded-lg overflow-hidden w-full h-full transition-all duration-200 ${
          isInFocus ? "ring-2 ring-purple-400" : ""
        }`}
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

            // Track that this video has loaded
            setVideosLoaded((prev) => new Set(prev).add(recording.id));

            // Apply initial cut offset - start video from its offset point
            const offset = syncOffsets[recording.id] || 0;
            const initialVideoTime = currentTime + offset;

            // Validate before setting currentTime
            if (isFinite(initialVideoTime) && initialVideoTime >= 0) {
              // Clamp to video duration if necessary
              const clampedTime = Math.min(
                initialVideoTime,
                video.duration || initialVideoTime
              );
              video.currentTime = clampedTime;
              console.log(
                `Video ${recording.id}: applying cut offset ${offset}s, starting at ${clampedTime}s`
              );
            } else {
              console.error(
                `Invalid initial video time for ${recording.id}: ${initialVideoTime} (currentTime: ${currentTime}, offset: ${offset})`
              );
              video.currentTime = 0; // Fallback to start
            }
          }}
          onTimeUpdate={(e) => {
            const video = e.currentTarget;
            // Update current time from the focused video, or first video if no focus
            const masterVideoId = focusedVideo || editData?.recordings[0]?.id;
            if (recording.id === masterVideoId) {
              // Convert video time back to timeline time (remove the cut offset)
              const videoTime = video.currentTime;
              const offset = syncOffsets[recording.id] || 0;

              // Validate values before calculation
              if (!isFinite(videoTime) || !isFinite(offset)) {
                console.error(
                  `Invalid values in onTimeUpdate for ${recording.id}: videoTime=${videoTime}, offset=${offset}`
                );
                return;
              }

              const timelineTime = videoTime - offset;

              // Validate timeline time before setting
              if (isFinite(timelineTime) && timelineTime >= 0) {
                setCurrentTime(timelineTime);
              } else {
                console.error(
                  `Invalid timeline time for ${recording.id}: ${timelineTime} (videoTime: ${videoTime}, offset: ${offset})`
                );
                return;
              }

              // Check current section and apply playback speed
              const currentSection = videoSections.find(
                (section) =>
                  timelineTime >= section.startTime &&
                  timelineTime < section.endTime
              );

              // Apply playback speed for current section
              if (currentSection && !currentSection.isDeleted) {
                Object.values(videoRefs.current).forEach((video) => {
                  if (
                    video &&
                    video.playbackRate !== currentSection.playbackSpeed
                  ) {
                    video.playbackRate = currentSection.playbackSpeed;
                    console.log(
                      `Applied playback speed ${
                        currentSection.playbackSpeed
                      }x to section ${currentSection.startTime.toFixed(
                        1
                      )}s-${currentSection.endTime.toFixed(1)}s`
                    );
                  }
                });
              }

              if (currentSection && currentSection.isDeleted && isPlaying) {
                // Find next non-deleted section
                const nextSection = videoSections
                  .filter(
                    (section) =>
                      !section.isDeleted && section.startTime > timelineTime
                  )
                  .sort((a, b) => a.startTime - b.startTime)[0];

                if (nextSection) {
                  const jumpTime = nextSection.startTime;
                  if (isFinite(jumpTime) && jumpTime >= 0) {
                    console.log(
                      `Skipping deleted section ${currentSection.startTime.toFixed(
                        1
                      )}s-${currentSection.endTime.toFixed(
                        1
                      )}s, jumping to ${jumpTime.toFixed(1)}s`
                    );
                    syncAllVideosToTime(jumpTime);
                  } else {
                    console.error(`Invalid jump time: ${jumpTime}`);
                  }
                } else {
                  // No more sections, pause video
                  console.log(
                    "Reached end of non-deleted sections, pausing video"
                  );
                  setIsPlaying(false);
                  Object.values(videoRefs.current).forEach((v) => v?.pause());
                }
              }
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
            {Object.keys(syncOffsets).length > 0 && (
              <div className="text-sm text-green-600 bg-green-50 px-3 py-1 rounded-full">
                ✂️ Video tagliati automaticamente (
                {Object.keys(syncOffsets).length} offset applicati)
                {editData?.recordings?.some((r) => r.recording_started_at)
                  ? ""
                  : " - usando created_at"}
              </div>
            )}

            {/* Export Button */}
            <Button
              onClick={() => setShowExportModal(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={!editData || isExporting}
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? "Esportando..." : "Esporta Video"}
            </Button>

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

              {/* Split Controls */}
              <div className="flex items-center space-x-2">
                <Button
                  onClick={toggleSplitMode}
                  size="sm"
                  variant={isSplitMode ? "default" : "outline"}
                  className={
                    isSplitMode ? "bg-orange-600 hover:bg-orange-700" : ""
                  }
                >
                  {isSplitMode ? "🔪 Split Mode ON" : "🔪 Split Mode"}
                </Button>
                <Button
                  onClick={resetSplits}
                  size="sm"
                  variant="outline"
                  disabled={splitPoints.length === 0}
                >
                  Reset Splits
                </Button>
                <div className="text-sm text-gray-500 flex items-center gap-2">
                  <span>
                    {splitPoints.length} splits,{" "}
                    {videoSections.filter((s) => !s.isDeleted).length}/
                    {videoSections.length} sezioni
                  </span>
                  {isSaving && (
                    <span className="text-xs text-blue-500">
                      💾 Salvando...
                    </span>
                  )}
                  {lastSaved && !isSaving && (
                    <span className="text-xs text-green-500">
                      ✅ Salvato {lastSaved.toLocaleTimeString()}
                    </span>
                  )}
                  {saveError && (
                    <span className="text-xs text-red-500" title={saveError}>
                      ❌ Errore salvataggio
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Main Timeline Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-400">
                  {isSplitMode ? "Timeline - Click per fare split" : "Timeline"}
                </span>
                <div className="text-xs text-gray-500 flex items-center gap-4">
                  <span>
                    Durata finale:{" "}
                    {(
                      videoSections
                        .filter((s) => !s.isDeleted)
                        .reduce(
                          (acc, s) => acc + (s.endTime - s.startTime),
                          0
                        ) / 60
                    ).toFixed(1)}{" "}
                    min
                  </span>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-green-200 rounded-sm"></div>
                      <span>1x</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-orange-200 rounded-sm"></div>
                      <span>&lt;1x</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-blue-200 rounded-sm"></div>
                      <span>&gt;1x</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-3 h-3 bg-purple-300 rounded-sm"></div>
                      <span>🎯 Focus</span>
                    </div>
                  </div>
                </div>
              </div>
              <div
                className={`w-full h-8 rounded-full cursor-pointer relative ${
                  isSplitMode ? "bg-orange-100" : "bg-gray-200"
                }`}
                onClick={handleTimelineClick}
                onMouseMove={handleSplitMouseMove}
                onMouseUp={handleSplitMouseUp}
                onMouseLeave={handleSplitMouseUp}
              >
                {/* Render video sections */}
                {videoSections.map((section) => (
                  <div
                    key={section.id}
                    className={`absolute top-0 h-full ${
                      section.isDeleted
                        ? "bg-red-200 opacity-50"
                        : section.focusedParticipantId
                        ? "bg-purple-300" // Sections with focus
                        : section.playbackSpeed !== 1.0
                        ? section.playbackSpeed < 1.0
                          ? "bg-orange-200" // Slow sections
                          : "bg-blue-200" // Fast sections
                        : "bg-green-200" // Normal speed sections
                    } border-l border-r border-gray-400`}
                    style={{
                      left: `${(section.startTime / duration) * 100}%`,
                      width: `${
                        ((section.endTime - section.startTime) / duration) * 100
                      }%`,
                    }}
                    title={`Section ${section.startTime.toFixed(
                      1
                    )}s - ${section.endTime.toFixed(1)}s${
                      section.isDeleted
                        ? " (DELETED)"
                        : ` - Velocità: ${section.playbackSpeed}x${
                            section.focusedParticipantId
                              ? ` - Focus: Partecipante ${
                                  editData?.recordings.findIndex(
                                    (r) => r.id === section.focusedParticipantId
                                  ) + 1 || "?"
                                }`
                              : " - Focus: 50/50"
                          }`
                    }`}
                    onContextMenu={(e) => {
                      e.preventDefault();

                      // Calculate if menu should open upward
                      const windowHeight = window.innerHeight;
                      const clickY = e.clientY;
                      const estimatedMenuHeight = 400; // Approximate menu height with speed options
                      const shouldOpenUpward =
                        clickY + estimatedMenuHeight > windowHeight;

                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        sectionId: section.id,
                        openUpward: shouldOpenUpward,
                      });
                    }}
                  >
                    {section.isDeleted ? (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-red-600 font-bold">
                        DELETED
                      </div>
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                        {section.focusedParticipantId ? (
                          <span className="text-purple-700">
                            🎯 P
                            {editData?.recordings.findIndex(
                              (r) => r.id === section.focusedParticipantId
                            ) + 1}
                            {section.playbackSpeed !== 1.0 && (
                              <span className="ml-1 text-xs">
                                {section.playbackSpeed}x
                              </span>
                            )}
                          </span>
                        ) : section.playbackSpeed !== 1.0 ? (
                          <span
                            className={`${
                              section.playbackSpeed < 1.0
                                ? "text-orange-700"
                                : "text-blue-700"
                            }`}
                          >
                            {section.playbackSpeed}x
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                ))}

                {/* Split point markers with interactive handles */}
                {splitPoints.map((point, index) => (
                  <div
                    key={`split-${point}-${index}`}
                    className="absolute top-0 h-full"
                    style={{
                      left: `${(point / duration) * 100}%`,
                      transform: "translateX(-50%)",
                      zIndex: 20,
                    }}
                  >
                    {/* Split line */}
                    <div className="absolute w-0.5 h-full bg-red-500" />

                    {/* Interactive handle (red circle) - positioned above the line */}
                    <div
                      className={`absolute w-4 h-4 bg-red-500 border-2 border-white rounded-full cursor-move shadow-lg hover:bg-red-600 transition-colors ${
                        isDraggingSplit && draggingSplitIndex === index
                          ? "scale-125 bg-red-600"
                          : ""
                      }`}
                      style={{
                        top: "-8px", // Position above the timeline bar
                        left: "50%",
                        transform: "translateX(-50%)",
                      }}
                      title={`Split at ${point.toFixed(
                        1
                      )}s - Drag to move, Right-click to delete`}
                      onMouseDown={(e) => handleSplitMouseDown(e, index)}
                      onContextMenu={(e) => handleSplitContextMenu(e, index)}
                    />
                  </div>
                ))}

                {/* Current progress bar */}
                <div
                  className="h-full bg-blue-600 bg-opacity-30 rounded-full"
                  style={{ width: `${(currentTime / duration) * 100}%` }}
                />

                {/* Current time marker */}
                <div
                  className="absolute top-0 h-full w-1 bg-blue-800 rounded z-10"
                  style={{ left: `${(currentTime / duration) * 100}%` }}
                />
              </div>
            </div>

            {/* OLD Focus Controls - REMOVED
            Focus is now integrated directly into video sections via context menu
            */}
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

      {/* Context Menu */}
      {contextMenu && (
        <div
          className={`fixed bg-white shadow-lg rounded-lg border py-2 z-50 transform transition-all duration-200 ${
            contextMenu.openUpward ? "origin-bottom" : "origin-top"
          }`}
          style={{
            left: contextMenu.x,
            ...(contextMenu.openUpward
              ? { bottom: window.innerHeight - contextMenu.y + 10 } // Open upward with 10px margin
              : { top: contextMenu.y }), // Normal downward opening
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          {(() => {
            const section = videoSections.find(
              (s) => s.id === contextMenu.sectionId
            );
            if (!section) return null;

            return (
              <div>
                <div className="px-4 py-1 text-xs text-gray-500 border-b flex items-center justify-between">
                  <span>
                    Sezione {section.startTime.toFixed(1)}s -{" "}
                    {section.endTime.toFixed(1)}s
                  </span>
                  {contextMenu.openUpward && (
                    <span className="text-xs text-gray-400">▲</span>
                  )}
                  {!contextMenu.openUpward && (
                    <span className="text-xs text-gray-400">▼</span>
                  )}
                </div>
                {section.isDeleted ? (
                  <button
                    className="w-full px-4 py-2 text-left hover:bg-gray-100 text-green-600"
                    onClick={() => restoreSection(section.id)}
                  >
                    ↺ Ripristina Sezione
                  </button>
                ) : (
                  <div>
                    {/* Current playback speed indicator */}
                    <div className="px-4 py-1 text-xs text-gray-400 border-b">
                      Velocità: {section.playbackSpeed}x
                    </div>

                    {/* Speed options */}
                    <div className="border-b mb-1">
                      <div className="px-3 py-1 text-xs text-gray-500">
                        Velocità riproduzione:
                      </div>
                      {[0.25, 0.5, 0.75, 1.0, 1.1, 1.2, 1.3, 1.5, 2.0, 4.0].map(
                        (speed) => (
                          <button
                            key={speed}
                            className={`w-full px-4 py-1 text-left hover:bg-gray-100 text-sm ${
                              section.playbackSpeed === speed
                                ? "bg-blue-50 text-blue-600 font-medium"
                                : "text-gray-700"
                            }`}
                            onClick={() => setPlaybackSpeed(section.id, speed)}
                          >
                            {speed === 1.0 ? "🎬" : speed < 1.0 ? "🐌" : "⚡"}{" "}
                            {speed}x {speed === 1.0 ? "(normale)" : ""}
                          </button>
                        )
                      )}
                    </div>

                    {/* Focus section */}
                    <div className="border-t pt-1">
                      <div className="px-4 py-1 text-xs text-gray-400 border-b">
                        Focus:{" "}
                        {section.focusedParticipantId
                          ? editData?.recordings.find(
                              (r) => r.id === section.focusedParticipantId
                            )
                            ? `Partecipante ${
                                editData.recordings.findIndex(
                                  (r) => r.id === section.focusedParticipantId
                                ) + 1
                              }`
                            : "Sconosciuto"
                          : "Nessuno (50/50)"}
                      </div>

                      {/* No focus option */}
                      <button
                        className={`w-full px-4 py-1 text-left hover:bg-gray-100 text-sm ${
                          !section.focusedParticipantId
                            ? "bg-blue-50 text-blue-600 font-medium"
                            : "text-gray-700"
                        }`}
                        onClick={() => setSectionFocus(section.id, undefined)}
                      >
                        👥 Nessun Focus (50/50)
                      </button>

                      {/* Participant focus options */}
                      {editData?.recordings.map((recording, index) => (
                        <button
                          key={recording.id}
                          className={`w-full px-4 py-1 text-left hover:bg-gray-100 text-sm ${
                            section.focusedParticipantId === recording.id
                              ? "bg-blue-50 text-blue-600 font-medium"
                              : "text-gray-700"
                          }`}
                          onClick={() =>
                            setSectionFocus(section.id, recording.id)
                          }
                        >
                          🎯 Partecipante {index + 1}
                        </button>
                      ))}
                    </div>

                    <button
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 text-red-600 border-t"
                      onClick={() => deleteSection(section.id)}
                    >
                      🗑️ Elimina Sezione
                    </button>

                    {/* Debug button - remove when fixed */}
                    <div className="border-t mb-1">
                      <button
                        className="w-full px-4 py-2 text-left hover:bg-gray-100 text-purple-600 text-sm"
                        onClick={() => debugSaveSection(section.id, 0.5)}
                      >
                        🚨 DEBUG: Test Save 0.5x
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Split Point Context Menu */}
      {splitContextMenu && (
        <div
          className="fixed bg-white shadow-lg rounded-lg border py-2 z-50"
          style={{
            left: splitContextMenu.x,
            top: splitContextMenu.y,
          }}
          onMouseLeave={() => setSplitContextMenu(null)}
        >
          <div className="px-4 py-1 text-xs text-gray-500 border-b">
            Split Point {splitContextMenu.splitIndex + 1} -{" "}
            {splitPoints[splitContextMenu.splitIndex]?.toFixed(1)}s
          </div>
          <button
            className="w-full px-4 py-2 text-left hover:bg-gray-100 text-red-600"
            onClick={() => deleteSplitPoint(splitContextMenu.splitIndex)}
          >
            🗑️ Elimina Split Point
          </button>
        </div>
      )}

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Esporta Video
              </h3>
              <button
                onClick={() => setShowExportModal(false)}
                className="text-gray-400 hover:text-gray-600"
                disabled={isExporting}
              >
                ✕
              </button>
            </div>

            {isExporting ? (
              // Export Progress
              <div className="space-y-4">
                <div className="flex items-center space-x-3">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-600"></div>
                  <span className="text-sm text-gray-600">
                    {exportStatus.message}
                  </span>
                </div>

                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-purple-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${exportStatus.percentage}%` }}
                  ></div>
                </div>

                <div className="text-center">
                  <p className="text-sm text-gray-500 mb-3">
                    {exportStatus.percentage}% completato
                  </p>
                  <Button onClick={cancelExport} variant="outline" size="sm">
                    Annulla
                  </Button>
                </div>

                {exportStatus.stage === "completed" &&
                  exportStatus.downloadUrl && (
                    <div className="text-center pt-4 border-t">
                      <p className="text-green-600 mb-2">
                        ✅ Export completato!
                      </p>
                      <Button
                        onClick={() => {
                          window.open(exportStatus.downloadUrl!, "_blank");
                          setShowExportModal(false);
                          resetExport();
                        }}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <Download className="h-4 w-4 mr-2" />
                        Scarica Video
                      </Button>
                    </div>
                  )}

                {exportStatus.stage === "failed" && (
                  <div className="text-center pt-4 border-t">
                    <p className="text-red-600 mb-2">❌ Export fallito</p>
                    <p className="text-sm text-gray-500 mb-3">
                      {exportStatus.error}
                    </p>
                    <Button
                      onClick={() => {
                        setShowExportModal(false);
                        resetExport();
                      }}
                      variant="outline"
                    >
                      Chiudi
                    </Button>
                  </div>
                )}
              </div>
            ) : (
              // Export Settings
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Qualità Video
                  </label>
                  <select className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                    <option value="720p">720p (Recommended)</option>
                    <option value="1080p">1080p (High Quality)</option>
                    <option value="4k">4K (Premium)</option>
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">
                    Formato
                  </label>
                  <select className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                    <option value="mp4">MP4 (Recommended)</option>
                    <option value="webm">WebM</option>
                  </select>
                </div>

                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="includeSubtitles"
                    defaultChecked
                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                  />
                  <label
                    htmlFor="includeSubtitles"
                    className="text-sm text-gray-700"
                  >
                    Includi sottotitoli
                  </label>
                </div>

                <div className="bg-gray-50 p-3 rounded-md">
                  <div className="text-sm text-gray-600">
                    <div className="flex justify-between">
                      <span>Durata originale:</span>
                      <span>
                        {Math.floor(duration / 60)}:
                        {(duration % 60).toFixed(0).padStart(2, "0")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Durata finale:</span>
                      <span>
                        {Math.floor(
                          videoSections
                            .filter((s) => !s.isDeleted)
                            .reduce(
                              (acc, s) => acc + (s.endTime - s.startTime),
                              0
                            ) / 60
                        )}
                        :
                        {(
                          videoSections
                            .filter((s) => !s.isDeleted)
                            .reduce(
                              (acc, s) => acc + (s.endTime - s.startTime),
                              0
                            ) % 60
                        )
                          .toFixed(0)
                          .padStart(2, "0")}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sezioni eliminate:</span>
                      <span>
                        {videoSections.filter((s) => s.isDeleted).length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex space-x-3">
                  <Button
                    onClick={() => setShowExportModal(false)}
                    variant="outline"
                    className="flex-1"
                  >
                    Annulla
                  </Button>
                  <Button
                    onClick={() => {
                      const settings: ExportSettings = {
                        format: "mp4",
                        quality: "720p",
                        framerate: 30,
                        includeSubtitles: true,
                      };
                      startExport(roomId, settings);
                    }}
                    className="flex-1 bg-purple-600 hover:bg-purple-700"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Inizia Export
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
