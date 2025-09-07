"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Worker process for video export processing
const export_queue_1 = require("./worker-lib/export-queue");
const export_utils_1 = require("./lib/export-utils");
const path_1 = require("path");
console.log('🚀 Starting video export worker...');
// Start health check server for Railway
require('./health-check');
// Process export jobs
export_queue_1.exportQueue.process('process-export', 3, async (job) => {
    const jobData = job.data;
    const { jobId, recordings, videoSections, transcriptions, focusSegments, exportSettings } = jobData;
    console.log(`📹 Processing export job: ${jobId}`);
    try {
        // Step 1: Download videos
        await (0, export_queue_1.updateJobProgress)(jobId, {
            percentage: 5,
            message: 'Downloading video files...',
            stage: 'downloading'
        });
        console.log(`⬇️ Downloading ${recordings.length} video files...`);
        const localVideos = [];
        for (let i = 0; i < recordings.length; i++) {
            const recording = recordings[i];
            const filename = `${jobId}_video_${i}.mp4`;
            try {
                const localPath = await (0, export_utils_1.downloadVideo)(recording.recording_url, filename);
                localVideos.push(localPath);
                const progress = 5 + ((i + 1) / recordings.length) * 15; // 5-20%
                await (0, export_queue_1.updateJobProgress)(jobId, {
                    percentage: Math.round(progress),
                    message: `Downloaded video ${i + 1}/${recordings.length}`,
                    stage: 'downloading'
                });
            }
            catch (error) {
                console.error(`Failed to download video ${recording.id}:`, error);
                throw new Error(`Failed to download video: ${error}`);
            }
        }
        console.log(`✅ Downloaded ${localVideos.length} videos`);
        // Step 2: Generate subtitles if requested
        let subtitleFile;
        if (exportSettings.includeSubtitles && transcriptions.length > 0) {
            await (0, export_queue_1.updateJobProgress)(jobId, {
                percentage: 25,
                message: 'Generating subtitles...',
                stage: 'processing'
            });
            console.log('📝 Generating subtitle file...');
            subtitleFile = await (0, export_utils_1.generateSubtitleFile)(transcriptions, videoSections, jobId);
            console.log(`✅ Generated subtitles: ${subtitleFile}`);
        }
        // Step 3: Process video with FFmpeg
        await (0, export_queue_1.updateJobProgress)(jobId, {
            percentage: 30,
            message: 'Processing video...',
            stage: 'processing'
        });
        const outputPath = path_1.default.join('/tmp', `${jobId}_final.${exportSettings.format}`);
        console.log('🎬 Starting FFmpeg processing...');
        await (0, export_utils_1.buildFFmpegCommand)({
            inputVideos: localVideos,
            outputPath,
            videoSections,
            focusSegments,
            subtitleFile,
            settings: exportSettings
        });
        await (0, export_queue_1.updateJobProgress)(jobId, {
            percentage: 85,
            message: 'Video processing completed',
            stage: 'processing'
        });
        console.log('✅ FFmpeg processing completed');
        // Step 4: Upload to S3/R2
        await (0, export_queue_1.updateJobProgress)(jobId, {
            percentage: 90,
            message: 'Uploading final video...',
            stage: 'uploading'
        });
        const s3Key = `exports/${jobId}_final.${exportSettings.format}`;
        console.log(`☁️ Uploading to S3: ${s3Key}`);
        const downloadUrl = await (0, export_utils_1.uploadToS3)(outputPath, s3Key);
        console.log(`✅ Upload completed: ${downloadUrl}`);
        // Step 5: Cleanup temporary files
        const tempFiles = [...localVideos, outputPath];
        if (subtitleFile)
            tempFiles.push(subtitleFile);
        await (0, export_utils_1.cleanupTempFiles)(tempFiles);
        // Complete job
        await (0, export_queue_1.updateJobProgress)(jobId, {
            percentage: 100,
            message: 'Export completed successfully!',
            stage: 'completed',
            downloadUrl
        });
        console.log(`🎉 Export job ${jobId} completed successfully!`);
        return {
            success: true,
            downloadUrl,
            jobId
        };
    }
    catch (error) {
        console.error(`❌ Export job ${jobId} failed:`, error);
        await (0, export_queue_1.updateJobProgress)(jobId, {
            percentage: 0,
            message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
            stage: 'failed',
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        throw error;
    }
});
// Handle job events
export_queue_1.exportQueue.on('completed', (job, result) => {
    console.log(`✅ Job ${job.id} completed:`, result);
});
export_queue_1.exportQueue.on('failed', (job, err) => {
    console.error(`❌ Job ${job?.id} failed:`, err.message);
});
export_queue_1.exportQueue.on('stalled', (job) => {
    console.warn(`⚠️ Job ${job.id} stalled`);
});
// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('🛑 Shutting down worker...');
    await export_queue_1.exportQueue.close();
    process.exit(0);
});
process.on('SIGINT', async () => {
    console.log('🛑 Shutting down worker...');
    await export_queue_1.exportQueue.close();
    process.exit(0);
});
console.log('✅ Video export worker started and waiting for jobs...');
