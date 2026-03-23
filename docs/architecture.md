# ZenScreen Architecture Documentation

## Overview
ZenScreen is a high-performance screen recording and video editing application built with Electron, Vite, and React. It achieves a professional editing experience (similar to Screen Studio) by leveraging hardware-accelerated rendering and modern Web APIs.

## 1. Process Model
The application follows the standard Electron multi-process architecture:

### 1.1 Main Process (`electron/main.ts`)
- **Lifecycle Management**: Handles app startup, window creation, and tray icon.
- **IPC Handlers (`electron/ipc/handlers.ts`)**: Acts as a bridge between the system and the UI. Manages file I/O, dialogs, and platform-specific logic.
- **Cursor Tracking**: During recording, the main process samples the cursor position at 10Hz and saves it to a `.cursor.json` telemetry file. This is later used for smooth, automated zooming in the editor.

### 1.2 Renderer Process (React)
- **Editor UI**: Built with Radix UI and Tailwind CSS.
- **State Management**: Uses a custom `useEditorHistory` hook for undo/redo support.
- **Performance**: Heavy rendering tasks are offloaded to specialized libraries.

## 2. Rendering & Playback (`src/components/video-editor/VideoPlayback.tsx`)
Instead of using standard HTML5 `<video>` for the editor preview, ZenScreen uses **PixiJS** (a WebGL-based 2D engine).

- **Real-time Composition**: PixiJS simultaneously renders the screen capture, webcam overlay, background wallpapers, and annotations.
- **Visual Effects**: Uses GLSL shaders for real-time motion blur, blurring backgrounds, and smooth pan/zoom transitions.
- **Benefit**: Achieves consistent 60fps performance even with complex layers and high-resolution sources.

## 3. Export Pipeline (`src/lib/exporter/`)
The export engine is designed to be fast and visually lossless without requiring bulky native dependencies like local FFmpeg.

1. **Decoding**: `StreamingVideoDecoder` uses the **WebCodecs API** to extract frames from the raw WebM recording.
2. **Rendering**: `FrameRenderer` uses an offscreen Canvas and PixiJS logic to compose each frame with all filters and annotations applied.
3. **Encoding**: `VideoExporter` uses `VideoEncoder` (WebCodecs) to encode the composed frames into H.264 (AVC).
4. **Muxing**: `VideoMuxer` (using `mp4-muxer`) packages the video and audio streams into a final `.mp4` container.

## 4. Project Persistence
- **Project Files**: Stored with a `.zenscreen` extension. These are JSON files containing all metadata (zoom regions, trims, speed, annotations).
- **Non-destructive**: The original recording is never modified. Exports are generated fresh from the metadata on demand.

## 5. Technical Debt & Future Directions
- **Worker Offloading**: Currently, the export loop runs in the renderer main thread. Moving this to a Web Worker would improve UI responsiveness during long exports.
- **IPC Decoupling**: The central `handlers.ts` should be split into smaller, domain-specific modules.
