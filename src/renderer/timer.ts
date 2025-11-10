export class Timer {
  private startTimestamp: number | null = null;

  private accumulatedMs = 0;

  start(): void {
    if (this.isRunning()) {
      return;
    }

    this.startTimestamp = Date.now();
  }

  pause(): void {
    if (!this.isRunning()) {
      return;
    }

    this.accumulatedMs += Date.now() - (this.startTimestamp ?? 0);
    this.startTimestamp = null;
  }

  reset(): void {
    this.accumulatedMs = 0;
    this.startTimestamp = null;
  }

  getElapsedMs(): number {
    if (!this.isRunning()) {
      return this.accumulatedMs;
    }

    return this.accumulatedMs + (Date.now() - (this.startTimestamp ?? 0));
  }

  isRunning(): boolean {
    return this.startTimestamp !== null;
  }
}

export const formatElapsed = (milliseconds: number): string => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (value: number): string => (value < 10 ? `0${value}` : value.toString());

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};
