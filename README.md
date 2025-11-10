# Tractivity

Tractivity is a minimalist desktop timer built with Electron and TypeScript. It focuses on accurate work-time tracking with an auto-pause feature that relies on system idle time, plus a simple UI layout designed around expandable panels.

## Requirements

- Node.js 18 or newer
- npm 9 or newer

## Installation

```bash
npm install
```

## Available scripts

- `npm start` – build the project and launch the Electron app.
- `npm run dev` – start the development mode with TypeScript watch and auto-relaunch (requires a desktop session).
- `npm run build` – produce the compiled output in the `dist` directory.
- `npm test` – run the Vitest suite that covers timer and inactivity logic.
- `npm run lint` – run ESLint on all TypeScript sources.
- `npm run dist:win` – create the Windows distributables under `release/`.

## Project structure

```text
src/
  assets/     Application assets (icons, static files)
  main/       Electron main-process logic
  preload/    Preload bridge that exposes safe APIs to the renderer
  renderer/   Timer UI, inactivity monitor, and styling
tests/        Vitest unit tests for timer behaviour
```

## Building the Windows installer

1. Run `npm run dist:win` (the script clears any previous `release/windows-build` contents).
2. The task compiles TypeScript, copies static assets, and invokes `electron-builder`.
3. The resulting NSIS installer and portable build are stored in `release/windows-build/`.

> **Note:** On Windows the packaging toolchain may need symlink support. Enable “Developer Mode” in system settings or run the command prompt with elevated privileges if you encounter the error `A required privilege is not held by the client`.

## Roadmap

- Session history with persistent storage.
- Multiple concurrent timers.
- Installation packages for macOS and Linux.
