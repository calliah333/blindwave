use std::{
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::Mutex,
};

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
    let name = if cfg!(windows) {
        "ffplay.exe"
    } else {
        "ffplay"
    };
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

fn ffprobe_executable(ffplay: &str) -> String {
    let ffplay_path = Path::new(ffplay);
    if ffplay_path
        .parent()
        .is_some_and(|parent| !parent.as_os_str().is_empty())
    {
        let name = if cfg!(windows) {
            "ffprobe.exe"
        } else {
            "ffprobe"
        };
        return ffplay_path
            .with_file_name(name)
            .to_string_lossy()
            .into_owned();
    }
    "ffprobe".to_string()
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
    FfplayStatus {
        available,
        executable,
    }
}

#[tauri::command]
fn audio_duration(
    app: AppHandle,
    path: String,
    custom_path: Option<String>,
) -> Result<f64, String> {
    if !Path::new(&path).is_file() {
        return Err("That audio file no longer exists.".to_string());
    }

    let ffplay = executable(custom_path.as_deref(), &app);
    let ffprobe = ffprobe_executable(&ffplay);
    let output = command(&ffprobe)
        .args([
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=noprint_wrappers=1:nokey=1",
        ])
        .arg(&path)
        .output()
        .map_err(|error| {
            format!(
                "Could not inspect audio duration with FFprobe ({ffprobe}). Install the full FFmpeg package. {error}"
            )
        })?;

    if !output.status.success() {
        return Err(format!(
            "FFprobe could not read {}.",
            Path::new(&path)
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
        ));
    }

    let duration = String::from_utf8_lossy(&output.stdout)
        .trim()
        .parse::<f64>()
        .map_err(|_| "FFprobe returned an invalid audio duration.".to_string())?;
    if !duration.is_finite() || duration <= 0.0 {
        return Err("The audio file has no usable duration.".to_string());
    }
    Ok(duration)
}

#[tauri::command]
fn start_playback(
    app: AppHandle,
    state: State<'_, PlaybackState>,
    path: String,
    volume: u8,
    replay_gain: bool,
    album_gain: bool,
    start_at: f64,
    play_for: f64,
    custom_path: Option<String>,
) -> Result<(), String> {
    stop_child(&state);

    let audio_path = PathBuf::from(&path);
    if !audio_path.is_file() {
        return Err("That audio file no longer exists.".to_string());
    }
    if !start_at.is_finite() || start_at < 0.0 || !play_for.is_finite() || play_for <= 0.0 {
        return Err("The requested playback range is invalid.".to_string());
    }

    let executable = executable(custom_path.as_deref(), &app);
    let seek = format!("{start_at:.3}");
    let duration = format!("{play_for:.3}");
    let volume = volume.to_string();
    let mut playback = command(&executable);
    playback.args([
        "-nodisp",
        "-autoexit",
        "-hide_banner",
        "-loglevel",
        "error",
        "-ss",
        &seek,
        "-t",
        &duration,
        "-volume",
        &volume,
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
            audio_duration,
            start_playback,
            stop_playback
        ])
        .run(tauri::generate_context!())
        .expect("error while running Blindwave");
}
