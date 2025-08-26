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

interface ZoomRange {
  id: string;
  startTime: number;
  endTime: number;
  focusOn: string; // recording ID to focus on
  participantIndex: number;
  aiGenerated?: boolean; // Whether this was created by AI
  reason?: string; // AI's reason for this focus segment
  confidence?: number; // AI confidence score (0-1)
  type?: 'monologue' | 'conversation' | 'silence'; // AI-detected segment type
}

interface VideoSection {
  id: string;
  startTime: number;
  endTime: number;
  isDeleted: boolean;
  playbackSpeed: number; // 1.0 = normal, 0.5 = half speed, 2.0 = double speed
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
  const [aiRecommendations, setAiRecommendations] = useState<string[]>([]);
  const [loadingAISegments, setLoadingAISegments] = useState(false);
  const [aiSegmentsLoaded, setAiSegmentsLoaded] = useState(false);
  const [syncOffsets, setSyncOffsets] = useState<{ [recordingId: string]: number }>({});
  
  // Split/Section system
  const [splitPoints, setSplitPoints] = useState<number[]>([]);
  const [videoSections, setVideoSections] = useState<VideoSection[]>([]);
  const [isSplitMode, setIsSplitMode] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<{x: number; y: number; sectionId: string; openUpward?: boolean} | null>(null);

  // Calculate cut offsets based on recording start timestamps (with created_at fallback)
  // These offsets are used to automatically "cut" the beginning of videos to synchronize their start points
  // Example: Video A starts at 00:00, Video B starts at 00:02 -> Video A gets 2s cut, both effectively start at 00:02
  const calculateSyncOffsets = useCallback((recordings: Recording[]) => {
    console.log('=== AUTO-CUT OFFSET CALCULATION ===');
    console.log('Raw recordings data:', recordings.map(r => ({
      id: r.id,
      recording_started_at: r.recording_started_at,
      created_at: r.created_at
    })));
    
    // Try recording_started_at first, fallback to created_at
    const recordingsWithTimestamps = recordings.filter(r => r.recording_started_at || r.created_at);
    
    if (recordingsWithTimestamps.length < 1) {
      console.log('No recordings with timestamps found');
      return {};
    }
    
    if (recordingsWithTimestamps.length < 2) {
      console.log('Only one recording found, no synchronization needed');
      // Return zero offset for the single recording
      const singleOffset: { [recordingId: string]: number } = {};
      singleOffset[recordingsWithTimestamps[0].id] = 0;
      setSyncOffsets(singleOffset);
      return singleOffset;
    }

    // Determine which timestamp to use and log the source
    const usingRecordingStarted = recordings.some(r => r.recording_started_at);
    const timestampSource = usingRecordingStarted ? 'recording_started_at' : 'created_at';
    console.log(`Using ${timestampSource} for auto-cut synchronization`);

    // Find the latest recording start time as reference point (all videos will be cut to start from this point)
    const timestamps = recordingsWithTimestamps.map(r => {
      const timestampStr = r.recording_started_at || r.created_at!;
      const timestamp = new Date(timestampStr).getTime();
      console.log(`Recording ${r.id}: ${timestampStr} -> ${timestamp}ms`);
      
      // Validate timestamp
      if (!isFinite(timestamp) || timestamp <= 0) {
        console.error(`Invalid timestamp for recording ${r.id}: ${timestampStr} -> ${timestamp}ms`);
        return null;
      }
      
      return {
        id: r.id,
        timestamp
      };
    }).filter(t => t !== null) as Array<{id: string, timestamp: number}>;
    
    if (timestamps.length === 0) {
      console.error('No valid timestamps found');
      return {};
    }
    
    const latestTime = Math.max(...timestamps.map(t => t.timestamp));
    console.log(`Latest time (sync reference): ${latestTime}ms (${new Date(latestTime).toISOString()})`);
    
    // Calculate cut offset for each recording (how much to cut from the beginning)
    const offsets: { [recordingId: string]: number } = {};
    timestamps.forEach(({ id, timestamp }) => {
      const cutMs = latestTime - timestamp;
      const cutSec = cutMs / 1000;
      offsets[id] = cutSec;
      console.log(`Recording ${id}: will cut ${cutMs}ms = ${cutSec.toFixed(3)}s from start (using ${timestampSource})`);
    });
    
    console.log('Final cut offsets:', offsets);
    console.log('=== END AUTO-CUT CALCULATION ===');
    
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
        const maxOffset = offsetValues.length > 0 ? Math.max(...offsetValues) : 0;
        const adjustedDuration = maxDuration - maxOffset;
        
        // Validate duration before setting
        const finalDuration = isFinite(adjustedDuration) && adjustedDuration > 0 ? adjustedDuration : maxDuration;
        setDuration(finalDuration);
        
        if (finalDuration === adjustedDuration) {
          console.log(`Set duration to ${finalDuration}s (maxDuration: ${maxDuration}s, maxOffset: ${maxOffset}s)`);
        } else {
          console.error(`Invalid duration calculation: ${adjustedDuration} (maxDuration: ${maxDuration}, maxOffset: ${maxOffset}), using fallback: ${finalDuration}s`);
        }
        
        // Initialize with one full section (0 to finalDuration)
        setVideoSections([{
          id: `section-0-${finalDuration}`,
          startTime: 0,
          endTime: finalDuration,
          isDeleted: false,
          playbackSpeed: 1.0
        }]);
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

  const loadAIFocusSegments = useCallback(async () => {
    if (!editData || aiSegmentsLoaded) return;
    
    try {
      setLoadingAISegments(true);
      console.log('Loading AI focus segments for room:', roomId);
      
      const response = await fetch(`/api/recordings/focus-segments?roomId=${roomId}`);
      if (!response.ok) {
        throw new Error('Failed to load AI focus segments');
      }
      
      const data = await response.json();
      
      // Debug: Log all data from API
      console.log('=== AI SEGMENTS API RESPONSE ===');
      console.log('focusSegments:', data.focusSegments?.length || 0);
      console.log('speedRecommendations:', data.speedRecommendations?.length || 0);
      console.log('cutSegments:', data.cutSegments?.length || 0);
      console.log('Full response:', data);
      
      if (data.focusSegments && data.focusSegments.length > 0) {
        // Convert AI focus segments to the format expected by the editor
        const aiZoomRanges: ZoomRange[] = data.focusSegments.map((segment: {
          id: string;
          start_time: number;
          end_time: number;
          focused_participant_id: string;
          reason: string;
          confidence: number;
          segment_type: 'monologue' | 'conversation' | 'silence';
          recordings?: { id: string };
        }) => {
          // Find the participant recording that matches the focused participant
          const focusedRecording = editData.recordings.find(
            rec => rec.id === segment.recordings?.id || 
                   rec.id === segment.focused_participant_id
          );
          
          const participantIndex = focusedRecording 
            ? editData.recordings.findIndex(rec => rec.id === focusedRecording.id)
            : 0;
          
          return {
            id: `ai-${segment.id}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
            startTime: segment.start_time,
            endTime: segment.end_time,
            focusOn: focusedRecording?.id || editData.recordings[0]?.id,
            participantIndex,
            aiGenerated: true,
            reason: segment.reason,
            confidence: segment.confidence,
            type: segment.segment_type
          };
        });
        
        console.log(`Loaded ${aiZoomRanges.length} AI focus segments`);
        
        // Only add AI segments if we don't already have any AI-generated segments
        setZoomRanges(prev => {
          const hasAISegments = prev.some(range => range.aiGenerated);
          if (hasAISegments) {
            console.log('AI segments already loaded, skipping...');
            return prev;
          }
          return [...prev, ...aiZoomRanges];
        });
        
        // Store AI recommendations if available
        if (data.aiEditingSession?.ai_recommendations) {
          setAiRecommendations(data.aiEditingSession.ai_recommendations);
        }
      }

      // Apply AI cut segments and speed recommendations if available
      let allAIRecommendations: Array<{
        start_time: number;
        end_time: number;
        speed: number;
        reason: string;
        confidence: number;
        type: string;
      }> = [];

      // Add cut segments as speed recommendations with speed = 0
      if (data.cutSegments && data.cutSegments.length > 0) {
        console.log(`Found ${data.cutSegments.length} AI cut segments:`, data.cutSegments);
        const cutRecommendations = data.cutSegments
          .filter((cut: any) => {
            // Apply AI suggestions unless user explicitly rejected them
            const shouldApply = cut.user_approved !== false && cut.ai_generated === true;
            console.log(`Cut segment ${cut.start_time}-${cut.end_time}: applied=${cut.applied}, user_approved=${cut.user_approved}, ai_generated=${cut.ai_generated}, shouldApply=${shouldApply}`);
            return shouldApply;
          })
          .map((cut: any) => ({
            start_time: cut.start_time,
            end_time: cut.end_time,
            speed: 0, // Cut = speed 0
            reason: cut.reason,
            confidence: cut.confidence,
            type: 'cut'
          }));
        console.log(`Converted ${cutRecommendations.length} cut segments to recommendations:`, cutRecommendations);
        allAIRecommendations.push(...cutRecommendations);
      } else {
        console.log('No cut segments found in API response');
      }

      // Add speed recommendations
      if (data.speedRecommendations && data.speedRecommendations.length > 0) {
        console.log(`Found ${data.speedRecommendations.length} AI speed recommendations`);
        allAIRecommendations.push(...data.speedRecommendations);
      }

      if (allAIRecommendations.length > 0) {
        console.log(`Applying ${allAIRecommendations.length} total AI recommendations (cuts + speed changes)`);
        
        // Sort all recommendations by start time
        const sortedRecommendations = [...allAIRecommendations].sort((a, b) => a.start_time - b.start_time);
        
        // Only apply AI recommendations if we have the default single section
        if (videoSections.length === 1 && videoSections[0].startTime === 0 && videoSections[0].endTime === duration) {
          console.log('Applying AI recommendations (cuts + speed changes) using split/delete actions');
          
          // Collect all split points from recommendations (both cuts and speed changes)
          const aiSplitPoints: number[] = [];
          for (const rec of sortedRecommendations) {
            if (rec.start_time > 0 && !aiSplitPoints.includes(rec.start_time)) {
              aiSplitPoints.push(rec.start_time);
            }
            if (rec.end_time < duration && !aiSplitPoints.includes(rec.end_time)) {
              aiSplitPoints.push(rec.end_time);
            }
          }
          
          // Apply splits first
          setSplitPoints(aiSplitPoints.sort((a, b) => a - b));
          
          // Create sections based on splits (same logic as createSplitAtTime)
          const newSections: VideoSection[] = [];
          const allPoints = [0, ...aiSplitPoints.sort((a, b) => a - b), duration];
          
          for (let i = 0; i < allPoints.length - 1; i++) {
            const start = allPoints[i];
            const end = allPoints[i + 1];
            
            // Find if this section matches any AI recommendation (cut or speed change)
            const matchingRec = sortedRecommendations.find(rec => 
              Math.abs(start - rec.start_time) < 0.1 && 
              Math.abs(end - rec.end_time) < 0.1
            );
            
            let isDeleted = false;
            let playbackSpeed = 1.0;
            
            if (matchingRec) {
              isDeleted = matchingRec.speed === 0; // Cut segments have speed = 0
              playbackSpeed = matchingRec.speed === 0 ? 1.0 : matchingRec.speed;
              
              const actionType = matchingRec.type === 'cut' ? 'CUT' : `${playbackSpeed}x speed`;
              console.log(`AI: Section ${start.toFixed(1)}s-${end.toFixed(1)}s -> ${actionType} (${matchingRec.reason})`);
            }
            
            newSections.push({
              id: `section-${start}-${end}`,
              startTime: start,
              endTime: end,
              isDeleted: isDeleted,
              playbackSpeed: playbackSpeed
            });
          }
          
          setVideoSections(newSections);
          const cutSections = newSections.filter(s => s.isDeleted).length;
          const speedSections = newSections.filter(s => !s.isDeleted && s.playbackSpeed !== 1.0).length;
          console.log(`Applied AI recommendations: ${newSections.length} sections created (${cutSections} cuts, ${speedSections} speed changes)`);
        } else {
          console.log('Video sections already customized, keeping existing sections');
        }
      }
      
      setAiSegmentsLoaded(true);
      
    } catch (error) {
      console.error('Error loading AI focus segments:', error);
      // Don't show error to user, just log it - AI segments are optional
    } finally {
      setLoadingAISegments(false);
    }
  }, [roomId, editData, aiSegmentsLoaded, duration, videoSections]);

  useEffect(() => {
    fetchEditData();
  }, [fetchEditData]);
  
  useEffect(() => {
    if (editData && !aiSegmentsLoaded) {
      loadAIFocusSegments();
    }
  }, [editData, loadAIFocusSegments, aiSegmentsLoaded]);

  // Close context menu when clicking elsewhere
  useEffect(() => {
    const handleClickOutside = () => setContextMenu(null);
    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [contextMenu]);

  const togglePlay = () => {
    const newIsPlaying = !isPlaying;
    setIsPlaying(newIsPlaying);

    if (newIsPlaying) {
      console.log("=== PLAYING WITH AUTO-CUT SYNC ===");
      // First, sync all videos to current time (applying cut offsets)
      // Validate currentTime before syncing
      if (!isFinite(currentTime) || currentTime < 0) {
        console.error(`Invalid currentTime in togglePlay: ${currentTime}, resetting to 0`);
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
  const syncAllVideosToTime = useCallback((time: number) => {
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
          console.error(`Invalid video time for ${recordingId}: ${videoTime} (time: ${time}, offset: ${offset})`);
          return;
        }
        
        // Ensure video time doesn't exceed video duration
        if (video.duration && videoTime > video.duration) {
          console.warn(`Video time ${videoTime}s exceeds duration ${video.duration}s for ${recordingId}, clamping to duration`);
          video.currentTime = video.duration;
        } else {
          video.currentTime = videoTime;
        }
        
        console.log(`Video ${recordingId}: timeline ${time}s -> video time ${videoTime}s (cut offset: ${offset}s)`);
      }
    });
  }, [syncOffsets]);

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
          `Exiting focus mode at time ${currentTime}s`
        );
        setFocusedVideo(null);
      }
    }
  }, [currentTime, zoomRanges, focusedVideo]);

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

  // Handle regular timeline clicks (seeking or splitting)
  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const clickTime = percentage * duration;
    
    // Validate click time before proceeding
    if (!isFinite(clickTime) || clickTime < 0 || clickTime > duration) {
      console.error(`Invalid click time: ${clickTime} (percentage: ${percentage}, duration: ${duration})`);
      return;
    }

    if (isSplitMode) {
      // Split mode - create split point
      createSplitAtTime(clickTime);
    } else {
      // Normal mode - seek video
      // Check if clicking on a deleted section
      const clickedSection = videoSections.find(section => 
        clickTime >= section.startTime && clickTime < section.endTime
      );
      
      if (clickedSection && clickedSection.isDeleted) {
        console.log('Cannot seek to deleted section, finding nearest available time');
        // Find nearest non-deleted section
        const availableSections = videoSections.filter(s => !s.isDeleted);
        
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
      // Normal seeking - check for deleted sections
      const clickedSection = videoSections.find(section => 
        clickTime >= section.startTime && clickTime < section.endTime
      );
      
      if (clickedSection && clickedSection.isDeleted) {
        console.log('Cannot seek to deleted section on focus timeline');
        return; // Don't seek to deleted sections
      }
      
      setCurrentTime(clickTime);
      syncAllVideosToTime(clickTime);
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

  // Split/Section functions
  const toggleSplitMode = () => {
    setIsSplitMode(!isSplitMode);
    console.log(`Split mode ${!isSplitMode ? 'enabled' : 'disabled'}`);
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
      
      // Check if this section was previously deleted
      const existingSection = videoSections.find(s => 
        Math.abs(s.startTime - start) < 0.1 && Math.abs(s.endTime - end) < 0.1
      );
      
      newSections.push({
        id: `section-${start}-${end}`,
        startTime: start,
        endTime: end,
        isDeleted: existingSection?.isDeleted || false,
        playbackSpeed: existingSection?.playbackSpeed || 1.0
      });
    }
    
    setVideoSections(newSections);
    console.log(`Created split at ${time}s. Total sections: ${newSections.length}`);
  };

  const deleteSection = (sectionId: string) => {
    setVideoSections(prev => 
      prev.map(section => 
        section.id === sectionId 
          ? { ...section, isDeleted: true }
          : section
      )
    );
    setContextMenu(null);
    console.log(`Deleted section: ${sectionId}`);
  };

  const restoreSection = (sectionId: string) => {
    setVideoSections(prev => 
      prev.map(section => 
        section.id === sectionId 
          ? { ...section, isDeleted: false }
          : section
      )
    );
  };

  const setPlaybackSpeed = (sectionId: string, speed: number) => {
    setVideoSections(prev => 
      prev.map(section => 
        section.id === sectionId 
          ? { ...section, playbackSpeed: speed }
          : section
      )
    );
    setContextMenu(null);
    console.log(`Set playback speed for section ${sectionId}: ${speed}x`);
  };

  const resetSplits = () => {
    setSplitPoints([]);
    setVideoSections([{
      id: `section-0-${duration}`,
      startTime: 0,
      endTime: duration,
      isDeleted: false,
      playbackSpeed: 1.0
    }]);
    console.log('All splits reset');
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
            
            // Apply initial cut offset - start video from its offset point
            const offset = syncOffsets[recording.id] || 0;
            const initialVideoTime = currentTime + offset;
            
            // Validate before setting currentTime
            if (isFinite(initialVideoTime) && initialVideoTime >= 0) {
              // Clamp to video duration if necessary
              const clampedTime = Math.min(initialVideoTime, video.duration || initialVideoTime);
              video.currentTime = clampedTime;
              console.log(`Video ${recording.id}: applying cut offset ${offset}s, starting at ${clampedTime}s`);
            } else {
              console.error(`Invalid initial video time for ${recording.id}: ${initialVideoTime} (currentTime: ${currentTime}, offset: ${offset})`);
              video.currentTime = 0; // Fallback to start
            }
          }}
          onTimeUpdate={(e) => {
            const video = e.currentTarget;
            // Update current time from the focused video, or first video if no focus
            const masterVideoId = focusedVideo || editData?.recordings[0].id;
            if (recording.id === masterVideoId) {
              // Convert video time back to timeline time (remove the cut offset)
              const videoTime = video.currentTime;
              const offset = syncOffsets[recording.id] || 0;
              
              // Validate values before calculation
              if (!isFinite(videoTime) || !isFinite(offset)) {
                console.error(`Invalid values in onTimeUpdate for ${recording.id}: videoTime=${videoTime}, offset=${offset}`);
                return;
              }
              
              const timelineTime = videoTime - offset;
              
              // Validate timeline time before setting
              if (isFinite(timelineTime) && timelineTime >= 0) {
                setCurrentTime(timelineTime);
              } else {
                console.error(`Invalid timeline time for ${recording.id}: ${timelineTime} (videoTime: ${videoTime}, offset: ${offset})`);
                return;
              }
              
              // Check current section and apply playback speed
              const currentSection = videoSections.find(section => 
                timelineTime >= section.startTime && timelineTime < section.endTime
              );
              
              // Apply playback speed for current section
              if (currentSection && !currentSection.isDeleted) {
                Object.values(videoRefs.current).forEach((video) => {
                  if (video && video.playbackRate !== currentSection.playbackSpeed) {
                    video.playbackRate = currentSection.playbackSpeed;
                    console.log(`Applied playback speed ${currentSection.playbackSpeed}x to section ${currentSection.startTime.toFixed(1)}s-${currentSection.endTime.toFixed(1)}s`);
                  }
                });
              }
              
              if (currentSection && currentSection.isDeleted && isPlaying) {
                // Find next non-deleted section
                const nextSection = videoSections
                  .filter(section => !section.isDeleted && section.startTime > timelineTime)
                  .sort((a, b) => a.startTime - b.startTime)[0];
                
                if (nextSection) {
                  const jumpTime = nextSection.startTime;
                  if (isFinite(jumpTime) && jumpTime >= 0) {
                    console.log(`Skipping deleted section ${currentSection.startTime.toFixed(1)}s-${currentSection.endTime.toFixed(1)}s, jumping to ${jumpTime.toFixed(1)}s`);
                    syncAllVideosToTime(jumpTime);
                  } else {
                    console.error(`Invalid jump time: ${jumpTime}`);
                  }
                } else {
                  // No more sections, pause video
                  console.log('Reached end of non-deleted sections, pausing video');
                  setIsPlaying(false);
                  Object.values(videoRefs.current).forEach(v => v?.pause());
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
                ✂️ Video tagliati automaticamente ({Object.keys(syncOffsets).length} offset applicati)
                {editData?.recordings?.some(r => r.recording_started_at) ? '' : ' - usando created_at'}
              </div>
            )}
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
                  className={isSplitMode ? "bg-orange-600 hover:bg-orange-700" : ""}
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
                <div className="text-sm text-gray-500">
                  {splitPoints.length} splits, {videoSections.filter(s => !s.isDeleted).length}/{videoSections.length} sezioni
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
                  <span>Durata finale: {((videoSections.filter(s => !s.isDeleted).reduce((acc, s) => acc + (s.endTime - s.startTime), 0)) / 60).toFixed(1)} min</span>
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
                  </div>
                </div>
              </div>
              <div
                className={`w-full h-8 rounded-full cursor-pointer relative ${
                  isSplitMode ? "bg-orange-100" : "bg-gray-200"
                }`}
                onClick={handleTimelineClick}
              >
                {/* Render video sections */}
                {videoSections.map((section) => (
                  <div
                    key={section.id}
                    className={`absolute top-0 h-full ${
                      section.isDeleted 
                        ? "bg-red-200 opacity-50" 
                        : section.playbackSpeed !== 1.0 
                          ? section.playbackSpeed < 1.0 
                            ? "bg-orange-200" // Slow sections
                            : "bg-blue-200"   // Fast sections
                          : "bg-green-200"    // Normal speed sections
                    } border-l border-r border-gray-400`}
                    style={{
                      left: `${(section.startTime / duration) * 100}%`,
                      width: `${((section.endTime - section.startTime) / duration) * 100}%`,
                    }}
                    title={`Section ${section.startTime.toFixed(1)}s - ${section.endTime.toFixed(1)}s${section.isDeleted ? " (DELETED)" : ` - Velocità: ${section.playbackSpeed}x`}`}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      
                      // Calculate if menu should open upward
                      const windowHeight = window.innerHeight;
                      const clickY = e.clientY;
                      const estimatedMenuHeight = 400; // Approximate menu height with speed options
                      const shouldOpenUpward = clickY + estimatedMenuHeight > windowHeight;
                      
                      setContextMenu({
                        x: e.clientX,
                        y: e.clientY,
                        sectionId: section.id,
                        openUpward: shouldOpenUpward
                      });
                    }}
                  >
                    {section.isDeleted ? (
                      <div className="absolute inset-0 flex items-center justify-center text-xs text-red-600 font-bold">
                        DELETED
                      </div>
                    ) : section.playbackSpeed !== 1.0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-xs font-bold">
                        <span className={`${
                          section.playbackSpeed < 1.0 ? 'text-orange-700' : 'text-blue-700'
                        }`}>
                          {section.playbackSpeed}x
                        </span>
                      </div>
                    ) : null}
                  </div>
                ))}
                
                {/* Split point markers */}
                {splitPoints.map((point) => (
                  <div
                    key={`split-${point}`}
                    className="absolute top-0 h-full w-0.5 bg-orange-600"
                    style={{ left: `${(point / duration) * 100}%` }}
                    title={`Split at ${point.toFixed(1)}s`}
                  />
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
                    className={`absolute top-0 h-full rounded ${
                      range.aiGenerated 
                        ? 'bg-blue-400 bg-opacity-60 border-2 border-blue-500' 
                        : 'bg-green-400 bg-opacity-50'
                    }`}
                    style={{
                      left: `${(range.startTime / duration) * 100}%`,
                      width: `${
                        ((range.endTime - range.startTime) / duration) * 100
                      }%`,
                    }}
                    title={`${range.aiGenerated ? '🤖 AI: ' : ''}Partecipante ${
                      range.participantIndex + 1
                    }: ${range.startTime.toFixed(1)}s - ${range.endTime.toFixed(
                      1
                    )}s${range.reason ? `\nMotivo: ${range.reason}` : ''}${
                      range.confidence ? `\nFiducia: ${(range.confidence * 100).toFixed(0)}%` : ''
                    }`}
                  >
                    {range.aiGenerated && (
                      <div className="absolute -top-1 -right-1 text-xs">🤖</div>
                    )}
                  </div>
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
                            className={`flex items-center justify-between px-4 py-2 hover:bg-gray-100 ${
                              range.aiGenerated ? 'bg-blue-50' : ''
                            }`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {range.aiGenerated && <span className="text-xs">🤖</span>}
                                <span className="text-sm">
                                  Partecipante {range.participantIndex + 1}:{" "}
                                  {range.startTime.toFixed(1)}s -{" "}
                                  {range.endTime.toFixed(1)}s
                                </span>
                              </div>
                              {range.aiGenerated && range.reason && (
                                <div className="text-xs text-gray-600 mt-1">
                                  {range.reason}
                                  {range.confidence && 
                                    ` (${(range.confidence * 100).toFixed(0)}% fiducia)`
                                  }
                                </div>
                              )}
                            </div>
                            <button
                              onClick={() => removeZoomRange(range.id)}
                              className="text-red-500 hover:text-red-700 text-sm ml-2"
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

              {/* AI Recommendations */}
              {aiRecommendations.length > 0 && (
                <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4 mt-4">
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-lg">🤖</span>
                    <h3 className="font-medium text-blue-900">Raccomandazioni AI per l&apos;Editing</h3>
                    {loadingAISegments && (
                      <div className="ml-2 animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {aiRecommendations.map((recommendation, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0"></div>
                        <span className="text-sm text-blue-800">{recommendation}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 text-xs text-blue-600">
                    💡 I segmenti focus evidenziati in blu sono stati generati automaticamente dall&apos;AI
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

      {/* Context Menu */}
      {contextMenu && (
        <div
          className={`fixed bg-white shadow-lg rounded-lg border py-2 z-50 transform transition-all duration-200 ${
            contextMenu.openUpward ? 'origin-bottom' : 'origin-top'
          }`}
          style={{
            left: contextMenu.x,
            ...(contextMenu.openUpward 
              ? { bottom: window.innerHeight - contextMenu.y + 10 } // Open upward with 10px margin
              : { top: contextMenu.y } // Normal downward opening
            ),
          }}
          onMouseLeave={() => setContextMenu(null)}
        >
          {(() => {
            const section = videoSections.find(s => s.id === contextMenu.sectionId);
            if (!section) return null;
            
            return (
              <div>
                <div className="px-4 py-1 text-xs text-gray-500 border-b flex items-center justify-between">
                  <span>Sezione {section.startTime.toFixed(1)}s - {section.endTime.toFixed(1)}s</span>
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
                      <div className="px-3 py-1 text-xs text-gray-500">Velocità riproduzione:</div>
                      {[0.25, 0.5, 0.75, 1.0, 1.1, 1.2, 1.3, 1.5, 2.0, 4.0].map((speed) => (
                        <button
                          key={speed}
                          className={`w-full px-4 py-1 text-left hover:bg-gray-100 text-sm ${
                            section.playbackSpeed === speed ? 'bg-blue-50 text-blue-600 font-medium' : 'text-gray-700'
                          }`}
                          onClick={() => setPlaybackSpeed(section.id, speed)}
                        >
                          {speed === 1.0 ? '🎬' : speed < 1.0 ? '🐌' : '⚡'} {speed}x {speed === 1.0 ? '(normale)' : ''}
                        </button>
                      ))}
                    </div>
                    
                    <button
                      className="w-full px-4 py-2 text-left hover:bg-gray-100 text-red-600"
                      onClick={() => deleteSection(section.id)}
                    >
                      🗑️ Elimina Sezione
                    </button>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
