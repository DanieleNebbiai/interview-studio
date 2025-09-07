"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadVideo = downloadVideo;
exports.generateSubtitleFile = generateSubtitleFile;
exports.buildFFmpegCommand = buildFFmpegCommand;
exports.uploadToS3 = uploadToS3;
exports.cleanupTempFiles = cleanupTempFiles;
const fluent_ffmpeg_1 = require("fluent-ffmpeg");
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const fs_1 = require("fs");
const path_1 = require("path");
// S3 Client for Cloudflare R2
const s3Client = new client_s3_1.S3Client({
    region: 'auto',
    endpoint: process.env.AWS_ENDPOINT_URL || 'https://your-account.r2.cloudflarestorage.com',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    },
});
const BUCKET_NAME = 'interview-studio-exports';
const TEMP_DIR = '/tmp';
// Download video from URL to local file
async function downloadVideo(url, filename) {
    const localPath = path_1.default.join(TEMP_DIR, filename);
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to download video: ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        fs_1.default.writeFileSync(localPath, Buffer.from(buffer));
        return localPath;
    }
    catch (error) {
        throw new Error(`Error downloading video ${url}: ${error}`);
    }
}
// Generate subtitle file from transcriptions
async function generateSubtitleFile(transcriptions, videoSections, jobId) {
    const subtitlePath = path_1.default.join(TEMP_DIR, `${jobId}_subtitles.srt`);
    let srtContent = '';
    let subtitleIndex = 1;
    // Generate SRT format subtitles
    for (const transcription of transcriptions) {
        if (transcription.word_timestamps?.words) {
            for (const word of transcription.word_timestamps.words) {
                // Check if this word is in a valid (non-deleted) section
                const isInValidSection = videoSections.some(section => !section.isDeleted &&
                    word.start >= section.startTime &&
                    word.end <= section.endTime);
                if (isInValidSection) {
                    const startTime = formatSRTTime(word.start);
                    const endTime = formatSRTTime(word.end);
                    srtContent += `${subtitleIndex}\n`;
                    srtContent += `${startTime} --> ${endTime}\n`;
                    srtContent += `${word.word}\n\n`;
                    subtitleIndex++;
                }
            }
        }
    }
    fs_1.default.writeFileSync(subtitlePath, srtContent, 'utf8');
    return subtitlePath;
}
// Format time for SRT (HH:MM:SS,mmm)
function formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
}
// Build FFmpeg command for multi-video export
function buildFFmpegCommand(data) {
    return new Promise((resolve, reject) => {
        const { inputVideos, outputPath, videoSections, focusSegments, subtitleFile, settings } = data;
        const command = (0, fluent_ffmpeg_1.default)();
        // Add input videos
        inputVideos.forEach(video => {
            command.addInput(video);
        });
        // Build complex filter for multi-video layout
        const validSections = videoSections.filter(section => !section.isDeleted);
        const filterComplex = [];
        const segmentOutputs = [];
        // Process each valid section
        validSections.forEach((section, index) => {
            // const duration = section.endTime - section.startTime
            const speed = section.playbackSpeed;
            // Check if this section has focus
            const activeFocus = focusSegments.find(focus => section.startTime >= focus.startTime && section.endTime <= focus.endTime);
            if (activeFocus && inputVideos.length > 1) {
                // Focus mode - show only focused video
                const focusIndex = 0; // For now, focus on first video (can be improved)
                filterComplex.push(`[${focusIndex}:v]trim=${section.startTime}:${section.endTime},setpts=PTS/${speed}[v${index}]`, `[${focusIndex}:a]atrim=${section.startTime}:${section.endTime},asetpts=PTS/${speed}[a${index}]`);
            }
            else {
                // Grid mode - show all videos
                if (inputVideos.length === 1) {
                    filterComplex.push(`[0:v]trim=${section.startTime}:${section.endTime},setpts=PTS/${speed}[v${index}]`, `[0:a]atrim=${section.startTime}:${section.endTime},asetpts=PTS/${speed}[a${index}]`);
                }
                else if (inputVideos.length === 2) {
                    // 2-video grid
                    filterComplex.push(`[0:v]trim=${section.startTime}:${section.endTime},setpts=PTS/${speed},scale=960:540[v0_${index}]`, `[1:v]trim=${section.startTime}:${section.endTime},setpts=PTS/${speed},scale=960:540[v1_${index}]`, `[v0_${index}][v1_${index}]hstack[v${index}]`, `[0:a]atrim=${section.startTime}:${section.endTime},asetpts=PTS/${speed}[a0_${index}]`, `[1:a]atrim=${section.startTime}:${section.endTime},asetpts=PTS/${speed}[a1_${index}]`, `[a0_${index}][a1_${index}]amix=inputs=2[a${index}]`);
                }
                // Can add more layouts for 3, 4+ videos
            }
            segmentOutputs.push(`[v${index}][a${index}]`);
        });
        // Concatenate all segments
        if (segmentOutputs.length > 1) {
            filterComplex.push(`${segmentOutputs.join('')}concat=n=${segmentOutputs.length}:v=1:a=1[finalvideo][finalaudio]`);
        }
        else {
            filterComplex.push(`[v0][a0]`);
        }
        // Add subtitle overlay if requested
        if (subtitleFile && settings.includeSubtitles) {
            filterComplex.push(`[finalvideo]subtitles=${subtitleFile}[final]`);
            command.complexFilter(filterComplex.join(';'));
            command.outputOptions(['-map [final]', '-map [finalaudio]']);
        }
        else {
            command.complexFilter(filterComplex.join(';'));
            if (segmentOutputs.length > 1) {
                command.outputOptions(['-map [finalvideo]', '-map [finalaudio]']);
            }
            else {
                command.outputOptions(['-map [v0]', '-map [a0]']);
            }
        }
        // Output settings
        command
            .format(settings.format)
            .videoBitrate(getVideoBitrate(settings.quality))
            .audioBitrate('128k')
            .fps(settings.framerate)
            .output(outputPath);
        // Execute command
        command
            .on('start', (commandLine) => {
            console.log('FFmpeg command:', commandLine);
        })
            .on('end', () => {
            console.log('FFmpeg processing completed');
            resolve(outputPath);
        })
            .on('error', (err) => {
            console.error('FFmpeg error:', err);
            reject(err);
        })
            .run();
    });
}
function getVideoBitrate(quality) {
    switch (quality) {
        case '4k': return '8000k';
        case '1080p': return '2000k';
        case '720p': return '1000k';
        default: return '1000k';
    }
}
// Upload file to S3/R2
async function uploadToS3(filePath, key) {
    try {
        const fileContent = fs_1.default.readFileSync(filePath);
        const command = new client_s3_1.PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: fileContent,
            ContentType: 'video/mp4',
        });
        await s3Client.send(command);
        // Generate presigned URL for download (expires in 24 hours)
        const getCommand = new client_s3_1.GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: key,
        });
        const downloadUrl = await (0, s3_request_presigner_1.getSignedUrl)(s3Client, getCommand, { expiresIn: 86400 });
        return downloadUrl;
    }
    catch (error) {
        throw new Error(`Failed to upload to S3: ${error}`);
    }
}
// Clean up temporary files
async function cleanupTempFiles(filePaths) {
    for (const filePath of filePaths) {
        try {
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
                console.log(`Cleaned up temp file: ${filePath}`);
            }
        }
        catch (error) {
            console.error(`Error cleaning up ${filePath}:`, error);
        }
    }
}
