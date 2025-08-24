import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  try {
    // Get parameters from query string
    const searchParams = request.nextUrl.searchParams
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined
    const roomId = searchParams.get('roomId')

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

    console.log('Fetching recordings for user:', user.id, roomId ? `room: ${roomId}` : '')

    // Build query
    let query = supabase
      .from('recordings')
      .select(`
        *,
        room:rooms!inner (
          id,
          name,
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

    // Filter by specific room if roomId provided
    if (roomId) {
      query = query.eq('room.daily_room_name', roomId)
    }

    // Apply ordering and limit
    query = query.order('created_at', { ascending: false })
    if (limit) {
      query = query.limit(limit)
    }

    const { data: recordings, error: recordingsError } = await query

    if (recordingsError) {
      console.error('Error fetching recordings:', recordingsError)
      return NextResponse.json(
        { error: 'Failed to fetch recordings' },
        { status: 500 }
      )
    }

    // Filter out recordings without transcriptions if desired
    // const processedRecordings = recordings?.filter(r => r.transcriptions.length > 0) || []

    console.log(`Found ${recordings?.length || 0} recordings for user ${user.id}`)

    return NextResponse.json({
      success: true,
      recordings: recordings || [],
      count: recordings?.length || 0,
      message: `Found ${recordings?.length || 0} recordings`
    })

  } catch (error) {
    console.error('Error in recordings list:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}