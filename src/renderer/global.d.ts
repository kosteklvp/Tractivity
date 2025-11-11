export { };

declare global {
  interface TodoItem {
    id: number;
    title: string;
    completed: boolean;
    createdAt: string;
  }

  interface TractivityApi {
    appVersion: () => string;
    getSystemIdleTime: () => Promise<number>;
    onOpenSettings: (callback: () => void) => () => void;
    todos: {
      list: () => Promise<TodoItem[]>;
      create: (title: string) => Promise<TodoItem>;
      setCompleted: (id: number, completed: boolean) => Promise<TodoItem>;
      delete: (id: number) => Promise<{ success: boolean }>;
    };
  }

  interface Window {
    tractivityApi?: TractivityApi;
  }
}
