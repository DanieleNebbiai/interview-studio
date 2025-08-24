import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomName: string }> }
) {
  try {
    const { roomName } = await params

    // Get authenticated user (optional for guests)
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

    const { data: { user } } = await supabase.auth.getUser()

    // Clean room name to match database format
    const cleanRoomName = roomName.replace(/[^A-Za-z0-9_-]/g, '-').toLowerCase()

    // Check if room exists in database
    const { data: roomData, error: roomError } = await supabase
      .from('rooms')
      .select('*')
      .eq('daily_room_name', cleanRoomName)
      .eq('is_active', true)
      .single()

    if (roomError || !roomData) {
      // Room doesn't exist in database, allow as guest
      return NextResponse.json({
        success: true,
        permissions: {
          canRecord: false,
          role: 'guest',
          isHost: false,
          roomExists: false,
          userId: user?.id || null
        }
      })
    }

    const isHost = user && roomData.host_id === user.id

    return NextResponse.json({
      success: true,
      permissions: {
        canRecord: isHost,
        role: isHost ? 'host' : 'guest',
        isHost: isHost,
        roomExists: true,
        userId: user?.id || null,
        roomId: roomData.id,
        hostId: roomData.host_id
      }
    })

  } catch (error) {
    console.error('Error checking permissions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}