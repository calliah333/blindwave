use std::{path::PathBuf, process::{Child, Command, Stdio}, sync::Mutex};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

struct PlaybackState(Mutex<Option<Child>>);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct FfplayStatus {
    available: bool,
    executable: String,
}

fn bundled_ffplay(app: &AppHandle) -> Option<PathBuf> {
    let resource_dir = app.path().resource_dir().ok()?;
    let name = if cfg!(windows) { "ffplay.exe" } else { "ffplay" };
    let path = resource_dir.join(name);
    path.is_file().then_some(path)
}

fn executable(custom_path: Option<&str>, app: &AppHandle) -> String {
    if let Some(path) = custom_path.filter(|value| !value.trim().is_empty()) {
        return path.to_string();
    }
    if let Some(path) = bundled_ffplay(app) {
        return path.to_string_lossy().into_owned();
    }
    // Let the OS resolve ffplay from PATH. This keeps the app portable while
    // allowing users to install FFmpeg with their preferred package manager.
    "ffplay".to_string()
}

fn command(executable: &str) -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new(executable);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: playback should never flash a console window.
        command.creation_flags(0x08000000);
    }
    command
}

fn stop_child(state: &PlaybackState) {
    if let Ok(mut current) = state.0.lock() {
        if let Some(mut child) = current.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

#[tauri::command]
fn ffplay_status(app: AppHandle, custom_path: Option<String>) -> FfplayStatus {
    let executable = executable(custom_path.as_deref(), &app);
    let available = command(&executable)
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    FfplayStatus { available, executable }
}

#[tauri::command]
fn start_playback(
    app: AppHandle,
    state: State<'_, PlaybackState>,
    path: String,
    volume: u8,
    replay_gain: bool,
    album_gain: bool,
    custom_path: Option<String>,
) -> Result<(), String> {
    stop_child(&state);

    let audio_path = PathBuf::from(&path);
    if !audio_path.is_file() {
        return Err("That audio file no longer exists.".to_string());
    }

    let executable = executable(custom_path.as_deref(), &app);
    let mut playback = command(&executable);
    playback.args([
        "-nodisp",
        "-autoexit",
        "-hide_banner",
        "-loglevel",
        "error",
        "-volume",
        &volume.to_string(),
    ]);
    if replay_gain {
        playback.args([
            "-af",
            if album_gain {
                "volume=replaygain=album"
            } else {
                "volume=replaygain=track"
            },
        ]);
    }
    let child = playback
        .arg(&path)
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|error| {
            format!(
                "Could not start FFmpeg playback ({executable}). Install FFmpeg and make sure ffplay is on your PATH. {error}"
            )
        })?;

    state
        .0
        .lock()
        .map_err(|_| "Playback state is unavailable.".to_string())?
        .replace(child);
    Ok(())
}

#[tauri::command]
fn stop_playback(state: State<'_, PlaybackState>) {
    stop_child(&state);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(PlaybackState(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            ffplay_status,
            start_playback,
            stop_playback
        ])
        .run(tauri::generate_context!())
        .expect("error while running Blindwave");
}
