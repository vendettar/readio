import { log, logError } from '../logger'

/**
 * Global FIFO ASR Queue (Instruction 125)
 * Ensures only one active transcription task runs at a time.
 */

type ASRTask = () => Promise<void>

class ASRQueue {
  private queue: ASRTask[] = []
  private active = false

  /**
   * Add a task to the queue (FIFO).
   */
  async enqueue(task: ASRTask): Promise<void> {
    this.queue.push(task)
    void this.run() // Run in background
  }

  /**
   * Add a task to the head of the queue (Priority).
   */
  async enqueuePriority(task: ASRTask): Promise<void> {
    this.queue.unshift(task)
    void this.run() // Run in background
  }

  /**
   * Get the number of pending tasks.
   */
  get size(): number {
    return this.queue.length
  }

  private async run() {
    if (this.active || this.queue.length === 0) return
    this.active = true

    log(`[asr-queue] Starting queue processing. ${this.queue.length} tasks pending.`)

    while (this.queue.length > 0) {
      const task = this.queue.shift()
      if (task) {
        try {
          await task()
        } catch (err) {
          logError('[asr-queue] Active task failed', err)
        }
      }
    }

    this.active = false
    log('[asr-queue] Queue processing finished.')
  }
}

export const backgroundAsrQueue = new ASRQueue()
