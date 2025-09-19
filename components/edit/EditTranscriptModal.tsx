"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { groupWordsIntoPhases } from "@/lib/caption-utils";

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

interface EditTranscriptModalProps {
  isOpen: boolean;
  onClose: () => void;
  transcriptions: Transcription[];
  onSave: (updatedTranscriptions: Transcription[]) => void;
}

export function EditTranscriptModal({
  isOpen,
  onClose,
  transcriptions,
  onSave,
}: EditTranscriptModalProps) {
  const [editedTranscriptions, setEditedTranscriptions] = useState<
    Transcription[]
  >([]);

  useEffect(() => {
    setEditedTranscriptions(transcriptions);
  }, [transcriptions]);

  // Group words into phrases for each transcription
  const phrasesPerTranscription = editedTranscriptions.map(transcription => {
    if (!transcription.word_timestamps?.words) return [];
    return groupWordsIntoPhases(transcription.word_timestamps.words, 0.5);
  });

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}:${ms.toString().padStart(2, "0")}`;
  };

  const updatePhraseText = (
    transcriptionId: string,
    phraseIndex: number,
    newText: string
  ) => {
    setEditedTranscriptions((prev) =>
      prev.map((transcription) => {
        if (transcription.id !== transcriptionId) return transcription;

        const transcriptionIndex = editedTranscriptions.findIndex(t => t.id === transcriptionId);
        const phrases = phrasesPerTranscription[transcriptionIndex];
        const phrase = phrases[phraseIndex];

        if (!phrase) return transcription;

        // Split new text into words
        const newWords = newText.trim().split(/\s+/);

        // Update the words with new text, keeping original timing
        const updatedWords = [...transcription.word_timestamps.words];

        // Find the start and end indices of this phrase in the original words array
        const phraseStartIndex = transcription.word_timestamps.words.findIndex(
          w => w.start === phrase.startTime
        );

        if (phraseStartIndex === -1) return transcription;

        // Replace the phrase words with new words, distributing timing evenly
        const phraseDuration = phrase.endTime - phrase.startTime;
        const wordDuration = phraseDuration / Math.max(newWords.length, 1);

        // Remove old phrase words and insert new ones
        updatedWords.splice(phraseStartIndex, phrase.words.length);

        newWords.forEach((word, index) => {
          const wordStart = phrase.startTime + (index * wordDuration);
          const wordEnd = phrase.startTime + ((index + 1) * wordDuration);

          updatedWords.splice(phraseStartIndex + index, 0, {
            word: word,
            start: wordStart,
            end: Math.min(wordEnd, phrase.endTime)
          });
        });

        // Update the transcript_text to match
        const newTranscriptText = updatedWords.map((w) => w.word).join(" ");

        return {
          ...transcription,
          transcript_text: newTranscriptText,
          word_timestamps: {
            ...transcription.word_timestamps,
            words: updatedWords,
          },
        };
      })
    );
  };

  const handleSave = () => {
    onSave(editedTranscriptions);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex flex-row items-center justify-between">
          <DialogTitle>Edit Transcript</DialogTitle>
          <div className="flex gap-2">
            <Button onClick={handleSave} size="sm">
              <Save className="h-4 w-4 mr-2" />
              Update transcript
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-6 mt-4">
          {editedTranscriptions.map((transcription, transcriptionIndex) => {
            const phrases = phrasesPerTranscription[transcriptionIndex] || [];

            return (
              <div key={transcription.id} className="space-y-4">
                <h4 className="font-medium text-foreground">
                  Participant {transcriptionIndex + 1}
                </h4>

                <div className="space-y-3">
                  {phrases.map((phrase, phraseIndex) => (
                    <div
                      key={phraseIndex}
                      className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="text-xs text-muted-foreground font-mono min-w-[120px]">
                        {formatTime(phrase.startTime)} → {formatTime(phrase.endTime)}
                      </div>

                      <input
                        type="text"
                        value={phrase.text}
                        onChange={(e) =>
                          updatePhraseText(
                            transcription.id,
                            phraseIndex,
                            e.target.value
                          )
                        }
                        className="flex-1 bg-background border border-border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        placeholder="Phrase"
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
