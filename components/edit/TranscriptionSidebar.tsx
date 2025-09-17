'use client'

interface Transcription {
  id: string
  transcript_text: string
  word_timestamps: {
    words: Array<{
      word: string
      start: number
      end: number
    }>
    wordCount: number
    totalDuration: number
  }
}

interface TranscriptionSidebarProps {
  transcriptions: Transcription[]
}

export function TranscriptionSidebar({ transcriptions }: TranscriptionSidebarProps) {
  return (
    <div className="fixed right-6 top-20 bottom-6 w-80 bg-white rounded-lg shadow-lg p-4 overflow-hidden flex flex-col">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Trascrizioni
      </h3>

      <div className="flex-1 overflow-y-auto space-y-6">
        {transcriptions.length > 0 ? (
          transcriptions.map((transcription, index) => (
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
  )
}