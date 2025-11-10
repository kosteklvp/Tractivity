export { };

declare global {
  interface TractivityApi {
    appVersion: () => string;
    getSystemIdleTime: () => Promise<number>;
  }

  interface Window {
    tractivityApi?: TractivityApi;
  }
}
