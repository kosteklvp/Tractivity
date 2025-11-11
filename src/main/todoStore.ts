import { app } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type TodoRecord = {
  id: number;
  title: string;
  completed: boolean;
  createdAt: string;
};

type PersistedState = {
  nextId: number;
  todos: TodoRecord[];
};

const DEFAULT_STATE: PersistedState = {
  nextId: 1,
  todos: []
};

let storePath: string | undefined;
let state: PersistedState | undefined;

const ensureInitialized = (): void => {
  if (!storePath || !state) {
    throw new Error('Todo store has not been initialized.');
  }
};

const getStorePath = (): string => {
  const directory = join(app.getPath('userData'), 'tractivity');

  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  return join(directory, 'todos.json');
};

const loadStateFromDisk = (path: string): PersistedState => {
  if (!existsSync(path)) {
    return { ...DEFAULT_STATE, todos: [] };
  }

  try {
    const raw = readFileSync(path, 'utf8');

    if (!raw.trim()) {
      return { ...DEFAULT_STATE, todos: [] };
    }

    const parsed = JSON.parse(raw) as Partial<PersistedState>;

    const nextId = typeof parsed.nextId === 'number' && Number.isFinite(parsed.nextId) && parsed.nextId > 0 ? Math.floor(parsed.nextId) : DEFAULT_STATE.nextId;
    const todos = Array.isArray(parsed.todos)
      ? parsed.todos
          .map((item) => ({
            id: typeof item?.id === 'number' ? Math.floor(item.id) : undefined,
            title: typeof item?.title === 'string' ? item.title : undefined,
            completed: typeof item?.completed === 'boolean' ? item.completed : false,
            createdAt: typeof item?.createdAt === 'string' ? item.createdAt : undefined
          }))
          .filter((item): item is TodoRecord => Boolean(item.id && item.title && item.createdAt))
      : [];

    return {
      nextId: todos.length > 0 ? Math.max(nextId, Math.max(...todos.map((todo) => todo.id)) + 1) : nextId,
      todos
    };
  } catch (error) {
    console.warn('Failed to load todo data; starting with an empty list.', error);
    return { ...DEFAULT_STATE, todos: [] };
  }
};

const persistState = (): void => {
  ensureInitialized();

  const directory = dirname(storePath!);

  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }

  const json = JSON.stringify(state, null, 2);
  writeFileSync(storePath!, json, 'utf8');
};

const cloneRecord = (record: TodoRecord): TodoRecord => ({ ...record });

const sanitizeTitle = (title: string): string => {
  const trimmed = title.trim();

  if (!trimmed) {
    throw new Error('Todo title cannot be empty.');
  }

  if (trimmed.length > 500) {
    throw new Error('Todo title is too long.');
  }

  return trimmed;
};

export const initializeTodoStore = (): void => {
  const path = getStorePath();
  storePath = path;
  state = loadStateFromDisk(path);
};

export const listTodos = (): TodoRecord[] => {
  ensureInitialized();
  return state!.todos.map((todo) => cloneRecord(todo));
};

export const createTodo = (title: string): TodoRecord => {
  ensureInitialized();

  const sanitizedTitle = sanitizeTitle(title);

  const record: TodoRecord = {
    id: state!.nextId++,
    title: sanitizedTitle,
    completed: false,
    createdAt: new Date().toISOString()
  };

  state!.todos.unshift(record);

  try {
    persistState();
  } catch (error) {
    // revert mutation if persisting fails
    state!.todos.shift();
    state!.nextId = record.id;
    throw error;
  }

  return cloneRecord(record);
};

export const setTodoCompleted = (id: number, completed: boolean): TodoRecord | undefined => {
  ensureInitialized();

  const todo = state!.todos.find((item) => item.id === id);

  if (!todo) {
    return undefined;
  }

  const previousCompleted = todo.completed;
  todo.completed = completed;

  try {
    persistState();
  } catch (error) {
    todo.completed = previousCompleted;
    throw error;
  }

  return cloneRecord(todo);
};

export const deleteTodo = (id: number): boolean => {
  ensureInitialized();

  const previousTodos = state!.todos;
  const filtered = state!.todos.filter((item) => item.id !== id);

  if (filtered.length === previousTodos.length) {
    return false;
  }

  state!.todos = filtered;

  try {
    persistState();
  } catch (error) {
    state!.todos = previousTodos;
    throw error;
  }

  return true;
};

export const getTodoById = (id: number): TodoRecord | undefined => {
  ensureInitialized();
  const todo = state!.todos.find((item) => item.id === id);
  return todo ? cloneRecord(todo) : undefined;
};
