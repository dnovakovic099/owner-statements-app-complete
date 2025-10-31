/**
 * Background Job Service
 * Handles long-running tasks like bulk statement generation
 */

class BackgroundJobService {
    constructor() {
        this.jobs = new Map(); // Store job status in memory
        this.jobCounter = 0;
    }

    /**
     * Create a new background job
     * @param {string} type - Job type (e.g., 'bulk_statement_generation')
     * @param {Object} params - Job parameters
     * @returns {string} - Job ID
     */
    createJob(type, params = {}) {
        const jobId = `job_${++this.jobCounter}_${Date.now()}`;
        
        this.jobs.set(jobId, {
            id: jobId,
            type,
            status: 'queued',
            progress: 0,
            total: 0,
            startedAt: new Date().toISOString(),
            completedAt: null,
            result: null,
            error: null,
            params
        });

        console.log(`📋 Created background job: ${jobId} (${type})`);
        return jobId;
    }

    /**
     * Update job status
     */
    updateJob(jobId, updates) {
        const job = this.jobs.get(jobId);
        if (!job) return;

        Object.assign(job, updates);
        this.jobs.set(jobId, job);
    }

    /**
     * Mark job as started
     */
    startJob(jobId, total = 0) {
        this.updateJob(jobId, {
            status: 'processing',
            total,
            progress: 0
        });
        console.log(`▶️  Started job: ${jobId}`);
    }

    /**
     * Update job progress
     */
    updateProgress(jobId, progress) {
        this.updateJob(jobId, { progress });
    }

    /**
     * Mark job as completed
     */
    completeJob(jobId, result) {
        this.updateJob(jobId, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            result
        });
        console.log(`✅ Completed job: ${jobId}`);
        
        // Auto-cleanup after 1 hour
        setTimeout(() => {
            this.jobs.delete(jobId);
            console.log(`🗑️  Cleaned up job: ${jobId}`);
        }, 60 * 60 * 1000);
    }

    /**
     * Mark job as failed
     */
    failJob(jobId, error) {
        this.updateJob(jobId, {
            status: 'failed',
            completedAt: new Date().toISOString(),
            error: error.message || String(error)
        });
        console.error(`❌ Failed job: ${jobId}`, error);
        
        // Auto-cleanup after 1 hour
        setTimeout(() => {
            this.jobs.delete(jobId);
        }, 60 * 60 * 1000);
    }

    /**
     * Get job status
     */
    getJob(jobId) {
        return this.jobs.get(jobId) || null;
    }

    /**
     * Get all jobs
     */
    getAllJobs() {
        return Array.from(this.jobs.values());
    }

    /**
     * Run a job in the background
     * @param {string} type - Job type
     * @param {Function} jobFunction - Async function to execute
     * @param {Object} params - Job parameters
     * @returns {string} - Job ID
     */
    async runInBackground(type, jobFunction, params = {}) {
        const jobId = this.createJob(type, params);

        // Run job without blocking
        setImmediate(async () => {
            try {
                await jobFunction(jobId);
            } catch (error) {
                console.error(`Background job ${jobId} failed:`, error);
                this.failJob(jobId, error);
            }
        });

        return jobId;
    }
}

// Singleton instance
module.exports = new BackgroundJobService();

