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

type TodoPanelElements = {
  form: HTMLFormElement;
  input: HTMLInputElement;
  submitButton: HTMLButtonElement;
  list: HTMLUListElement;
  emptyState: HTMLElement;
  message: HTMLElement;
};

const TODO_MESSAGE_TIMEOUT_MS = 4000;

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

const initializeTimerUI = (initialSettings: SettingsState): TimerContext => {
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

  return {
    timer,
    inactivityMonitor,
    syncDisplay,
    renderDiagnostics,
    handleUserActivity
  };
};

const initializeSettingsPanel = (context: TimerContext): void => {
  const placeholder = document.getElementById('mainPlaceholder');
  const settingsPanel = document.getElementById('settingsPanel');
  const settingsButton = document.getElementById('menuSettings') as HTMLButtonElement | null;
  const afkToggle = document.getElementById('afkToggle') as HTMLInputElement | null;
  const afkThresholdInput = document.getElementById('afkThresholdInput') as HTMLInputElement | null;

  if (!placeholder || !settingsPanel || !settingsButton || !afkToggle || !afkThresholdInput) {
    throw new Error('Settings panel elements are missing from the document.');
  }

  const showSettings = (): void => {
    placeholder.classList.add('hidden');
    settingsPanel.classList.remove('hidden');
    settingsButton.classList.add('is-active');
  };

  settingsButton.addEventListener('click', showSettings);

  const unsubscribe = window.tractivityApi?.onOpenSettings(() => {
    showSettings();
  });

  window.addEventListener('beforeunload', () => {
    unsubscribe?.();
  });

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
  showSettings();
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
  const loadedSettings = loadSettings();
  const timerContext = initializeTimerUI(loadedSettings);

  initializeSettingsPanel(timerContext);
  void initializeTodoPanel();
});
