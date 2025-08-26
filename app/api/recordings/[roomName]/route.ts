import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ roomName: string }> }
) {
  try {
    const { roomName } = await params

    const response = await fetch(`https://api.daily.co/v1/recordings?room_name=${roomName}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${process.env.DAILY_API_KEY}`,
      },
    })

    if (!response.ok) {
      const error = await response.text()
      console.error('Daily.co API error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch recordings' },
        { status: response.status }
      )
    }

    const data = await response.json()

    const processedRecordings = data.recordings?.map((recording: unknown) => {
      const rec = recording as Record<string, unknown>;
      return {
        id: rec.id,
        roomName: rec.room_name,
        status: rec.status,
        startTime: rec.start_time,
        duration: rec.duration,
        downloadUrl: rec.download_url,
        participants: rec.participants || [],
        thumbnail: rec.preview_url,
      };
    }) || []

    return NextResponse.json({
      recordings: processedRecordings,
      total: data.total_count || 0,
      success: true,
    })
  } catch (error) {
    console.error('Error fetching recordings:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}