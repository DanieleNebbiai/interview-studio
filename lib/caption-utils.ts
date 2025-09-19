interface Word {
  word: string;
  start: number;
  end: number;
  confidence?: number;
}

interface CaptionPhrase {
  text: string;
  startTime: number;
  endTime: number;
  words: Word[];
}

// Group words into phrases based on natural pauses (same logic as export-utils.ts)
export function groupWordsIntoPhases(words: Word[], gapThreshold = 0.5): CaptionPhrase[] {
  const phrases: CaptionPhrase[] = [];
  let currentChunk: Word[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const nextWord = words[i + 1];

    currentChunk.push(word);

    // Check if we should end this chunk (same logic as export worker)
    const shouldEndChunk = !nextWord || // Last word
      (nextWord.start - word.end > gapThreshold); // Gap too large

    if (shouldEndChunk && currentChunk.length > 0) {
      const chunkStart = currentChunk[0].start;
      const chunkEnd = currentChunk[currentChunk.length - 1].end;

      phrases.push({
        text: currentChunk.map(w => w.word).join(' '),
        startTime: chunkStart,
        endTime: chunkEnd,
        words: [...currentChunk]
      });

      currentChunk = [];
    }
  }

  return phrases;
}

// Get the phrase that should be displayed at current time
export function getCurrentPhrase(phrases: CaptionPhrase[], currentTime: number): CaptionPhrase | null {
  return phrases.find(phrase =>
    currentTime >= phrase.startTime && currentTime <= phrase.endTime
  ) || null;
}

// Get which words should be highlighted (spoken) at current time
// Returns: 'current' | 'spoken' | 'unspoken' for each word
export function getWordStates(phrase: CaptionPhrase, currentTime: number): ('current' | 'spoken' | 'unspoken')[] {
  return phrase.words.map(word => {
    if (currentTime >= word.start && currentTime <= word.end) {
      return 'current'; // Currently being spoken
    } else if (currentTime > word.end) {
      return 'spoken'; // Already spoken - should stay white
    } else {
      return 'unspoken'; // Not yet spoken - should be gray
    }
  });
}