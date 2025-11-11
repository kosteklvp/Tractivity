import { InactivityMonitor } from './inactivityMonitor.js';
import { Timer, formatElapsed } from './timer.js';

const SETTINGS_STORAGE_KEY = 'tractivity:settings';
const DEFAULT_IDLE_DELAY_SECONDS = 60;

type SettingsState = {
  afkHandlingEnabled: boolean;
  afkIdleDelaySeconds: number;
};

type UIElements = {
  startPauseButton: HTMLButtonElement;
  resetButton: HTMLButtonElement;
  display: HTMLElement;
  statusLabel: HTMLElement;
  debugInfo: HTMLElement;
};

type TimerContext = {
  timer: Timer;
  inactivityMonitor: InactivityMonitor;
  syncDisplay: () => void;
  renderDiagnostics: () => void;
  handleUserActivity: () => void;
};

type TimerHooks = {
  onTimerStart?: () => void;
  onManualPause?: () => void;
  onTimerReset?: () => void;
  onTick?: (payload: { running: boolean; pausedByIdle: boolean }) => void;
};

type TodoPanelElements = {
  form: HTMLFormElement;
  input: HTMLInputElement;
  submitButton: HTMLButtonElement;
  list: HTMLUListElement;
  emptyState: HTMLElement;
  message: HTMLElement;
};

type MainScreen = 'placeholder' | 'settings' | 'analytics';

type AnalyticsElements = {
  panel: HTMLElement;
  canvas: HTMLCanvasElement;
  emptyState: HTMLElement;
  activeValue: HTMLElement;
  rangeValue: HTMLElement;
  statusValue: HTMLElement;
};

type AnalyticsController = {
  handleTimerStart: () => void;
  handleManualPause: () => void;
  handleReset: () => void;
  handleTick: (payload: { running: boolean; pausedByIdle: boolean }) => void;
  forceRender: () => void;
};

type MainPanelManager = {
  setActiveScreen: (screen: MainScreen) => void;
  getCurrentScreen: () => MainScreen;
  menuButtons: Partial<Record<Exclude<MainScreen, 'placeholder'>, HTMLButtonElement | null>>;
};

const TODO_MESSAGE_TIMEOUT_MS = 4000;

let analyticsController: AnalyticsController | null = null;

const DEFAULT_SETTINGS: SettingsState = {
  afkHandlingEnabled: true,
  afkIdleDelaySeconds: DEFAULT_IDLE_DELAY_SECONDS
};

let currentSettings: SettingsState = { ...DEFAULT_SETTINGS };

const clampIdleDelaySeconds = (value: number): number => {
  if (!Number.isFinite(value)) {
    return DEFAULT_SETTINGS.afkIdleDelaySeconds;
  }

  return Math.min(1800, Math.max(1, Math.round(value)));
};

const loadSettings = (): SettingsState => {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);

    if (!raw) {
      return { ...DEFAULT_SETTINGS };
    }

    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    const afkHandlingEnabled = typeof parsed.afkHandlingEnabled === 'boolean' ? parsed.afkHandlingEnabled : DEFAULT_SETTINGS.afkHandlingEnabled;
    const parsedIdle =
      typeof parsed.afkIdleDelaySeconds === 'number'
        ? parsed.afkIdleDelaySeconds
        : Number.parseInt(String(parsed.afkIdleDelaySeconds ?? ''), 10);

    const afkIdleDelaySeconds = Number.isFinite(parsedIdle)
      ? clampIdleDelaySeconds(parsedIdle)
      : DEFAULT_SETTINGS.afkIdleDelaySeconds;

    return {
      afkHandlingEnabled,
      afkIdleDelaySeconds
    };
  } catch (error) {
    console.warn('Failed to read settings, using defaults.', error);
    return { ...DEFAULT_SETTINGS };
  }
};

const persistSettings = (settings: SettingsState): void => {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn('Failed to persist settings.', error);
  }
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

const createMainPanelManager = (): MainPanelManager => {
  const panels: Record<MainScreen, HTMLElement | null> = {
    placeholder: document.getElementById('mainPlaceholder'),
    settings: document.getElementById('settingsPanel'),
    analytics: document.getElementById('analyticsPanel')
  };

  const menuButtons: Partial<Record<Exclude<MainScreen, 'placeholder'>, HTMLButtonElement | null>> = {
    settings: document.getElementById('menuSettings') as HTMLButtonElement | null,
    analytics: document.getElementById('menuAnalytics') as HTMLButtonElement | null
  };

  let currentScreen: MainScreen = 'placeholder';

  const setActiveScreen = (screen: MainScreen): void => {
    currentScreen = screen;

    (Object.entries(panels) as Array<[MainScreen, HTMLElement | null]>).forEach(([key, panel]) => {
      if (!panel) {
        return;
      }

      panel.classList.toggle('hidden', key !== screen);
    });

    Object.entries(menuButtons).forEach(([key, button]) => {
      if (!button) {
        return;
      }

      button.classList.toggle('is-active', key === screen);
    });
  };

  return {
    setActiveScreen,
    getCurrentScreen: () => currentScreen,
    menuButtons
  };
};

const initializeTimerUI = (initialSettings: SettingsState, hooks: TimerHooks = {}): TimerContext => {
  currentSettings = { ...initialSettings };

  const timer = new Timer();
  const { startPauseButton, resetButton, display, statusLabel, debugInfo } = getUIElements();

  const api = window.tractivityApi;
  const idleTimeProvider = api?.getSystemIdleTime ? () => api.getSystemIdleTime() : undefined;

  const inactivityMonitor = new InactivityMonitor(
    timer,
    currentSettings.afkIdleDelaySeconds * 1000,
    idleTimeProvider,
    () => {
      syncDisplay();
      renderDiagnostics();
    }
  );

  inactivityMonitor.setEnabled(currentSettings.afkHandlingEnabled);

  function syncDisplay(): void {
    const elapsed = timer.getElapsedMs();
    const running = timer.isRunning();
    const pausedByIdle = inactivityMonitor.isPausedByInactivity();

    display.textContent = formatElapsed(elapsed);
    resetButton.disabled = running || elapsed === 0;
    startPauseButton.textContent = running ? 'Pause' : 'Start';

    if (running) {
      statusLabel.textContent = '';
    } else if (pausedByIdle && currentSettings.afkHandlingEnabled) {
      statusLabel.textContent = 'Paused (AFK)';
    } else {
      statusLabel.textContent = 'Paused';
    }
  }

  function renderDiagnostics(): void {
    const diagnostics = inactivityMonitor.getDiagnostics();
    const providerAvailable = Boolean(window.tractivityApi?.getSystemIdleTime);
    const bridgeState = typeof window.tractivityApi;
    const systemIdleSeconds = diagnostics.systemIdleMs !== undefined ? (diagnostics.systemIdleMs / 1000).toFixed(2) : 'n/a';
    const effectiveIdleSeconds = (diagnostics.effectiveIdleMs / 1000).toFixed(2);
    const pausedNote = diagnostics.pausedByIdle ? ' | Auto-paused' : '';
    const afkStatus = currentSettings.afkHandlingEnabled
      ? `enabled (${currentSettings.afkIdleDelaySeconds}s)`
      : 'disabled';

    debugInfo.textContent = `AFK: ${afkStatus} | Bridge: ${bridgeState} | Idle provider: ${providerAvailable ? 'available' : 'missing'} | System idle: ${systemIdleSeconds}s | Effective idle: ${effectiveIdleSeconds}s${pausedNote}`;
  }

  function handleUserActivity(): void {
    inactivityMonitor.markActivity();
    renderDiagnostics();
  }

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
      hooks.onManualPause?.();
    } else {
      timer.start();
      inactivityMonitor.clearAutoPause();
      hooks.onTimerStart?.();
    }

    handleUserActivity();
    syncDisplay();
  });

  resetButton.addEventListener('click', () => {
    timer.reset();
    inactivityMonitor.clearAutoPause();
    hooks.onTimerReset?.();
    handleUserActivity();
    syncDisplay();
  });

  const evaluateAndRender = (): void => {
    void inactivityMonitor.evaluate().finally(() => {
      syncDisplay();
      renderDiagnostics();
      hooks.onTick?.({ running: timer.isRunning(), pausedByIdle: inactivityMonitor.isPausedByInactivity() });
    });
  };

  window.setInterval(evaluateAndRender, 250);

  handleUserActivity();
  syncDisplay();
  renderDiagnostics();

  return {
    timer,
    inactivityMonitor,
    syncDisplay,
    renderDiagnostics,
    handleUserActivity
  };
};

const initializeSettingsPanel = (context: TimerContext): void => {
  const settingsPanel = document.getElementById('settingsPanel');
  const afkToggle = document.getElementById('afkToggle') as HTMLInputElement | null;
  const afkThresholdInput = document.getElementById('afkThresholdInput') as HTMLInputElement | null;

  if (!settingsPanel || !afkToggle || !afkThresholdInput) {
    throw new Error('Settings panel elements are missing from the document.');
  }

  const syncForm = (): void => {
    afkToggle.checked = currentSettings.afkHandlingEnabled;
    afkThresholdInput.value = String(currentSettings.afkIdleDelaySeconds);
    afkThresholdInput.disabled = !currentSettings.afkHandlingEnabled;
  };

  const applySettings = (): void => {
    context.inactivityMonitor.setThresholdMs(currentSettings.afkIdleDelaySeconds * 1000);
    context.inactivityMonitor.setEnabled(currentSettings.afkHandlingEnabled);
    context.inactivityMonitor.clearAutoPause();
    context.handleUserActivity();
    context.syncDisplay();
    context.renderDiagnostics();
  };

  afkToggle.addEventListener('change', () => {
    currentSettings = {
      ...currentSettings,
      afkHandlingEnabled: afkToggle.checked
    };

    persistSettings(currentSettings);
    syncForm();
    applySettings();
  });

  const commitThresholdChange = (): void => {
    const rawValue = afkThresholdInput.value.trim();

    if (rawValue === '') {
      syncForm();
      return;
    }

    const parsedValue = Number.parseInt(rawValue, 10);

    if (Number.isNaN(parsedValue)) {
      syncForm();
      return;
    }

    const clampedValue = clampIdleDelaySeconds(parsedValue);

    currentSettings = {
      ...currentSettings,
      afkIdleDelaySeconds: clampedValue
    };

    persistSettings(currentSettings);
    syncForm();
    applySettings();
  };

  afkThresholdInput.addEventListener('change', commitThresholdChange);
  afkThresholdInput.addEventListener('blur', commitThresholdChange);
  afkThresholdInput.addEventListener('input', () => {
    const sanitized = afkThresholdInput.value.replace(/[^0-9]/g, '');

    if (sanitized !== afkThresholdInput.value) {
      afkThresholdInput.value = sanitized;
    }
  });

  syncForm();
  applySettings();
};

const getAnalyticsElements = (): AnalyticsElements => {
  const panel = document.getElementById('analyticsPanel');
  const canvas = document.getElementById('analyticsCanvas') as HTMLCanvasElement | null;
  const emptyState = document.getElementById('analyticsEmpty');
  const activeValue = document.getElementById('analyticsActiveValue');
  const rangeValue = document.getElementById('analyticsRangeValue');
  const statusValue = document.getElementById('analyticsStatusValue');

  if (!panel || !canvas || !emptyState || !activeValue || !rangeValue || !statusValue) {
    throw new Error('Analytics panel elements are missing from the document.');
  }

  return { panel, canvas, emptyState, activeValue, rangeValue, statusValue };
};

const initializeAnalyticsPanel = (): AnalyticsController => {
  const elements = getAnalyticsElements();
  const context = elements.canvas.getContext('2d');

  if (!context) {
    throw new Error('Failed to obtain 2D context for analytics canvas.');
  }

  type Sample = { time: number; value: number };

  const state: {
    startTimestamp: number | null;
    lastTickTimestamp: number | null;
    lastSampleSecond: number | null;
    activeSeconds: number;
    samples: Sample[];
  } = {
    startTimestamp: null,
    lastTickTimestamp: null,
    lastSampleSecond: null,
    activeSeconds: 0,
    samples: []
  };

  const MAX_SAMPLES = 7200; // up to two hours of per-second samples

  const formatClockLabel = (date: Date): string =>
    date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });

  const ensureCanvasSize = (): { ratio: number; width: number; height: number } => {
    const ratio = window.devicePixelRatio ?? 1;
    const width = elements.canvas.clientWidth || elements.panel.clientWidth || 1;
    const height = elements.canvas.clientHeight || elements.panel.clientHeight || 1;
    const pixelWidth = Math.max(1, Math.floor(width * ratio));
    const pixelHeight = Math.max(1, Math.floor(height * ratio));

    if (elements.canvas.width !== pixelWidth || elements.canvas.height !== pixelHeight) {
      elements.canvas.width = pixelWidth;
      elements.canvas.height = pixelHeight;
    }

    return { ratio, width, height };
  };

  const clearCanvas = (): void => {
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    context.restore();
  };

  const updateSummary = (now: number): void => {
    elements.activeValue.textContent = formatElapsed(Math.round(Math.max(0, state.activeSeconds) * 1000));
    if (state.startTimestamp) {
      elements.rangeValue.textContent = `${formatClockLabel(new Date(state.startTimestamp))} – ${formatClockLabel(new Date(now))}`;
    } else {
      elements.rangeValue.textContent = '—';
    }
  };

  const renderChart = (): void => {
    if (!state.startTimestamp || state.samples.length < 2) {
      clearCanvas();
      elements.emptyState.classList.remove('hidden');
      return;
    }

    const { ratio, width, height } = ensureCanvasSize();

    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, elements.canvas.width, elements.canvas.height);
    context.scale(ratio, ratio);

    const padding = { top: 18, right: 24, bottom: 44, left: 56 };
    const plotWidth = Math.max(1, width - padding.left - padding.right);
    const plotHeight = Math.max(1, height - padding.top - padding.bottom);

    const times = state.samples.map((sample) => (sample.time - state.startTimestamp!) / 1000);
    const values = state.samples.map((sample) => sample.value);
    const xMax = Math.max(10, times[times.length - 1] ?? 10);
    const yMax = Math.max(10, ...values, 1);

    const projectX = (seconds: number): number => padding.left + (seconds / xMax) * plotWidth;
    const projectY = (value: number): number => height - padding.bottom - (value / yMax) * plotHeight;

    // Axes
    context.strokeStyle = '#d2d2d2';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(padding.left, padding.top);
    context.lineTo(padding.left, height - padding.bottom);
    context.lineTo(width - padding.right, height - padding.bottom);
    context.stroke();

    // Horizontal grid (mid)
    context.setLineDash([4, 4]);
    context.beginPath();
    context.moveTo(padding.left, projectY(yMax / 2));
    context.lineTo(width - padding.right, projectY(yMax / 2));
    context.stroke();
    context.setLineDash([]);

    // Line
    const lastSample = state.samples[state.samples.length - 1];

    const isManualPause = elements.statusValue.textContent === 'Paused';
    context.lineWidth = 3;
    for (let i = 1; i < state.samples.length; i += 1) {
      const previous = state.samples[i - 1];
      const current = state.samples[i];
      const previousX = projectX((previous.time - state.startTimestamp!) / 1000);
      const previousY = projectY(previous.value);
      const currentX = projectX((current.time - state.startTimestamp!) / 1000);
      const currentY = projectY(current.value);
      const delta = current.value - previous.value;

      let strokeColor = '#4452ff';
      if (!isManualPause) {
        if (delta > 0.0001) {
          strokeColor = '#1a7f37';
        } else if (delta < -0.0001) {
          strokeColor = '#c62828';
        }
      }

      context.beginPath();
      context.moveTo(previousX, previousY);
      context.lineTo(currentX, currentY);
      context.strokeStyle = strokeColor;
      context.stroke();
    }

    // Axis labels
    context.fillStyle = '#4a4a4a';
    context.font = '12px "Segoe UI", Arial, sans-serif';
    context.textAlign = 'left';
    context.fillText('0s', padding.left - 44, height - padding.bottom + 4);
    context.fillText(`${Math.round(yMax)}s`, padding.left - 44, padding.top + 12);

    context.textAlign = 'left';
    context.fillText(formatClockLabel(new Date(state.startTimestamp)), padding.left, height - padding.bottom + 28);
    context.textAlign = 'right';
    context.fillText(formatClockLabel(new Date(lastSample.time)), width - padding.right, height - padding.bottom + 28);

    context.restore();
    elements.emptyState.classList.add('hidden');
  };

  const resetState = (): void => {
    state.startTimestamp = null;
    state.lastTickTimestamp = null;
    state.lastSampleSecond = null;
    state.activeSeconds = 0;
    state.samples = [];
    elements.statusValue.textContent = 'Idle';
    elements.activeValue.textContent = formatElapsed(0);
    elements.rangeValue.textContent = '—';
    elements.emptyState.classList.remove('hidden');
    clearCanvas();
  };

  resetState();

  return {
    handleTimerStart: () => {
      const now = Date.now();
      const currentSecond = Math.floor(now / 1000);
      if (!state.startTimestamp) {
        state.startTimestamp = now;
        state.samples = [{ time: currentSecond * 1000, value: state.activeSeconds }];
        state.lastSampleSecond = currentSecond;
      }
      state.lastTickTimestamp = now;
      elements.statusValue.textContent = 'Active';
      updateSummary(now);
      renderChart();
    },
    handleManualPause: () => {
      const now = Date.now();
      state.lastTickTimestamp = now;
      elements.statusValue.textContent = 'Paused';
      updateSummary(now);
      renderChart();
    },
    handleReset: () => {
      resetState();
    },
    handleTick: ({ running, pausedByIdle }) => {
      const now = Date.now();

      if (!state.startTimestamp) {
        if (!running) {
          return;
        }

        const currentSecond = Math.floor(now / 1000);
        state.startTimestamp = now;
        state.samples = [{ time: currentSecond * 1000, value: state.activeSeconds }];
        state.lastSampleSecond = currentSecond;
      }

      if (!state.lastTickTimestamp) {
        state.lastTickTimestamp = now;
        updateSummary(now);
        return;
      }

      const deltaSeconds = (now - state.lastTickTimestamp) / 1000;
      state.lastTickTimestamp = now;

      if (pausedByIdle) {
        elements.statusValue.textContent = 'AFK';
        state.activeSeconds = Math.max(0, state.activeSeconds - deltaSeconds);
      } else if (running) {
        elements.statusValue.textContent = 'Active';
        state.activeSeconds = Math.max(0, state.activeSeconds + deltaSeconds);
      } else {
        elements.statusValue.textContent = 'Paused';
        updateSummary(now);
        renderChart();
        return;
      }

      // Round to milliseconds precision for display stability
      state.activeSeconds = Math.max(0, state.activeSeconds);

      const lastSample = state.samples[state.samples.length - 1];
      const currentSecond = Math.floor(now / 1000);
      const shouldRecordSample = state.lastSampleSecond === null || currentSecond > state.lastSampleSecond || !lastSample;

      if (shouldRecordSample) {
        const sampleTime = currentSecond * 1000;
        state.samples.push({ time: sampleTime, value: state.activeSeconds });
        state.lastSampleSecond = currentSecond;
      }

      if (state.samples.length > MAX_SAMPLES) {
        state.samples.splice(0, state.samples.length - MAX_SAMPLES);
      }

      updateSummary(now);
      renderChart();
    },
    forceRender: () => {
      updateSummary(Date.now());
      renderChart();
    }
  };
};

const getTodoPanelElements = (): TodoPanelElements => {
  const form = document.getElementById('todoForm') as HTMLFormElement | null;
  const input = document.getElementById('todoInput') as HTMLInputElement | null;
  const submitButton = form?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  const list = document.getElementById('todoList') as HTMLUListElement | null;
  const emptyState = document.getElementById('todoEmpty');
  const message = document.getElementById('todoMessage');

  if (!form || !input || !submitButton || !list || !emptyState || !message) {
    throw new Error('Todo panel elements are missing from the document.');
  }

  return { form, input, submitButton, list, emptyState, message };
};

const initializeTodoPanel = async (): Promise<void> => {
  const elements = getTodoPanelElements();
  const api = window.tractivityApi;

  if (!api?.todos) {
    console.warn('Todo API is unavailable.');
    elements.form.classList.add('hidden');
    elements.message.classList.remove('hidden');
    elements.message.textContent = 'Tasks are unavailable in this build.';
    elements.message.classList.add('is-error');
    return;
  }

  let todoItems: TodoItem[] = [];
  let messageTimeoutId: number | undefined;

  const hideMessage = (): void => {
    elements.message.textContent = '';
    elements.message.classList.add('hidden');
    elements.message.classList.remove('is-info', 'is-error');
  };

  const showMessage = (text: string, intent: 'info' | 'error' = 'info'): void => {
    window.clearTimeout(messageTimeoutId);

    if (!text) {
      hideMessage();
      return;
    }

    elements.message.textContent = text;
    elements.message.classList.remove('hidden');
    elements.message.classList.remove('is-info', 'is-error');
    elements.message.classList.add(intent === 'error' ? 'is-error' : 'is-info');

    messageTimeoutId = window.setTimeout(() => {
      hideMessage();
    }, TODO_MESSAGE_TIMEOUT_MS);
  };

  const renderList = (): void => {
    elements.list.innerHTML = '';

    if (todoItems.length === 0) {
      elements.emptyState.classList.remove('hidden');
      return;
    }

    elements.emptyState.classList.add('hidden');

    const fragment = document.createDocumentFragment();

    todoItems.forEach((todo) => {
      const listItem = document.createElement('li');
      listItem.className = 'todo-item';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = todo.completed;

      const title = document.createElement('p');
      title.className = 'todo-title';
      title.textContent = todo.title;

      if (todo.completed) {
        title.classList.add('is-completed');
      }

      const actions = document.createElement('div');
      actions.className = 'todo-actions';

      const removeButton = document.createElement('button');
      removeButton.type = 'button';
      removeButton.className = 'todo-remove';
      removeButton.textContent = 'Delete';

      checkbox.addEventListener('change', async () => {
        const nextCompleted = checkbox.checked;
        checkbox.disabled = true;
        title.classList.toggle('is-completed', nextCompleted);

        try {
          const updated = await api.todos.setCompleted(todo.id, nextCompleted);
          todoItems = todoItems.map((item) => (item.id === updated.id ? updated : item));
          showMessage(nextCompleted ? 'Task completed.' : 'Task re-opened.', 'info');
        } catch (error) {
          console.error('Failed to update todo item.', error);
          checkbox.checked = !nextCompleted;
          title.classList.toggle('is-completed', checkbox.checked);
          showMessage('Could not update the task.', 'error');
        } finally {
          checkbox.disabled = false;
        }
      });

      removeButton.addEventListener('click', async () => {
        removeButton.disabled = true;

        try {
          await api.todos.delete(todo.id);
          todoItems = todoItems.filter((item) => item.id !== todo.id);
          renderList();
          showMessage('Task removed.', 'info');
        } catch (error) {
          console.error('Failed to delete todo item.', error);
          showMessage('Could not remove the task.', 'error');
        } finally {
          removeButton.disabled = false;
        }
      });

      actions.appendChild(removeButton);
      listItem.appendChild(checkbox);
      listItem.appendChild(title);
      listItem.appendChild(actions);

      fragment.appendChild(listItem);
    });

    elements.list.appendChild(fragment);
  };

  elements.form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const title = elements.input.value.trim();

    if (!title) {
      showMessage('Please enter a task description first.', 'error');
      return;
    }

    elements.submitButton.disabled = true;

    try {
      const created = await api.todos.create(title);
      todoItems = [created, ...todoItems];
      elements.input.value = '';
      renderList();
      showMessage('Task added.', 'info');
    } catch (error) {
      console.error('Failed to create todo item.', error);
      showMessage('Could not save the task.', 'error');
    } finally {
      elements.submitButton.disabled = false;
      elements.input.focus();
    }
  });

  try {
    todoItems = await api.todos.list();
    renderList();
  } catch (error) {
    console.error('Failed to load todos.', error);
    showMessage('Could not load tasks. Try again later.', 'error');
  }
};

document.addEventListener('DOMContentLoaded', () => {
  const panelManager = createMainPanelManager();

  const switchScreen = (screen: MainScreen): void => {
    panelManager.setActiveScreen(screen);

    if (screen === 'analytics') {
      window.requestAnimationFrame(() => {
        analyticsController?.forceRender();
      });
    }
  };

  const loadedSettings = loadSettings();
  const timerContext = initializeTimerUI(loadedSettings, {
    onTimerStart: () => {
      analyticsController?.handleTimerStart();
    },
    onManualPause: () => {
      analyticsController?.handleManualPause();
    },
    onTimerReset: () => {
      analyticsController?.handleReset();
    },
    onTick: (payload) => {
      analyticsController?.handleTick(payload);
    }
  });

  initializeSettingsPanel(timerContext);
  analyticsController = initializeAnalyticsPanel();
  void initializeTodoPanel();

  const api = window.tractivityApi;
  const unsubscribeSettings = api?.onOpenSettings(() => {
    switchScreen('settings');
  });

  window.addEventListener('beforeunload', () => {
    unsubscribeSettings?.();
  });

  panelManager.menuButtons.settings?.addEventListener('click', () => switchScreen('settings'));
  panelManager.menuButtons.analytics?.addEventListener('click', () => switchScreen('analytics'));

  switchScreen('settings');
});
