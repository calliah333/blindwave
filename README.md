# Blindwave

A small cross-platform native desktop app for blind A/B music preference tests.

## What it does

- Drop or choose two music files and label them Track A and Track B.
- Play either track with **FFplay** from FFmpeg.
- Keep rounds, listening volume, ReplayGain mode, and the FFplay path in one compact settings panel.
- Repeat a customizable number of rounds and answer only **I prefer A** or **I prefer B**.
- File names stay out of the listening screen so the choice is about what you hear, not the file name.
- See the preference breakdown when the test is complete.

This is a preference test, not an ABX identification test: there is no hidden X to identify.

## Run in development

Install [FFmpeg](https://ffmpeg.org/download.html) so `ffplay` is available on your PATH, then:

```sh
npm install
npm run app:dev
```

If FFplay is not on PATH, open **Settings** in the app and enter the full path to the executable.

## Build installers

```sh
npm run app:build
```

Tauri creates the native application bundle/installer for the current platform under `src-tauri/target/release/bundle/`.

Tauri packages the app UI, while FFmpeg/FFplay is intentionally resolved from the host PATH (or a user-provided path). This avoids redistributing platform-specific FFmpeg binaries and keeps the app usable on macOS, Windows, and Linux.
