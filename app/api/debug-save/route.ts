import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function POST(request: NextRequest) {
  try {
    const { roomId, testSection } = await request.json() as {
      roomId: string
      testSection: {
        id: string
        startTime: number
        endTime: number
        isDeleted: boolean
        playbackSpeed: number
      }
    }

    console.log('🔍 DEBUG SAVE - Input data:', testSection)

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

    // Get room data
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('id')
      .eq('daily_room_name', roomId)
      .single()

    if (roomError || !roomData) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 })
    }

    // Test direct upsert
    const upsertData = {
      room_id: roomData.id,
      section_id: testSection.id,
      start_time: testSection.startTime,
      end_time: testSection.endTime,
      is_deleted: testSection.isDeleted,
      playback_speed: testSection.playbackSpeed,
      created_by: 'user',
      user_modified: true
    }

    console.log('🔍 DEBUG SAVE - Upserting:', upsertData)

    const { error: upsertError, data: upsertResult } = await supabase
      .from('video_sections')
      .upsert([upsertData], {
        onConflict: 'room_id,section_id'
      })
      .select()

    if (upsertError) {
      console.error('🔍 DEBUG SAVE - Upsert error:', upsertError)
      return NextResponse.json({ error: upsertError.message }, { status: 500 })
    }

    console.log('🔍 DEBUG SAVE - Upsert result:', upsertResult)

    // Read back from DB to verify
    const { data: verifyResult, error: verifyError } = await supabase
      .from('video_sections')
      .select('*')
      .eq('room_id', roomData.id)
      .eq('section_id', testSection.id)
      .single()

    console.log('🔍 DEBUG SAVE - DB verification:', verifyResult)

    return NextResponse.json({
      success: true,
      inputData: testSection,
      upsertData,
      upsertResult,
      verifyResult,
      message: 'Debug save completed'
    })

  } catch (error) {
    console.error('🔍 DEBUG SAVE - Error:', error)
    return NextResponse.json({ error: 'Debug save failed' }, { status: 500 })
  }
}