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

interface SpeedRecommendation {
  startTime: number
  endTime: number
  speed: number
  reason: string
  confidence: number
  type: 'accelerate' | 'slow_down'
}

interface CutSegment {
  id: string
  startTime: number
  endTime: number
  reason: string
  confidence: number
  segmentType: 'silence' | 'filler_words' | 'repetition' | 'low_energy' | 'gap'
}

interface ValidSegment {
  startTime: number
  endTime: number
  reason: string
  confidence: number
  quality: 'high' | 'medium' | 'low'
}

interface AIEditingResult {
  roomId: string
  focusSegments: FocusSegment[]
  speedRecommendations: SpeedRecommendation[]
  cutSegments: CutSegment[]
  validSegments: ValidSegment[]
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
    
    // Process AI analysis results
    const totalDuration = Math.max(...transcriptions.map((t: Transcription) => t.duration))
    const validSegments = processValidSegments(combinedAnalysis.validSegments || [], totalDuration)
    const cutSegments = generateCutSegments(validSegments, totalDuration)
    const speedRecommendations = processSpeedRecommendations(combinedAnalysis.speedRecommendations || [], totalDuration)
    
    const aiRecommendations = generateEditingRecommendations(combinedAnalysis, focusSegments)

    const result: AIEditingResult = {
      roomId,
      focusSegments,
      speedRecommendations,
      cutSegments,
      validSegments,
      totalDuration,
      analysisConfidence: combinedAnalysis.confidence,
      aiRecommendations,
      processingTime: Date.now() - startTime
    }

    console.log(`AI editing analysis completed in ${result.processingTime}ms`)
    console.log(`Generated ${focusSegments.length} focus segments`)
    console.log(`Generated ${validSegments.length} valid segments to keep`)
    console.log(`Generated ${cutSegments.length} cut segments to remove`)
    console.log(`Generated ${speedRecommendations.length} speed recommendations`)

    return NextResponse.json({
      success: true,
      result,
      message: `AI editing completato: ${validSegments.length} segmenti validi, ${cutSegments.length} segmenti da tagliare, ${focusSegments.length} focus e ${speedRecommendations.length} raccomandazioni velocità generati`
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
Analizza questa conversazione tra più partecipanti e identifica i pattern di comunicazione per ottimizzare l'editing video:

${fullConversationText}

Fornisci un'analisi strutturata in formato JSON con:
1. "participants": numero di partecipanti attivi
2. "conversationType": "interview", "meeting", "discussion", "presentation"
3. "speakingPatterns": array di oggetti con partecipante e pattern (es. "monologue", "frequent_interruptions", "listener")
4. "keyMoments": array di momenti importanti con timestamp approssimativi
5. "energyLevels": valutazione dell'energia della conversazione nel tempo
6. "focusRecommendations": raccomandazioni per i focus segments
7. "validSegments": array dei segmenti da MANTENERE nel video finale:
   - Identifica solo le parti di conversazione interessanti, utili, coinvolgenti
   - Tutto il resto verrà automaticamente tagliato
   - Formato: {"startTime": seconds, "endTime": seconds, "reason": string, "confidence": 0-1, "quality": "high"|"medium"|"low"}
   - Esempi di segmenti validi: risposte articolate, spiegazioni, momenti chiave, storytelling
8. "speedRecommendations": array per modificare velocità dei segmenti validi:
   - Solo per accelerare (1.1x-4x) o rallentare (0.25x-0.75x) i segmenti validi
   - Formato: {"startTime": seconds, "endTime": seconds, "speed": number, "reason": string, "confidence": 0-1}
9. "confidence": livello di confidenza dell'analisi (0-1)

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
      speedRecommendations: [],
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

function processValidSegments(
  validSegments: any[],
  totalDuration: number
): ValidSegment[] {
  if (!validSegments || !Array.isArray(validSegments)) {
    return []
  }

  return validSegments
    .filter((seg: any) => {
      // Validate segment structure
      return seg.startTime !== undefined && 
             seg.endTime !== undefined && 
             seg.startTime < seg.endTime &&
             seg.startTime >= 0 &&
             seg.endTime <= totalDuration &&
             seg.reason && 
             seg.confidence >= 0 && seg.confidence <= 1 &&
             ['high', 'medium', 'low'].includes(seg.quality)
    })
    .map((seg: any): ValidSegment => ({
      startTime: seg.startTime,
      endTime: seg.endTime,
      reason: seg.reason,
      confidence: seg.confidence,
      quality: seg.quality
    }))
    .sort((a, b) => a.startTime - b.startTime) // Sort by start time
}

function generateCutSegments(
  validSegments: ValidSegment[],
  totalDuration: number
): CutSegment[] {
  const cutSegments: CutSegment[] = []
  let currentTime = 0

  // Sort valid segments by start time
  const sortedValidSegments = [...validSegments].sort((a, b) => a.startTime - b.startTime)

  // Handle case where there are no valid segments - cut everything
  if (sortedValidSegments.length === 0) {
    cutSegments.push({
      id: `cut_entire_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: 0,
      endTime: totalDuration,
      reason: 'No valid content segments identified - entire video marked for removal',
      confidence: 0.9,
      segmentType: 'low_energy'
    })
    return cutSegments
  }

  for (let i = 0; i < sortedValidSegments.length; i++) {
    const validSegment = sortedValidSegments[i]
    
    // Create cut segment from currentTime to start of valid segment
    if (currentTime < validSegment.startTime) {
      const cutDuration = validSegment.startTime - currentTime
      let reason = 'gap'
      let segmentType: CutSegment['segmentType'] = 'gap'
      
      // Determine cut reason based on duration and position
      if (cutDuration > 10) {
        reason = 'Long silence or irrelevant content'
        segmentType = 'silence'
      } else if (cutDuration > 3) {
        reason = 'Pause or filler content'
        segmentType = 'low_energy'
      } else {
        reason = 'Brief gap between content'
        segmentType = 'gap'
      }

      cutSegments.push({
        id: `cut_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        startTime: currentTime,
        endTime: validSegment.startTime,
        reason,
        confidence: 0.8, // High confidence for auto-generated cuts
        segmentType
      })
    }
    
    // Update currentTime to end of valid segment
    currentTime = validSegment.endTime
  }

  // Create final cut segment from last valid segment to end of video
  if (currentTime < totalDuration) {
    cutSegments.push({
      id: `cut_final_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      startTime: currentTime,
      endTime: totalDuration,
      reason: 'End of content - trailing silence or irrelevant material',
      confidence: 0.8,
      segmentType: 'silence'
    })
  }

  return cutSegments
}

function processSpeedRecommendations(
  speedRecommendations: any[],
  totalDuration: number
): SpeedRecommendation[] {
  if (!speedRecommendations || !Array.isArray(speedRecommendations)) {
    return []
  }

  return speedRecommendations
    .filter((rec: any) => {
      // Validate recommendation structure - no more cuts here, only speed changes
      return rec.startTime !== undefined && 
             rec.endTime !== undefined && 
             rec.startTime < rec.endTime &&
             rec.startTime >= 0 &&
             rec.endTime <= totalDuration &&
             typeof rec.speed === 'number' &&
             rec.speed > 0 && // No cuts (speed = 0) allowed here
             rec.reason && 
             rec.confidence >= 0 && rec.confidence <= 1
    })
    .map((rec: any): SpeedRecommendation => ({
      startTime: rec.startTime,
      endTime: rec.endTime,
      speed: rec.speed,
      reason: rec.reason,
      confidence: rec.confidence,
      type: rec.speed < 1.0 ? 'slow_down' as const : 'accelerate' as const
    }))
    .sort((a, b) => a.startTime - b.startTime) // Sort by start time
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