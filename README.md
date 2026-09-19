# Blindwave

A small cross-platform native desktop app for blind A/B music preference tests.

## What it does

- Drop or choose two versions of the same track.
- Sample different 15-second excerpts from across their shared duration.
- Switch between anonymous samples while playback stays on the same timeline position.
- Balance and reshuffle the A/B labels between rounds to reduce positional bias.
- Require both samples to be heard before accepting each preference.
- Finish every configured round or reveal the result after the next preference.
- Reveal the source filenames and preference breakdown only after the test.
- Keep rounds, listening volume, ReplayGain mode, and the FFplay path in one compact settings panel.

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
