import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Timer } from '../src/renderer/timer';

describe('Timer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2023-01-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks elapsed time while running', () => {
    const timer = new Timer();

    timer.start();
    vi.advanceTimersByTime(1500);

    expect(Math.round(timer.getElapsedMs())).toBe(1500);
  });

  it('stops accumulating time when paused', () => {
    const timer = new Timer();

    timer.start();
    vi.advanceTimersByTime(2000);
    timer.pause();
    vi.advanceTimersByTime(2000);

    expect(Math.round(timer.getElapsedMs())).toBe(2000);
  });

  it('resets elapsed time to zero', () => {
    const timer = new Timer();

    timer.start();
    vi.advanceTimersByTime(1000);
    timer.pause();
    timer.reset();

    expect(timer.getElapsedMs()).toBe(0);
  });

  it('ignores consecutive start calls without pause', () => {
    const timer = new Timer();

    timer.start();
    vi.advanceTimersByTime(1000);
    timer.start();
    vi.advanceTimersByTime(1000);

    expect(Math.round(timer.getElapsedMs())).toBe(2000);
  });

  it('can resume after being paused', () => {
    const timer = new Timer();

    timer.start();
    vi.advanceTimersByTime(1000);
    timer.pause();
    vi.advanceTimersByTime(1000);
    timer.start();
    vi.advanceTimersByTime(500);

    expect(Math.round(timer.getElapsedMs())).toBe(1500);
  });
});
