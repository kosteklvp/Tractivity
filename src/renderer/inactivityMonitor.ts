export interface TimerLike {
  start(): void;
  pause(): void;
  isRunning(): boolean;
}

type IdleTimeProvider = () => number | Promise<number>;

export class InactivityMonitor {
  private pausedByIdle = false;

  private evaluating = false;

  private lastActivity = Date.now();

  private lastSystemIdleMs: number | undefined;

  private lastEffectiveIdleMs = 0;

  constructor(
    private readonly timer: TimerLike,
    private readonly thresholdMs: number,
    private readonly idleTimeProvider?: IdleTimeProvider,
    private readonly onStateChange?: () => void
  ) {}

  markActivity(timestamp: number = Date.now()): void {
    this.lastActivity = timestamp;

    if (!this.timer.isRunning() && this.pausedByIdle) {
      this.pausedByIdle = false;
      this.timer.start();
      this.onStateChange?.();
    }
  }

  async evaluate(): Promise<void> {
    if (this.evaluating) {
      return;
    }

    this.evaluating = true;

    try {
      const now = Date.now();
      let idleMillisecondsFromSystem: number | undefined;

      if (this.idleTimeProvider) {
        let idleResult: number | Promise<number> | null;

        try {
          idleResult = this.idleTimeProvider();
        } catch (error) {
          console.error('Failed to determine system idle time', error);
          idleResult = null;
        }

        if (idleResult !== null) {
          const idleSeconds = await Promise.resolve(idleResult).catch((error) => {
            console.error('Failed to determine system idle time', error);
            return null;
          });

          if (typeof idleSeconds === 'number' && Number.isFinite(idleSeconds) && idleSeconds >= 0) {
            idleMillisecondsFromSystem = idleSeconds * 1000;

            if (idleMillisecondsFromSystem < this.thresholdMs) {
              this.lastActivity = now;
            }
          }
        }
      }

      const elapsedSinceActivity = now - this.lastActivity;
      const effectiveIdle = idleMillisecondsFromSystem ?? elapsedSinceActivity;

      this.lastSystemIdleMs = idleMillisecondsFromSystem;
      this.lastEffectiveIdleMs = effectiveIdle;

      if (this.timer.isRunning()) {
        if (effectiveIdle >= this.thresholdMs) {
          this.timer.pause();
          this.pausedByIdle = true;
          this.onStateChange?.();
        }
      } else if (this.pausedByIdle && effectiveIdle < this.thresholdMs) {
        this.pausedByIdle = false;
        this.timer.start();
        this.lastActivity = now;
        this.onStateChange?.();
      }
    } finally {
      this.evaluating = false;
    }
  }

  clearAutoPause(): void {
    this.lastActivity = Date.now();
    this.lastEffectiveIdleMs = 0;

    if (this.pausedByIdle) {
      this.pausedByIdle = false;
      this.onStateChange?.();
    }
  }

  isPausedByInactivity(): boolean {
    return this.pausedByIdle;
  }

  getDiagnostics(): { systemIdleMs: number | undefined; effectiveIdleMs: number; pausedByIdle: boolean } {
    return {
      systemIdleMs: this.lastSystemIdleMs,
      effectiveIdleMs: this.lastEffectiveIdleMs,
      pausedByIdle: this.pausedByIdle
    };
  }
}
