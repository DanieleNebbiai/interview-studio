import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const query = searchParams.get('q')

    if (!query) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      )
    }

    // Create Supabase client
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            cookieStore.set(name, value, options)
          },
          remove(name: string, options: any) {
            cookieStore.delete(name)
          },
        },
      }
    )

    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }

    console.log('Searching recordings for user:', user.id, 'query:', query)

    // Search recordings by room name or transcription text
    const { data: recordings, error: recordingsError } = await supabase
      .from('recordings')
      .select(`
        *,
        room:rooms!inner (
          id,
          room_name,
          daily_room_name,
          host_id
        ),
        transcriptions (
          id,
          transcript_text,
          word_timestamps,
          language,
          confidence
        )
      `)
      .eq('room.host_id', user.id)
      .eq('room.is_active', true)
      .or(`room.room_name.ilike.%${query}%,room.daily_room_name.ilike.%${query}%`)
      .order('created_at', { ascending: false })

    if (recordingsError) {
      console.error('Error searching recordings:', recordingsError)
      return NextResponse.json(
        { error: 'Failed to search recordings' },
        { status: 500 }
      )
    }

    // Also search in transcription text if no room name matches
    if ((!recordings || recordings.length === 0)) {
      const { data: transcriptionMatches, error: transcriptionError } = await supabase
        .from('recordings')
        .select(`
          *,
          room:rooms!inner (
            id,
            room_name,
            daily_room_name,
            host_id
          ),
          transcriptions!inner (
            id,
            transcript_text,
            word_timestamps,
            language,
            confidence
          )
        `)
        .eq('room.host_id', user.id)
        .eq('room.is_active', true)
        .ilike('transcriptions.transcript_text', `%${query}%`)
        .order('created_at', { ascending: false })

      if (!transcriptionError && transcriptionMatches) {
        recordings?.push(...transcriptionMatches)
      }
    }

    console.log(`Found ${recordings?.length || 0} recordings matching query "${query}"`)

    return NextResponse.json({
      success: true,
      recordings: recordings || [],
      count: recordings?.length || 0,
      query,
      message: `Found ${recordings?.length || 0} recordings matching "${query}"`
    })

  } catch (error) {
    console.error('Error in recordings search:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}