import { Timer, formatElapsed } from './timer.js';

type UIElements = {
  startPauseButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  display: HTMLElement;
};

const getUIElements = (): UIElements => {
  const startPauseButton = document.getElementById('startPauseBtn') as HTMLButtonElement | null;
  const resetButton = document.getElementById('resetBtn') as HTMLButtonElement | null;
  const display = document.getElementById('timerDisplay');

  if (!startPauseButton || !resetButton || !display) {
    throw new Error('Timer controls are missing from the document.');
  }

  return { startPauseButton, resetButton, display };
};

const initializeTimerUI = (): void => {
  const timer = new Timer();
  const { startPauseButton, resetButton, display } = getUIElements();

  const syncDisplay = (): void => {
    display.textContent = formatElapsed(timer.getElapsedMs());
    resetButton.disabled = timer.isRunning() || timer.getElapsedMs() === 0;
    startPauseButton.textContent = timer.isRunning() ? 'Pause' : 'Start';
  };

  startPauseButton.addEventListener('click', () => {
    if (timer.isRunning()) {
      timer.pause();
    } else {
      timer.start();
    }

    syncDisplay();
  });

  resetButton.addEventListener('click', () => {
    timer.reset();
    syncDisplay();
  });

  window.setInterval(syncDisplay, 250);
  syncDisplay();
};

document.addEventListener('DOMContentLoaded', () => {
  initializeTimerUI();
});
