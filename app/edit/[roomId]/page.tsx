"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "next/navigation";
import { useVideoExport } from "@/hooks/useVideoExport";
import { useEditSave } from "@/hooks/useEditSave";
import { LoadingState } from "@/components/edit/LoadingState";
import { ErrorState } from "@/components/edit/ErrorState";
import { EditHeader } from "@/components/edit/EditHeader";
import { VideoPlayer } from "@/components/edit/VideoPlayer";
import { PlaybackControls } from "@/components/edit/PlaybackControls";
import { SplitControls } from "@/components/edit/SplitControls";
import { Timeline } from "@/components/edit/Timeline";
import { ExportModal } from "@/components/edit/ExportModal";
import { ContextMenu } from "@/components/edit/ContextMenu";
import { SplitContextMenu } from "@/components/edit/SplitContextMenu";
import { RightSidebar } from "@/components/edit/RightSidebar";

interface Recording {
  id: string;
  recording_url: string;
  duration: number;
  file_size: number;
  recording_started_at?: string; // ISO timestamp for synchronization
  created_at?: string; // Fallback timestamp if recording_started_at is not available
  waveforms?: Array<{
    id: string;
    waveform_data: {
      points: Array<{ time: number; amplitude: number }>;
      sampleRate: number;
      duration: number;
    };
    sample_rate: number;
    duration: number;
    points_count: number;
  }>;
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

  // Caption settings
  const [captionsEnabled, setCaptionsEnabled] = useState(true);
  const [captionSize, setCaptionSize] = useState<"small" | "medium" | "large">("medium");

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
  const {
    exportStatus,
    isExporting,
    startExport,
    cancelExport,
    resetExport,
    downloadVideo,
    copyDownloadLink,
  } = useVideoExport();
  const [showExportModal, setShowExportModal] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  // Debug logging for export status
  useEffect(() => {
    console.log("🔍 Export Status Debug:", {
      stage: exportStatus.stage,
      stageCheck: exportStatus.stage === "completed",
      downloadUrl: exportStatus.downloadUrl,
      downloadUrlCheck: !!exportStatus.downloadUrl,
      jobId: exportStatus.jobId,
      isExporting,
      showExportModal,
      shouldShowDownload:
        exportStatus.stage === "completed" && exportStatus.downloadUrl,
      fullCondition:
        exportStatus.stage === "completed" &&
        exportStatus.downloadUrl &&
        showExportModal,
    });
  }, [exportStatus, isExporting, showExportModal]);

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

  // Helper functions for extracted components
  const handleVideoTimeUpdate = (recordingId: string, videoTime: number) => {
    const offset = syncOffsets[recordingId] || 0;

    if (!isFinite(videoTime) || !isFinite(offset)) {
      console.error(
        `Invalid values in onTimeUpdate for ${recordingId}: videoTime=${videoTime}, offset=${offset}`
      );
      return;
    }

    const timelineTime = videoTime - offset;

    if (isFinite(timelineTime) && timelineTime >= 0) {
      setCurrentTime(timelineTime);
    } else {
      console.error(
        `Invalid timeline time for ${recordingId}: ${timelineTime} (videoTime: ${videoTime}, offset: ${offset})`
      );
      return;
    }

    const currentSection = videoSections.find(
      (section) =>
        timelineTime >= section.startTime && timelineTime < section.endTime
    );

    if (currentSection && !currentSection.isDeleted) {
      Object.values(videoRefs.current).forEach((video) => {
        if (video && video.playbackRate !== currentSection.playbackSpeed) {
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
      const nextSection = videoSections
        .filter(
          (section) => !section.isDeleted && section.startTime > timelineTime
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
        console.log("Reached end of non-deleted sections, pausing video");
        setIsPlaying(false);
        Object.values(videoRefs.current).forEach((v) => v?.pause());
      }
    }
  };

  const handleSectionContextMenu = (
    event: React.MouseEvent,
    sectionId: string
  ) => {
    const windowHeight = window.innerHeight;
    const clickY = event.clientY;
    const estimatedMenuHeight = 400;
    const shouldOpenUpward = clickY + estimatedMenuHeight > windowHeight;

    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      sectionId,
      openUpward: shouldOpenUpward,
    });
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

  // const currentCaptions = getCurrentCaptions(); // Legacy - not used anymore

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

    console.log("🚨 DEBUG: Processing section:", testSection);
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

  if (loading) {
    return <LoadingState />;
  }

  if (error || !editData) {
    return <ErrorState error={error} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Navbar */}
      <EditHeader
        roomName={editData.roomName}
        syncOffsets={syncOffsets}
        recordings={editData.recordings}
        isExporting={isExporting}
        onExport={() => setShowExportModal(true)}
        onRefresh={fetchEditData}
        loading={loading}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex">
        {/* Video Area */}
        <div className="flex-1 flex flex-col">
          <div className="flex-1 p-6">
            <VideoPlayer
              recordings={editData.recordings}
              currentTime={currentTime}
              mutedVideos={mutedVideos}
              videoRefs={videoRefs}
              focusedVideo={focusedVideo}
              videoErrors={videoErrors}
              syncOffsets={syncOffsets}
              videoSections={videoSections}
              transcriptions={editData.transcriptions}
              captionsEnabled={captionsEnabled}
              captionSize={captionSize}
              onToggleMute={toggleMute}
              onVideoError={handleVideoError}
              onRetryVideo={retryVideo}
              onVideosLoaded={(recordingId) =>
                setVideosLoaded((prev) => new Set(prev).add(recordingId))
              }
              onTimeUpdate={handleVideoTimeUpdate}
            />
          </div>
        </div>

        {/* Right Sidebar */}
        <RightSidebar
          transcriptions={editData.transcriptions}
          captionsEnabled={captionsEnabled}
          captionSize={captionSize}
          onCaptionsEnabledChange={setCaptionsEnabled}
          onCaptionSizeChange={setCaptionSize}
        />
      </div>

      {/* Bottom Timeline */}
      <div className="bg-card border-t border-border p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <PlaybackControls
              isPlaying={isPlaying}
              currentTime={currentTime}
              duration={duration}
              onTogglePlay={togglePlay}
            />

            <SplitControls
              isSplitMode={isSplitMode}
              splitPoints={splitPoints}
              videoSections={videoSections}
              isSaving={isSaving}
              lastSaved={lastSaved}
              saveError={saveError}
              onToggleSplitMode={toggleSplitMode}
              onResetSplits={resetSplits}
            />
          </div>

          <Timeline
            duration={duration}
            currentTime={currentTime}
            videoSections={videoSections}
            splitPoints={splitPoints}
            isSplitMode={isSplitMode}
            isDraggingSplit={isDraggingSplit}
            draggingSplitIndex={draggingSplitIndex}
            recordings={editData.recordings}
            onTimelineClick={handleTimelineClick}
            onSplitMouseMove={handleSplitMouseMove}
            onSplitMouseUp={handleSplitMouseUp}
            onSectionContextMenu={handleSectionContextMenu}
            onSplitMouseDown={handleSplitMouseDown}
            onSplitContextMenu={handleSplitContextMenu}
          />
        </div>
      </div>

      <ContextMenu
        contextMenu={contextMenu}
        videoSections={videoSections}
        recordings={editData.recordings}
        onDeleteSection={deleteSection}
        onRestoreSection={restoreSection}
        onSetPlaybackSpeed={setPlaybackSpeed}
        onSetSectionFocus={setSectionFocus}
        onDebugSaveSection={debugSaveSection}
        onClose={() => setContextMenu(null)}
      />

      <SplitContextMenu
        splitContextMenu={splitContextMenu}
        splitPoints={splitPoints}
        onDeleteSplitPoint={deleteSplitPoint}
        onClose={() => setSplitContextMenu(null)}
      />

      <ExportModal
        isOpen={showExportModal}
        isExporting={isExporting}
        exportStatus={exportStatus}
        duration={duration}
        videoSections={videoSections}
        linkCopied={linkCopied}
        onClose={() => setShowExportModal(false)}
        onStartExport={startExport}
        onCancelExport={cancelExport}
        onDownloadVideo={downloadVideo}
        onCopyDownloadLink={copyDownloadLink}
        onResetExport={resetExport}
        onLinkCopiedChange={setLinkCopied}
        roomId={roomId}
      />
    </div>
  );
}
