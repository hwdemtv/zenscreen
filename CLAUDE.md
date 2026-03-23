# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ZenScreen is an Electron-based screen recording and video editing application. It records screen/window content, then provides a timeline-based editor for adding zoom effects, annotations, and exporting to MP4 or GIF.

## Development Commands

```bash
npm run dev           # Start Vite dev server with Electron
npm run build         # TypeScript check + Vite build + electron-builder (all platforms)
npm run build:mac     # Build for macOS (x64 + arm64)
npm run build:win     # Build for Windows
npm run build:linux   # Build for Linux (AppImage)
npm run lint          # Biome linter check
npm run lint:fix      # Biome linter with auto-fix
npm run format        # Biome formatter
npm run test          # Vitest unit tests
npm run test:watch    # Vitest watch mode
npm run test:e2e      # Playwright E2E tests
npm run i18n:check    # Check i18n key consistency
```

## Architecture

### Electron Process Model

- **Main process** (`electron/main.ts`): App lifecycle, tray icon, window management, menu setup
- **Preload script** (`electron/preload.ts`): Exposes IPC APIs to renderer via contextBridge
- **IPC handlers** (`electron/ipc/handlers.ts`): All main-renderer communication (recording, file I/O, cursor telemetry)
- **Windows** (`electron/windows.ts`): Three window types created dynamically based on `windowType` URL param

### Window Types

1. **hud-overlay**: Floating HUD for recording controls (always-on-top, transparent)
2. **source-selector**: Modal dialog for selecting screen/window to record
3. **editor**: Full video editor window with timeline, settings panel, playback

### Renderer Architecture (React)

- **Entry**: `src/App.tsx` routes to different components based on `windowType` param
- **VideoEditor**: Main editor component; manages all editor state with undo/redo via `useEditorHistory`
- **Timeline**: Uses `dnd-timeline` library for drag-and-drop zoom regions, trim regions, speed regions
- **VideoPlayback**: PixiJS-based canvas renderer for video with zoom/pan effects and annotations
- **SettingsPanel**: Right sidebar for configuring wallpaper, crop, motion blur, export settings

### Key Modules

- **`src/lib/exporter/`**: Video export pipeline
  - `frameRenderer.ts`: PixiJS renderer for each frame (zoom, crop, wallpaper, annotations)
  - `videoExporter.ts`: MP4 export via WebCodecs API + mp4box muxer
  - `gifExporter.ts`: GIF export via gif.js
  - `streamingDecoder.ts`: Video decoding with frame queue management
- **`src/lib/recordingSession.ts`**: Types for recording session metadata (screen video, webcam video)
- **`src/lib/shortcuts.ts`**: Keyboard shortcut handling
- **`src/contexts/`**: React contexts (I18nContext for localization, ShortcutsContext for hotkeys)
- **`src/i18n/`**: Internationalization with locale files in `locales/en`, `locales/zh-CN`, `locales/es`

### State Management

- Editor state is managed via `useEditorHistory` hook (undo/redo with history)
- Non-undoable state (video paths, loading, playback time) stored separately in VideoEditor
- State includes: zoomRegions, trimRegions, speedRegions, annotationRegions, cropRegion, wallpaper settings, export settings

## Important Conventions

- **Path alias**: `@/` maps to `src/`
- **Formatter**: Biome with tabs, double quotes, line width 100
- **Recording storage**: `userData/recordings/` directory
- **Project files**: `.zenscreen` extension (JSON format)
- **Cursor telemetry**: Captured at 10Hz during recording, stored as `.cursor.json` alongside video
