export { };

declare global {
  interface TractivityApi {
    appVersion: () => string;
    getSystemIdleTime: () => Promise<number>;
    onOpenSettings: (callback: () => void) => () => void;
  }

  interface Window {
    tractivityApi?: TractivityApi;
  }
}
