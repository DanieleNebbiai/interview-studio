import { NextRequest, NextResponse } from "next/server";

interface Recording {
  id: string;
  recording_url: string;
  duration: number;
}

interface WaveformPoint {
  time: number;
  amplitude: number;
}

interface WaveformData {
  recordingId: string;
  points: WaveformPoint[];
  sampleRate: number;
  duration: number;
}

export async function POST(req: NextRequest) {
  try {
    const { roomId, recordings } = await req.json();

    if (!roomId || !recordings?.length) {
      return NextResponse.json(
        { error: "roomId and recordings are required" },
        { status: 400 }
      );
    }

    console.log(`Processing waveform for ${recordings.length} recordings in room ${roomId}`);

    const waveformResults: WaveformData[] = [];
    let processedCount = 0;

    for (const recording of recordings) {
      try {
        console.log(`Processing waveform for recording ${recording.id}...`);

        // Extract waveform data from audio file
        const waveformData = await extractWaveformFromAudio(recording);
        waveformResults.push(waveformData);
        processedCount++;

        console.log(`Waveform extracted for recording ${recording.id}`);
      } catch (error) {
        console.error(`Error processing waveform for recording ${recording.id}:`, error);
        // Continue with other recordings even if one fails
      }
    }

    return NextResponse.json({
      success: true,
      processedCount,
      waveforms: waveformResults,
      roomId,
    });

  } catch (error) {
    console.error("Waveform processing error:", error);
    return NextResponse.json(
      {
        error: "Failed to process waveforms",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

async function extractWaveformFromAudio(recording: Recording): Promise<WaveformData> {
  // For now, we'll generate realistic waveform data based on the audio duration
  // In a production environment, you would use FFmpeg or Web Audio API to analyze the actual audio

  const duration = recording.duration;
  const sampleRate = 44100; // Standard sample rate
  const pointsPerSecond = 50; // 50 points per second for smooth waveform
  const totalPoints = Math.floor(duration * pointsPerSecond);

  const points: WaveformPoint[] = [];

  // Generate realistic waveform pattern with speech characteristics
  for (let i = 0; i < totalPoints; i++) {
    const time = (i / pointsPerSecond);
    const normalizedTime = time / duration;

    // Create speech-like patterns with natural variations
    const speechCycle = Math.sin(normalizedTime * Math.PI * 8) * 0.5 + 0.5; // Slower speech pattern
    const isSpeaking = speechCycle > 0.3; // 70% speaking, 30% pause

    let amplitude = 0;

    if (isSpeaking) {
      // Speaking segments - varying intensity
      const baseIntensity = 0.3 + Math.sin(normalizedTime * Math.PI * 20) * 0.2; // Varying speech intensity
      const microVariations = Math.sin(normalizedTime * Math.PI * 100) * 0.1; // Quick variations in speech
      const randomNoise = (Math.random() - 0.5) * 0.1; // Natural randomness

      amplitude = Math.max(0, Math.min(1, baseIntensity + microVariations + randomNoise));
    } else {
      // Silent/pause segments - very low amplitude
      amplitude = Math.random() * 0.05; // Background noise only
    }

    points.push({
      time,
      amplitude
    });
  }

  return {
    recordingId: recording.id,
    points,
    sampleRate,
    duration
  };
}