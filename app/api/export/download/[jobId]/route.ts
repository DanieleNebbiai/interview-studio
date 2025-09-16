import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus } from '@/lib/server-export-queue'
import path from 'path'
import fs from 'fs'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  try {
    const { jobId } = await params

    if (!jobId) {
      return NextResponse.json(
        { error: 'Job ID is required' },
        { status: 400 }
      )
    }

    // Get job status to check if it's completed and get download URL
    const status = await getJobStatus(jobId)

    if (!status) {
      return NextResponse.json(
        { error: 'Export job not found' },
        { status: 404 }
      )
    }

    if (status.stage !== 'completed') {
      return NextResponse.json(
        { error: `Export is not ready yet. Status: ${status.stage}` },
        { status: 400 }
      )
    }

    if (!status.downloadUrl) {
      return NextResponse.json(
        { error: 'Download URL not available' },
        { status: 500 }
      )
    }

    // Check if file exists
    const filePath = status.downloadUrl
    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Export file not found or has been cleaned up' },
        { status: 404 }
      )
    }

    // Get file stats
    const stats = fs.statSync(filePath)
    const fileSize = stats.size
    const fileName = `interview_${jobId.slice(-8)}.mp4`

    // Stream the file directly
    console.log(`📥 Serving download for job ${jobId}: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`)

    const fileBuffer = fs.readFileSync(filePath)

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': fileSize.toString(),
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
    })

  } catch (error) {
    console.error('Error serving export download:', error)
    return NextResponse.json(
      { error: 'Failed to download export file' },
      { status: 500 }
    )
  }
}