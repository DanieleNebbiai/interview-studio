import { NextRequest, NextResponse } from 'next/server'

// This endpoint can be called by a cron service (like Vercel Cron or external scheduler)
export async function POST(request: NextRequest) {
  try {
    // Verify this is a legitimate cron call
    const authHeader = request.headers.get('authorization')
    const expectedAuth = `Bearer ${process.env.CRON_SECRET}`

    if (!process.env.CRON_SECRET || authHeader !== expectedAuth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('🕐 Running scheduled export cleanup...')

    // Call our cleanup endpoint
    const cleanupResponse = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/export/cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!cleanupResponse.ok) {
      throw new Error(`Cleanup failed: ${cleanupResponse.status}`)
    }

    const cleanupResult = await cleanupResponse.json()

    return NextResponse.json({
      success: true,
      message: 'Scheduled cleanup completed',
      timestamp: new Date().toISOString(),
      ...cleanupResult
    })

  } catch (error) {
    console.error('❌ Scheduled cleanup failed:', error)
    return NextResponse.json(
      {
        error: 'Scheduled cleanup failed',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    )
  }
}

// Also allow GET for health checks
export async function GET() {
  return NextResponse.json({
    service: 'export-cleanup-cron',
    status: 'healthy',
    timestamp: new Date().toISOString()
  })
}