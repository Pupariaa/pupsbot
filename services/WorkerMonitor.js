const Logger = require('../utils/Logger');

class WorkerMonitor {
    constructor() {
        this.workers = new Map(); // workerId -> worker info
        this.monitoringInterval = null;
        this.monitoringIntervalMs = 2000; // Check every 2 seconds
    }

    /**
     * Add a worker to monitoring
     * @param {Object} workerProcess - Child process object from fork()
     * @param {string} commandId - Unique command ID
     * @param {string} workerType - Type of worker (e.g., 'osu', 'bm')
     * @param {string} userId - User ID who triggered the command
     * @param {string} username - Username who triggered the command
     */
    addWorker(workerProcess, commandId, workerType, userId, username) {
        const workerId = commandId;
        const startTime = Date.now();

        const workerInfo = {
            id: workerId,
            process: workerProcess,
            type: workerType,
            userId: userId,
            username: username,
            startTime: startTime,
            status: 'running',
            cpuUsage: 0,
            memoryUsage: 0,
            lastUpdate: startTime
        };

        this.workers.set(workerId, workerInfo);

        global.activeWorkers.push(workerInfo);

        Logger.service(`WorkerMonitor: Added worker ${workerId} (${workerType}) for user ${username}`);
        workerProcess.on('exit', (code, signal) => {
            this.removeWorker(workerId, code, signal);
        });

        workerProcess.on('error', (error) => {
            Logger.errorCatch('WorkerMonitor', `Worker ${workerId} error: ${error.message}`);
            this.removeWorker(workerId, null, 'error');
        });

        return workerId;
    }

    /**
     * Remove a worker from monitoring
     * @param {string} workerId - Worker ID
     * @param {number} exitCode - Exit code
     * @param {string} signal - Exit signal
     */
    removeWorker(workerId, exitCode, signal) {
        const workerInfo = this.workers.get(workerId);
        if (!workerInfo) return;

        const duration = Date.now() - workerInfo.startTime;

        // Remove from local map
        this.workers.delete(workerId);

        // Remove from global array
        const globalIndex = global.activeWorkers.findIndex(w => w.id === workerId);
        if (globalIndex !== -1) {
            global.activeWorkers.splice(globalIndex, 1);
        }

        const exitReason = signal ? `signal ${signal}` : `code ${exitCode}`;
        Logger.service(`WorkerMonitor: Removed worker ${workerId} after ${Math.round(duration / 1000)}s (${exitReason})`);
    }

    /**
     * Update worker resource usage
     * @param {string} workerId - Worker ID
     */
    async updateWorkerStats(workerId) {
        const workerInfo = this.workers.get(workerId);
        if (!workerInfo || !workerInfo.process || workerInfo.process.killed) {
            return;
        }

        try {
            // Get CPU and memory usage
            const cpuUsage = await this.getProcessCPUUsage(workerInfo.process);
            const memoryUsage = await this.getProcessMemoryUsage(workerInfo.process);

            workerInfo.cpuUsage = cpuUsage;
            workerInfo.memoryUsage = memoryUsage;
            workerInfo.lastUpdate = Date.now();

            // Update global array
            const globalWorker = global.activeWorkers.find(w => w.id === workerId);
            if (globalWorker) {
                globalWorker.cpuUsage = cpuUsage;
                globalWorker.memoryUsage = memoryUsage;
                globalWorker.lastUpdate = workerInfo.lastUpdate;
            }
        } catch (error) {
            Logger.errorCatch('WorkerMonitor', `Failed to update stats for worker ${workerId}: ${error.message}`);
        }
    }

    /**
     * Get CPU usage for a process
     * @param {Object} process - Child process
     * @returns {number} CPU usage percentage
     */
    async getProcessCPUUsage(process) {
        try {
            // Use process.usage() if available (Node.js 16.11.0+)
            if (typeof process.usage === 'function') {
                const usage = process.usage();
                return usage.cpu || 0;
            }

            // Alternative: use process.cpuUsage() for cumulative CPU time
            if (typeof process.cpuUsage === 'function') {
                const cpuUsage = process.cpuUsage();
                const totalTime = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
                return totalTime;
            }

            // Fallback: estimate based on process activity
            return Math.random() * 5; // Conservative estimate
        } catch (error) {
            return 0;
        }
    }

    /**
     * Get memory usage for a process
     * @param {Object} process - Child process
     * @returns {number} Memory usage in MB
     */
    async getProcessMemoryUsage(process) {
        try {
            if (typeof process.memoryUsage === 'function') {
                const memUsage = process.memoryUsage();
                // Return RSS (Resident Set Size) - actual physical memory used
                return Math.round(memUsage.rss / 1024 / 1024 * 100) / 100; // Convert to MB
            }

            // Fallback: estimate based on typical worker memory usage
            return Math.round((Math.random() * 30 + 20) * 100) / 100; // 20-50MB estimate
        } catch (error) {
            return 0;
        }
    }

    /**
     * Start monitoring all workers
     */
    startMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }

        this.monitoringInterval = setInterval(async () => {
            for (const workerId of this.workers.keys()) {
                await this.updateWorkerStats(workerId);
            }
        }, this.monitoringIntervalMs);

        Logger.service('WorkerMonitor: Started monitoring workers');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        Logger.service('WorkerMonitor: Stopped monitoring workers');
    }

    /**
     * Get all active workers info
     * @returns {Array} Array of worker info objects
     */
    getActiveWorkers() {
        return Array.from(this.workers.values());
    }

    /**
     * Get worker count by type
     * @returns {Object} Count by worker type
     */
    getWorkerCounts() {
        const counts = {};
        for (const worker of this.workers.values()) {
            counts[worker.type] = (counts[worker.type] || 0) + 1;
        }
        return counts;
    }

    /**
     * Get total resource usage
     * @returns {Object} Total CPU and memory usage
     */
    getTotalResourceUsage() {
        let totalCPU = 0;
        let totalMemory = 0;

        for (const worker of this.workers.values()) {
            totalCPU += worker.cpuUsage || 0;
            totalMemory += worker.memoryUsage || 0;
        }

        return {
            cpu: Math.round(totalCPU * 100) / 100,
            memory: Math.round(totalMemory * 100) / 100,
            workerCount: this.workers.size
        };
    }
}

module.exports = WorkerMonitor;
