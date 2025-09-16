import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const TEMP_DIR = process.env.TEMP_DIR || '/tmp/interview-studio'
const CLEANUP_AGE_HOURS = 24 // Files older than 24 hours will be deleted

export async function POST(request: NextRequest) {
  try {
    console.log('🧹 Starting export file cleanup process...')

    // Create Supabase client
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
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

    const cutoffTime = new Date(Date.now() - (CLEANUP_AGE_HOURS * 60 * 60 * 1000))
    console.log(`🕐 Cleaning up files older than: ${cutoffTime.toISOString()}`)

    // Get completed export jobs older than cutoff time
    const { data: oldJobs, error } = await supabase
      .from('export_jobs')
      .select('id, file_path, created_at')
      .eq('status', 'completed')
      .lt('created_at', cutoffTime.toISOString())

    if (error) {
      throw new Error(`Failed to query old export jobs: ${error.message}`)
    }

    let cleanedFiles = 0
    let cleanedSize = 0
    const errors: string[] = []

    for (const job of oldJobs || []) {
      try {
        if (job.file_path && fs.existsSync(job.file_path)) {
          const stats = fs.statSync(job.file_path)
          const fileSizeMB = stats.size / 1024 / 1024

          fs.unlinkSync(job.file_path)
          console.log(`🗑️ Deleted export file: ${job.file_path} (${fileSizeMB.toFixed(1)}MB)`)

          cleanedFiles++
          cleanedSize += fileSizeMB

          // Update job status to indicate file was cleaned up
          await supabase
            .from('export_jobs')
            .update({
              status: 'cleaned_up',
              file_path: null,
              updated_at: new Date().toISOString()
            })
            .eq('id', job.id)
        }
      } catch (fileError) {
        const errorMsg = `Failed to delete ${job.file_path}: ${fileError}`
        console.error(errorMsg)
        errors.push(errorMsg)
      }
    }

    // Also cleanup any orphaned temp files in temp directory
    let tempFilesDeleted = 0
    if (fs.existsSync(TEMP_DIR)) {
      const tempFiles = fs.readdirSync(TEMP_DIR)

      for (const file of tempFiles) {
        try {
          const filePath = path.join(TEMP_DIR, file)
          const stats = fs.statSync(filePath)

          // Delete temp files older than 1 hour
          const tempCutoff = new Date(Date.now() - (1 * 60 * 60 * 1000))
          if (stats.mtime < tempCutoff) {
            fs.unlinkSync(filePath)
            tempFilesDeleted++
            console.log(`🧽 Deleted temp file: ${file}`)
          }
        } catch (tempError) {
          console.warn(`⚠️ Failed to delete temp file ${file}:`, tempError)
        }
      }
    }

    const summary = {
      cleanedFiles,
      cleanedSizeMB: cleanedSize.toFixed(1),
      tempFilesDeleted,
      errors: errors.length > 0 ? errors : undefined
    }

    console.log(`✅ Cleanup completed:`, summary)

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${cleanedFiles} export files (${cleanedSize.toFixed(1)}MB) and ${tempFilesDeleted} temp files`,
      ...summary
    })

  } catch (error) {
    console.error('❌ Export cleanup failed:', error)
    return NextResponse.json(
      { error: 'Export cleanup failed' },
      { status: 500 }
    )
  }
}