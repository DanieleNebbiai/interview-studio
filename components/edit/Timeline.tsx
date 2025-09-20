"use client";

interface VideoSection {
  id: string;
  startTime: number;
  endTime: number;
  isDeleted: boolean;
  playbackSpeed: number;
  focusedParticipantId?: string;
}

interface WaveformPoint {
  time: number;
  amplitude: number;
}

interface Waveform {
  id: string;
  waveform_data: {
    points: WaveformPoint[];
    sampleRate: number;
    duration: number;
  };
  sample_rate: number;
  duration: number;
  points_count: number;
}

interface Recording {
  id: string;
  recording_url: string;
  duration: number;
  file_size: number;
  recording_started_at?: string;
  created_at?: string;
  waveforms?: Waveform[];
}

interface TimelineProps {
  duration: number;
  currentTime: number;
  videoSections: VideoSection[];
  splitPoints: number[];
  isSplitMode: boolean;
  isDraggingSplit: boolean;
  draggingSplitIndex: number | null;
  recordings: Recording[];
  onTimelineClick: (event: React.MouseEvent<HTMLDivElement>) => void;
  onSplitMouseMove: (event: React.MouseEvent<HTMLDivElement>) => void;
  onSplitMouseUp: () => void;
  onSectionContextMenu: (event: React.MouseEvent, sectionId: string) => void;
  onSplitMouseDown: (event: React.MouseEvent, splitIndex: number) => void;
  onSplitContextMenu: (event: React.MouseEvent, splitIndex: number) => void;
}

// Function to create smooth curved path using spline interpolation
const createSmoothPath = (points: string[]): string => {
  if (points.length < 2) return `M 0,100 L 100,100 Z`;

  // Parse points to coordinates
  const coords = points.map((point) => {
    const [x, y] = point.split(",").map(Number);
    return { x, y };
  });

  // Start from bottom-left, trace the waveform smoothly, then close at bottom-right
  let path = `M 0,100 L ${coords[0].x},100 `;

  // Create smooth curves using quadratic Bézier curves
  for (let i = 0; i < coords.length - 1; i++) {
    const current = coords[i];
    const next = coords[i + 1];

    if (i === 0) {
      // First point - start curve
      path += `Q ${current.x},${current.y} ${(current.x + next.x) / 2},${
        (current.y + next.y) / 2
      } `;
    } else if (i === coords.length - 2) {
      // Last point - end curve
      path += `Q ${current.x},${current.y} ${next.x},${next.y} `;
    } else {
      // Middle points - smooth curve
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      path += `Q ${current.x},${current.y} ${midX},${midY} `;
    }
  }

  // Close the path at bottom-right
  const lastPoint = coords[coords.length - 1];
  path += `L ${lastPoint.x},100 L 100,100 Z`;

  return path;
};

export function Timeline({
  duration,
  currentTime,
  videoSections,
  splitPoints,
  isSplitMode,
  isDraggingSplit,
  draggingSplitIndex,
  recordings,
  onTimelineClick,
  onSplitMouseMove,
  onSplitMouseUp,
  onSectionContextMenu,
  onSplitMouseDown,
  onSplitContextMenu,
}: TimelineProps) {
  // Generate timestamp markers (every 30 seconds + start/end)
  const generateTimestamps = () => {
    const timestamps = [0]; // Start
    const interval = 30; // 30 seconds

    for (let time = interval; time < duration; time += interval) {
      timestamps.push(time);
    }

    if (duration > 0 && timestamps[timestamps.length - 1] !== duration) {
      timestamps.push(duration); // End
    }

    return timestamps;
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  const timestamps = generateTimestamps();

  return (
    <div className="space-y-4">
      {/* Timestamp markers */}
      <div className="relative h-6">
        {timestamps.map((time, index) => (
          <div
            key={index}
            className="absolute text-xs text-muted-foreground"
            style={{
              left: `${(time / duration) * 100}%`,
              transform: "translateX(-50%)",
            }}
          >
            {formatTime(time)}
          </div>
        ))}
      </div>

      {/* Timeline container */}
      <div
        className="relative w-full h-16 cursor-pointer"
        onClick={onTimelineClick}
        onMouseMove={onSplitMouseMove}
        onMouseUp={onSplitMouseUp}
        onMouseLeave={onSplitMouseUp}
      >
        {/* Timeline segments */}
        {videoSections
          .filter((section) => !section.isDeleted)
          .map((section) => {
            const segmentDuration = section.endTime - section.startTime;
            const focusedParticipant = section.focusedParticipantId
              ? recordings.findIndex(
                  (r) => r.id === section.focusedParticipantId
                ) + 1
              : null;

            // Generate waveform from real audio data or fallback to simulation
            const generateWaveform = () => {
              // Find the focused recording's waveform data
              const focusedRecording = section.focusedParticipantId
                ? recordings.find((r) => r.id === section.focusedParticipantId)
                : recordings[0]; // Default to first recording if no focus

              if (focusedRecording?.waveforms?.[0]?.waveform_data?.points) {
                // Use real waveform data
                const waveformData =
                  focusedRecording.waveforms[0].waveform_data;
                const points = [];

                // Calculate which part of the waveform corresponds to this section
                const sectionStartRatio = section.startTime / duration;
                const sectionEndRatio = section.endTime / duration;

                // Filter points within the section time range
                const sectionPoints = waveformData.points.filter((point) => {
                  const pointRatio = point.time / waveformData.duration;
                  return (
                    pointRatio >= sectionStartRatio &&
                    pointRatio <= sectionEndRatio
                  );
                });

                // Convert to SVG path format for smooth curves
                for (let i = 0; i < sectionPoints.length; i++) {
                  const point = sectionPoints[i];
                  const x = (i / (sectionPoints.length - 1 || 1)) * 100;
                  const height = point.amplitude * 60; // Increased from 20 to 60 for much higher amplitude
                  // Only upper half - attach to bottom (y=100)
                  const y = 100 - height; // Start from bottom and go up
                  points.push(`${x},${Math.max(y, 0)}`); // Ensure we don't go above container
                }

                return points.length > 0 ? points : generateFallbackWaveform();
              } else {
                // Fallback to simulated waveform
                return generateFallbackWaveform();
              }
            };

            const generateFallbackWaveform = () => {
              const points = [];
              const numPoints = Math.max(20, Math.floor(segmentDuration * 2));

              for (let i = 0; i < numPoints; i++) {
                const x = (i / (numPoints - 1)) * 100;

                // Create speech pattern with pauses (more realistic)
                const speechCycle = Math.sin(i * 0.15) * 0.5 + 0.5; // Slow wave for speech/pause pattern
                const isSpeaking = speechCycle > 0.3; // 70% speaking, 30% pause

                if (isSpeaking) {
                  // Varying speech intensity
                  const intensity = Math.sin(i * 0.8) * 0.3 + 0.7;
                  const variation =
                    Math.sin(i * 2.1) * 0.4 + Math.cos(i * 1.7) * 0.3;
                  const height = (25 + variation * 20) * intensity; // Increased amplitude
                  // Only upper half - attach to bottom (y=100)
                  const y = 100 - height;
                  points.push(`${x},${Math.max(y, 0)}`);
                } else {
                  // Silent periods - very low amplitude
                  const silentNoise = Math.random() * 5 + 2; // Increased background noise visibility
                  const y = 100 - silentNoise;
                  points.push(`${x},${Math.max(y, 95)}`); // Keep silence near bottom
                }
              }
              return points;
            };

            const waveformPoints = generateWaveform();

            return (
              <div
                key={section.id}
                className="absolute top-0 h-full 
                bg-orange-400 rounded-xl border 
               border-amber-100/20 overflow-hidden
                shadow-[inset_0_16px_16px_rgba(0,0,0,0.2)] "
                style={{
                  left: `${(section.startTime / duration) * 100}%`,
                  width: `${
                    ((section.endTime - section.startTime) / duration) * 100
                  }%`,
                  minWidth: "80px", // Minimum width to show content
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  onSectionContextMenu(e, section.id);
                }}
              >
                {/* Audio waveform background */}
                <svg
                  className="absolute inset-0 w-full h-full opacity-70"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                >
                  {waveformPoints.length > 0 && (
                    <>
                      {/* Single smooth curved waveform with spline interpolation */}
                      <path
                        d={createSmoothPath(waveformPoints)}
                        fill="white"
                        fillOpacity="0.5"
                        stroke="none"
                      />
                    </>
                  )}
                </svg>

                {/* Content overlay */}
                <div className="relative z-10 h-full flex items-center justify-center text-black text-xs font-medium">
                  <div className="text-center leading-tight bg-white/20 backdrop-blur-sm rounded px-2 py-1">
                    <div className="font-semibold">
                      {Math.round(segmentDuration)}s
                    </div>
                    <div className="text-[10px] opacity-90">
                      {section.playbackSpeed}x
                      {focusedParticipant && (
                        <span className="ml-1">• P{focusedParticipant}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

        {/* Current time indicator */}
        <div
          className="absolute top-0 w-0.5 h-full bg-white shadow-lg z-10"
          style={{
            left: `${(currentTime / duration) * 100}%`,
          }}
        >
          <div className="absolute -top-1 -left-1 w-3 h-3 bg-white rounded-full shadow-lg"></div>
        </div>

        {/* Split points */}
        {isSplitMode &&
          splitPoints.map((splitTime, index) => (
            <div
              key={index}
              className={`absolute top-0 w-1 h-full bg-red-500 cursor-ew-resize z-20 ${
                isDraggingSplit && draggingSplitIndex === index
                  ? "bg-red-600"
                  : ""
              }`}
              style={{
                left: `${(splitTime / duration) * 100}%`,
              }}
              onMouseDown={(e) => onSplitMouseDown(e, index)}
              onContextMenu={(e) => {
                e.preventDefault();
                onSplitContextMenu(e, index);
              }}
            >
              <div className="absolute -top-2 -left-1 w-3 h-3 bg-red-500 rounded-full"></div>
            </div>
          ))}
      </div>

      {/* Timeline info */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Final duration:{" "}
          {Math.round(
            videoSections
              .filter((s) => !s.isDeleted)
              .reduce((acc, s) => acc + (s.endTime - s.startTime), 0)
          )}
          s
        </span>
        <span>{videoSections.filter((s) => !s.isDeleted).length} segments</span>
      </div>
    </div>
  );
}
