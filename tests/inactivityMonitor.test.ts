import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InactivityMonitor, type TimerLike } from '../src/renderer/inactivityMonitor.js';

type VoidFn = () => void;

class FakeTimer implements TimerLike {
  private running = false;

  startCalls = 0;

  pauseCalls = 0;

  start(): void {
    if (this.running) {
      return;
    }

    this.running = true;
    this.startCalls += 1;
  }

  pause(): void {
    if (!this.running) {
      return;
    }

    this.running = false;
    this.pauseCalls += 1;
  }

  isRunning(): boolean {
    return this.running;
  }
}

describe('InactivityMonitor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const createMonitor = (
    timer: FakeTimer,
    thresholdMs: number,
    idleProvider?: () => number,
    onStateChange?: VoidFn
  ): InactivityMonitor => new InactivityMonitor(timer, thresholdMs, idleProvider, onStateChange);

  it('pauses the timer after exceeding the local inactivity threshold', async () => {
    const timer = new FakeTimer();
    const onStateChange = vi.fn();
    const monitor = createMonitor(timer, 1_000, undefined, onStateChange);

    timer.start();
    monitor.markActivity(0);

    vi.setSystemTime(1_500);
    await monitor.evaluate();

    expect(timer.isRunning()).toBe(false);
    expect(timer.pauseCalls).toBe(1);
    expect(onStateChange).toHaveBeenCalledTimes(1);
  });

  it('uses system idle time to pause and resume the timer automatically', async () => {
    const timer = new FakeTimer();
    const onStateChange = vi.fn();
    let idleSeconds = 0;
    const monitor = createMonitor(timer, 1_000, () => idleSeconds, onStateChange);

    timer.start();
    monitor.markActivity(0);

    idleSeconds = 0.5;
    vi.setSystemTime(500);
    await monitor.evaluate();
    expect(timer.pauseCalls).toBe(0);

    idleSeconds = 2;
    vi.setSystemTime(2_000);
    await monitor.evaluate();
    expect(timer.isRunning()).toBe(false);
    expect(timer.pauseCalls).toBe(1);

    idleSeconds = 0.1;
    vi.setSystemTime(2_200);
    await monitor.evaluate();
    expect(timer.isRunning()).toBe(true);
    expect(timer.startCalls).toBe(2);
    expect(onStateChange).toHaveBeenCalledTimes(2);
  });

  it('does not resume the timer when it was paused manually', async () => {
    const timer = new FakeTimer();
    const monitor = createMonitor(timer, 1_000);

    timer.start();
    monitor.markActivity(0);

    timer.pause();
    monitor.clearAutoPause();
    monitor.markActivity(500);

    vi.setSystemTime(1_500);
    await monitor.evaluate();

    expect(timer.isRunning()).toBe(false);
    expect(timer.startCalls).toBe(1);
  });

  it('resumes immediately when user activity is detected locally after auto pause', async () => {
    const timer = new FakeTimer();
    const onStateChange = vi.fn();
    const monitor = createMonitor(timer, 1_000, undefined, onStateChange);

    timer.start();
    monitor.markActivity(0);

    vi.setSystemTime(2_000);
    await monitor.evaluate();
    expect(timer.isRunning()).toBe(false);

    monitor.markActivity(2_100);
    expect(timer.isRunning()).toBe(true);
    expect(timer.startCalls).toBe(2);
    expect(onStateChange).toHaveBeenCalledTimes(2);
  });

  it('continues evaluation if the idle time provider fails', async () => {
    const timer = new FakeTimer();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const monitor = createMonitor(timer, 1_000, () => {
      throw new Error('provider failure');
    });

    timer.start();
    await expect(monitor.evaluate()).resolves.toBeUndefined();
    expect(consoleSpy).toHaveBeenCalled();
  });
});
