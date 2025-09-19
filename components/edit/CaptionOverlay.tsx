"use client";

import { useMemo } from "react";
import { groupWordsIntoPhases, getCurrentPhrase, getWordStates } from "@/lib/caption-utils";

interface Word {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

interface Transcription {
  id: string;
  transcript_text: string;
  word_timestamps: {
    words: Word[];
    wordCount: number;
    totalDuration: number;
  };
}

interface CaptionOverlayProps {
  transcriptions: Transcription[];
  currentTime: number;
  isEnabled: boolean;
  size: "small" | "medium" | "large";
}

export function CaptionOverlay({
  transcriptions,
  currentTime,
  isEnabled,
  size
}: CaptionOverlayProps) {
  // Combine all words from all transcriptions and group into phrases
  const phrases = useMemo(() => {
    const allWords: Word[] = [];

    transcriptions.forEach((transcription) => {
      if (transcription.word_timestamps?.words) {
        allWords.push(...transcription.word_timestamps.words);
      }
    });

    // Sort by start time
    allWords.sort((a, b) => a.start - b.start);

    // Group into phrases using the same logic as export worker
    return groupWordsIntoPhases(allWords, 0.5); // 0.5s gap threshold
  }, [transcriptions]);

  const currentPhrase = useMemo(() => {
    return getCurrentPhrase(phrases, currentTime);
  }, [phrases, currentTime]);

  const wordStates = useMemo(() => {
    if (!currentPhrase) return [];
    return getWordStates(currentPhrase, currentTime);
  }, [currentPhrase, currentTime]);

  if (!isEnabled || !currentPhrase) {
    return null;
  }

  const sizeClasses = {
    small: "text-xl",
    medium: "text-2xl",
    large: "text-3xl"
  };

  return (
    <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-10">
      <div className="bg-black/80 backdrop-blur-sm rounded-lg px-4 py-2 max-w-4xl">
        <div className={`text-white font-bold text-center ${sizeClasses[size]}`}>
          {currentPhrase.words.map((word, index) => {
            const state = wordStates[index];
            return (
              <span
                key={index}
                className={`transition-all duration-200 ${
                  state === 'current'
                    ? "text-white font-bold"
                    : state === 'spoken'
                    ? "text-white"
                    : "text-gray-400"
                }`}
                style={{
                  textShadow: "2px 2px 4px rgba(0,0,0,0.8)"
                }}
              >
                {word.word}
                {index < currentPhrase.words.length - 1 ? " " : ""}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}