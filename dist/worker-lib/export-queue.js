"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportQueue = void 0;
exports.updateJobProgress = updateJobProgress;
exports.getJobStatus = getJobStatus;
const bull_1 = require("bull");
// Redis connection
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
// Export Queue
exports.exportQueue = new bull_1.default('video-export', redisUrl, {
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: 5,
        removeOnFail: 10,
    },
});
// Helper to update job progress
async function updateJobProgress(jobId, progress) {
    const job = await exports.exportQueue.getJob(jobId);
    if (job) {
        await job.progress({
            ...progress,
            updatedAt: new Date().toISOString()
        });
    }
}
// Helper to get job status
async function getJobStatus(jobId) {
    try {
        const job = await exports.exportQueue.getJob(jobId);
        if (!job)
            return null;
        const state = await job.getState();
        const progress = job.progress();
        return {
            percentage: typeof progress === 'object' ? progress.percentage : 0,
            message: typeof progress === 'object' ? progress.message : 'Processing...',
            stage: state,
            downloadUrl: typeof progress === 'object' ? progress.downloadUrl : undefined,
            error: typeof progress === 'object' ? progress.error : undefined
        };
    }
    catch (error) {
        console.error('Error getting job status:', error);
        return null;
    }
}
console.log('Export queue initialized with Redis:', redisUrl);
