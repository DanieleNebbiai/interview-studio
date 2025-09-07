import { NextRequest, NextResponse } from 'next/server'
import { getJobStatus } from '@/lib/server-export-queue'

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

    const status = await getJobStatus(jobId)

    if (!status) {
      return NextResponse.json(
        { error: 'Job not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      jobId,
      ...status
    })

  } catch (error) {
    console.error('Error getting job status:', error)
    return NextResponse.json(
      { error: 'Failed to get job status' },
      { status: 500 }
    )
  }
}