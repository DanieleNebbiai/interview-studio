import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

interface WordTimestamp {
  word: string
  start: number
  end: number
  confidence?: number
}

interface Transcription {
  recordingId: string
  text: string
  wordTimestamps: WordTimestamp[]
  language: string
  duration: number
  confidence?: number
  wordCount: number
}

interface FocusSegment {
  id: string
  startTime: number
  endTime: number
  focusedParticipantId: string
  reason: string
  confidence: number
  type: 'monologue' | 'conversation' | 'silence'
}

interface AIEditingResult {
  roomId: string
  focusSegments: FocusSegment[]
  totalDuration: number
  analysisConfidence: number
  aiRecommendations: string[]
  processingTime: number
}

export async function POST(request: NextRequest) {
  const startTime = Date.now()
  
  try {
    const { roomId, transcriptions, recordings } = await request.json()

    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY not configured')
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      )
    }

    if (!transcriptions || !Array.isArray(transcriptions)) {
      return NextResponse.json(
        { error: 'Transcriptions array is required' },
        { status: 400 }
      )
    }

    console.log(`Starting AI editing analysis for room: ${roomId}`)
    console.log(`Analyzing ${transcriptions.length} transcriptions`)

    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Combine all transcriptions to understand conversation flow
    const combinedAnalysis = await analyzeConversationFlow(openai, transcriptions, recordings)
    
    const focusSegments = await generateFocusSegments(openai, combinedAnalysis, transcriptions)
    
    const aiRecommendations = generateEditingRecommendations(combinedAnalysis, focusSegments)

    const totalDuration = Math.max(...transcriptions.map((t: Transcription) => t.duration))
    
    const result: AIEditingResult = {
      roomId,
      focusSegments,
      totalDuration,
      analysisConfidence: combinedAnalysis.confidence,
      aiRecommendations,
      processingTime: Date.now() - startTime
    }

    console.log(`AI editing analysis completed in ${result.processingTime}ms`)
    console.log(`Generated ${focusSegments.length} focus segments`)

    return NextResponse.json({
      success: true,
      result,
      message: `AI editing completato: ${focusSegments.length} segmenti focus generati`
    })

  } catch (error) {
    console.error('Error in AI editing process:', error)
    return NextResponse.json(
      { error: 'Internal server error during AI editing' },
      { status: 500 }
    )
  }
}

async function analyzeConversationFlow(
  openai: OpenAI, 
  transcriptions: Transcription[], 
  recordings: any[]
) {
  // Create a comprehensive analysis of the conversation
  const fullConversationText = transcriptions
    .map((t, index) => `[Partecipante ${index + 1} - ${t.recordingId}]: ${t.text}`)
    .join('\n\n')

  const analysisPrompt = `
Analizza questa conversazione tra più partecipanti e identifica i pattern di comunicazione:

${fullConversationText}

Fornisci un'analisi strutturata in formato JSON con:
1. "participants": numero di partecipanti attivi
2. "conversationType": "interview", "meeting", "discussion", "presentation"
3. "speakingPatterns": array di oggetti con partecipante e pattern (es. "monologue", "frequent_interruptions", "listener")
4. "keyMoments": array di momenti importanti con timestamp approssimativi
5. "energyLevels": valutazione dell'energia della conversazione nel tempo
6. "focusRecommendations": raccomandazioni per i focus segments
7. "confidence": livello di confidenza dell'analisi (0-1)

Rispondi SOLO con JSON valido, senza altro testo.`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content: 'Sei un esperto di editing video e analisi conversazionale. Analizza le conversazioni per ottimizzare l\'editing video.'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 1500
    })

    const analysisText = response.choices[0]?.message?.content?.trim()
    if (!analysisText) {
      throw new Error('No analysis received from OpenAI')
    }

    return JSON.parse(analysisText)
  } catch (error) {
    console.error('Error in conversation analysis:', error)
    return {
      participants: transcriptions.length,
      conversationType: 'discussion',
      speakingPatterns: [],
      keyMoments: [],
      energyLevels: 'medium',
      focusRecommendations: [],
      confidence: 0.5
    }
  }
}

async function generateFocusSegments(
  openai: OpenAI,
  conversationAnalysis: any,
  transcriptions: Transcription[]
): Promise<FocusSegment[]> {
  const focusSegments: FocusSegment[] = []

  // For each transcription, analyze speech patterns to determine focus segments
  for (let i = 0; i < transcriptions.length; i++) {
    const transcription = transcriptions[i]
    const participant = `participant_${i + 1}`
    
    // Analyze word timing to find continuous speech segments (monologues)
    const speechSegments = findContinuousSpeechSegments(transcription.wordTimestamps)
    
    for (const segment of speechSegments) {
      // Only create focus if segment is longer than 3 seconds (meaningful content)
      if (segment.duration >= 3) {
        const shouldFocus = await shouldCreateFocusSegment(
          openai, 
          segment.text, 
          segment.duration,
          conversationAnalysis
        )

        if (shouldFocus.focus) {
          focusSegments.push({
            id: `focus_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            startTime: segment.startTime,
            endTime: segment.endTime,
            focusedParticipantId: participant,
            reason: shouldFocus.reason,
            confidence: shouldFocus.confidence,
            type: shouldFocus.type
          })
        }
      }
    }
  }

  // Sort focus segments by start time
  return focusSegments.sort((a, b) => a.startTime - b.startTime)
}

function findContinuousSpeechSegments(words: WordTimestamp[]): Array<{
  startTime: number
  endTime: number
  duration: number
  text: string
  wordCount: number
}> {
  if (words.length === 0) return []

  const segments = []
  const maxPauseDuration = 2.0 // 2 seconds max pause to still be considered continuous
  const minSegmentDuration = 1.0 // Minimum 1 second to be a segment

  let currentSegmentWords: WordTimestamp[] = []
  let currentSegmentStart = words[0].start

  for (let i = 0; i < words.length; i++) {
    const currentWord = words[i]
    const nextWord = words[i + 1]

    currentSegmentWords.push(currentWord)

    // Check if this is the end of a segment
    const isLastWord = i === words.length - 1
    const hasLongPause = nextWord && (nextWord.start - currentWord.end) > maxPauseDuration

    if (isLastWord || hasLongPause) {
      const segmentDuration = currentWord.end - currentSegmentStart

      if (segmentDuration >= minSegmentDuration) {
        segments.push({
          startTime: currentSegmentStart,
          endTime: currentWord.end,
          duration: segmentDuration,
          text: currentSegmentWords.map(w => w.word).join(''),
          wordCount: currentSegmentWords.length
        })
      }

      // Reset for next segment
      if (nextWord) {
        currentSegmentWords = []
        currentSegmentStart = nextWord.start
      }
    }
  }

  return segments
}

async function shouldCreateFocusSegment(
  openai: OpenAI,
  text: string,
  duration: number,
  conversationAnalysis: any
): Promise<{ focus: boolean; reason: string; confidence: number; type: 'monologue' | 'conversation' | 'silence' }> {
  // Quick heuristic rules first
  if (duration < 3) {
    return { focus: false, reason: 'Too short', confidence: 0.9, type: 'conversation' }
  }

  if (duration > 15) {
    return { focus: true, reason: 'Long monologue detected', confidence: 0.95, type: 'monologue' }
  }

  // For medium-length segments, use AI to analyze content quality
  const analysisPrompt = `
Analizza questo segmento di conversazione e determina se dovrebbe essere messo in focus durante l'editing video:

Testo: "${text}"
Durata: ${duration} secondi
Contesto conversazione: ${JSON.stringify(conversationAnalysis)}

Criteri per il focus:
- Contenuto importante o interessante
- Monologhi significativi (>5 secondi)
- Momenti di spiegazione o storytelling
- Risposte articolate a domande

NON mettere in focus:
- Filler words o hesitazioni eccessive
- Risposte brevi o monosillabiche
- Interruzioni o sovrapposizioni

Rispondi SOLO con JSON nel formato:
{
  "focus": true/false,
  "reason": "spiegazione breve",
  "confidence": 0.0-1.0,
  "type": "monologue"|"conversation"|"silence"
}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'Sei un esperto editor video. Analizza i segmenti per determinare quali meritano il focus visivo.'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      temperature: 0.2,
      max_tokens: 200
    })

    const analysisText = response.choices[0]?.message?.content?.trim()
    if (analysisText) {
      return JSON.parse(analysisText)
    }
  } catch (error) {
    console.error('Error analyzing focus segment:', error)
  }

  // Fallback heuristic
  const wordCount = text.split(' ').length
  const wordsPerSecond = wordCount / duration
  
  // Focus if speaking at good pace (1.5-3 words per second) and substantial content
  if (wordsPerSecond >= 1.5 && wordsPerSecond <= 3 && wordCount >= 10) {
    return { focus: true, reason: 'Good speaking pace with substantial content', confidence: 0.7, type: 'monologue' }
  }

  return { focus: false, reason: 'Not substantial enough for focus', confidence: 0.6, type: 'conversation' }
}

function generateEditingRecommendations(
  conversationAnalysis: any,
  focusSegments: FocusSegment[]
): string[] {
  const recommendations: string[] = []

  if (focusSegments.length === 0) {
    recommendations.push('Nessun focus segment identificato - mantieni layout grid per tutta la conversazione')
  } else {
    recommendations.push(`${focusSegments.length} focus segments identificati per migliorare l'engagement`)
  }

  const monologues = focusSegments.filter(f => f.type === 'monologue')
  if (monologues.length > 0) {
    recommendations.push(`${monologues.length} monologhi lunghi identificati - usa questi momenti per focus`)
  }

  if (conversationAnalysis.conversationType === 'interview') {
    recommendations.push('Conversazione tipo intervista - alterna focus tra intervistatore e intervistato')
  } else if (conversationAnalysis.conversationType === 'presentation') {
    recommendations.push('Presentazione identificata - mantieni focus sul presentatore principale')
  }

  const totalFocusTime = focusSegments.reduce((sum, f) => sum + (f.endTime - f.startTime), 0)
  const focusPercentage = (totalFocusTime / conversationAnalysis.totalDuration) * 100

  if (focusPercentage > 70) {
    recommendations.push('Alto utilizzo del focus - considera di ridurre per evitare eccessivo switching')
  } else if (focusPercentage < 20) {
    recommendations.push('Basso utilizzo del focus - potresti aggiungere più momenti di focus manualmente')
  }

  return recommendations
}