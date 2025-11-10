import { InactivityMonitor } from './inactivityMonitor.js';
import { Timer, formatElapsed } from './timer.js';

const INACTIVITY_THRESHOLD_MS = 3_000;

type UIElements = {
  startPauseButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  display: HTMLElement;
  statusLabel: HTMLElement;
  debugInfo: HTMLElement;
};

const getUIElements = (): UIElements => {
  const startPauseButton = document.getElementById('startPauseBtn') as HTMLButtonElement | null;
  const resetButton = document.getElementById('resetBtn') as HTMLButtonElement | null;
  const display = document.getElementById('timerDisplay');
  const statusLabel = document.getElementById('statusLabel');
  const debugInfo = document.getElementById('debugInfo');

  if (!startPauseButton || !resetButton || !display || !statusLabel || !debugInfo) {
    throw new Error('Timer controls are missing from the document.');
  }

  return { startPauseButton, resetButton, display, statusLabel, debugInfo };
};

const initializeTimerUI = (): void => {
  const timer = new Timer();
  const { startPauseButton, resetButton, display, statusLabel, debugInfo } = getUIElements();

  const syncDisplay = (): void => {
    display.textContent = formatElapsed(timer.getElapsedMs());
    resetButton.disabled = timer.isRunning() || timer.getElapsedMs() === 0;
    startPauseButton.textContent = timer.isRunning() ? 'Pause' : 'Start';
    statusLabel.textContent = timer.isRunning() ? '' : 'Paused';
  };

  const api = window.tractivityApi;
  const idleTimeProvider = api?.getSystemIdleTime ? () => api.getSystemIdleTime() : undefined;

  const inactivityMonitor = new InactivityMonitor(
    timer,
    INACTIVITY_THRESHOLD_MS,
    idleTimeProvider,
    () => {
      syncDisplay();
      renderDiagnostics();
    }
  );

  function renderDiagnostics(): void {
    const diagnostics = inactivityMonitor.getDiagnostics();
    const providerAvailable = Boolean(window.tractivityApi?.getSystemIdleTime);
    const bridgeState = typeof window.tractivityApi;
    const systemIdleSeconds = diagnostics.systemIdleMs !== undefined ? (diagnostics.systemIdleMs / 1000).toFixed(2) : 'n/a';
    const effectiveIdleSeconds = (diagnostics.effectiveIdleMs / 1000).toFixed(2);
    const pausedNote = diagnostics.pausedByIdle ? ' | Auto-paused' : '';

    debugInfo.textContent = `Bridge: ${bridgeState} | Idle provider: ${providerAvailable ? 'available' : 'missing'} | System idle: ${systemIdleSeconds}s | Effective idle: ${effectiveIdleSeconds}s${pausedNote}`;
  }

  const handleUserActivity = (): void => {
    inactivityMonitor.markActivity();
    renderDiagnostics();
  };

  const activityEvents: Array<keyof DocumentEventMap> = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel'];
  activityEvents.forEach((eventName) => {
    document.addEventListener(eventName, handleUserActivity, { passive: true });
  });

  window.addEventListener('focus', handleUserActivity);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      handleUserActivity();
    }
  });

  startPauseButton.addEventListener('click', () => {
    if (timer.isRunning()) {
      timer.pause();
      inactivityMonitor.clearAutoPause();
    } else {
      timer.start();
      inactivityMonitor.clearAutoPause();
    }

    handleUserActivity();
    syncDisplay();
  });

  resetButton.addEventListener('click', () => {
    timer.reset();
    inactivityMonitor.clearAutoPause();
    handleUserActivity();
    syncDisplay();
  });

  const evaluateAndRender = (): void => {
    void inactivityMonitor.evaluate().finally(() => {
      syncDisplay();
      renderDiagnostics();
    });
  };

  window.setInterval(evaluateAndRender, 250);

  handleUserActivity();
  syncDisplay();
  renderDiagnostics();
};

document.addEventListener('DOMContentLoaded', () => {
  initializeTimerUI();
});
