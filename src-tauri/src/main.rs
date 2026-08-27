// Prevents an extra console window from appearing on Windows in release builds.
// Debug builds keep the console so logs remain visible.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod local_ai;

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{
    image::Image,
    menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    Emitter, Manager, State, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};
use tauri_plugin_fs::FsExt;

const TRAY_ID: &str = "focusflow-tray";
const MINI_TIMER_WINDOW: &str = "focus-mini-timer";
const MENU_SHOW: &str = "show";
const MENU_TOGGLE_FOCUS: &str = "toggle-focus";
const MENU_FINISH_FOCUS: &str = "finish-focus";
const MENU_QUIT: &str = "quit";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct FocusTraySnapshot {
    session_id: String,
    title: String,
    time: String,
    status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct FocusTrayActionPayload {
    action: String,
    session_id: String,
}

#[derive(Default)]
struct AppState {
    focus_snapshot: Mutex<Option<FocusTraySnapshot>>,
    force_quit: Mutex<bool>,
}

fn has_active_focus(snapshot: &FocusTraySnapshot) -> bool {
    !snapshot.session_id.trim().is_empty()
        && matches!(snapshot.status.as_str(), "running" | "paused")
}

fn current_focus_summary(snapshot: Option<&FocusTraySnapshot>) -> String {
    match snapshot {
        Some(snapshot) if has_active_focus(snapshot) => {
            let status = if snapshot.status == "paused" {
                "Paused"
            } else {
                "Running"
            };
            format!("{} - {} - {}", snapshot.time, status, snapshot.title)
        }
        _ => "No active focus session".to_string(),
    }
}

fn tray_tooltip(snapshot: Option<&FocusTraySnapshot>) -> String {
    match snapshot {
        Some(snapshot) if has_active_focus(snapshot) => {
            format!("FocusFlow: {} - {}", snapshot.time, snapshot.title)
        }
        _ => "FocusFlow".to_string(),
    }
}

// macOS menu-bar items expect a *template* image: black + alpha only, ~18pt
// (36px @2x). The system then tints it for light/dark menu bars and click
// highlight — a colored bitmap neither scales nor adapts there, which is why
// the old procedural circle showed fine in the Windows tray but not on macOS.
#[cfg(target_os = "macos")]
fn tray_icon_image() -> Image<'static> {
    Image::from_bytes(include_bytes!("../icons/tray/trayTemplate@2x.png"))
        .expect("bundled tray template icon must decode")
}

#[cfg(not(target_os = "macos"))]
fn tray_icon_image() -> Image<'static> {
    let mut rgba = Vec::with_capacity(32 * 32 * 4);
    for y in 0..32 {
        for x in 0..32 {
            let dx = x as i32 - 16;
            let dy = y as i32 - 16;
            let distance_squared = dx * dx + dy * dy;
            if distance_squared <= 196 {
                rgba.extend_from_slice(&[79, 115, 255, 255]);
            } else if distance_squared <= 240 {
                rgba.extend_from_slice(&[17, 24, 39, 255]);
            } else {
                rgba.extend_from_slice(&[0, 0, 0, 0]);
            }
        }
    }
    Image::new_owned(rgba, 32, 32)
}

fn build_tray_menu(
    app: &tauri::AppHandle,
    snapshot: Option<&FocusTraySnapshot>,
) -> tauri::Result<Menu<tauri::Wry>> {
    let summary = current_focus_summary(snapshot);
    let has_focus = snapshot.map(has_active_focus).unwrap_or(false);
    let toggle_label = match snapshot {
        Some(snapshot) if snapshot.status == "paused" => "Resume",
        _ => "Pause",
    };
    let status_item = MenuItem::with_id(app, "focus-status", summary, false, None::<&str>)?;
    let toggle_item = MenuItem::with_id(
        app,
        MENU_TOGGLE_FOCUS,
        toggle_label,
        has_focus,
        None::<&str>,
    )?;
    let finish_item = MenuItem::with_id(app, MENU_FINISH_FOCUS, "Finish", has_focus, None::<&str>)?;
    let show_item = MenuItem::with_id(app, MENU_SHOW, "Open FocusFlow", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, MENU_QUIT, "Quit", true, None::<&str>)?;
    let focus_separator = PredefinedMenuItem::separator(app)?;
    let app_separator = PredefinedMenuItem::separator(app)?;

    MenuBuilder::new(app)
        .item(&status_item)
        .item(&focus_separator)
        .item(&toggle_item)
        .item(&finish_item)
        .item(&app_separator)
        .item(&show_item)
        .item(&quit_item)
        .build()
}

fn refresh_tray(app: &tauri::AppHandle, snapshot: Option<&FocusTraySnapshot>) {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        if let Ok(menu) = build_tray_menu(app, snapshot) {
            let _ = tray.set_menu(Some(menu));
        }
        let _ = tray.set_tooltip(Some(tray_tooltip(snapshot)));
        // macOS shows this text next to the menu-bar icon; other platforms
        // only support tray tooltips/menus, so this is a no-op there.
        #[cfg(target_os = "macos")]
        {
            let title = match snapshot {
                Some(snapshot) if has_active_focus(snapshot) => {
                    if snapshot.status == "paused" {
                        format!("⏸ {}", snapshot.time)
                    } else {
                        snapshot.time.clone()
                    }
                }
                _ => String::new(),
            };
            let _ = tray.set_title(if title.is_empty() { None } else { Some(title.as_str()) });
        }
    }
}

fn emit_focus_update(app: &tauri::AppHandle, snapshot: Option<&FocusTraySnapshot>) {
    let _ = app.emit("focus-tray-update", snapshot.cloned());
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return;
    }

    let Ok(window) = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("FocusFlow")
        .inner_size(1280.0, 820.0)
        .min_inner_size(980.0, 680.0)
        // Matches tauri.conf.json: the app draws its own caption row
        // (WindowTitleBar.tsx), so a window rebuilt on this fallback path must
        // not come back wearing the system one.
        .decorations(false)
        .build()
    else {
        return;
    };
    let _ = window.show();
    let _ = window.set_focus();
}

fn show_mini_timer_window(app: &tauri::AppHandle) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MINI_TIMER_WINDOW) {
        window.show()?;
        window.unminimize()?;
        window.set_focus()?;
        return Ok(());
    }

    // Fallback only: the mini window is normally pre-declared in
    // tauri.conf.json and merely shown/hidden. Creating a webview window at
    // runtime left it stuck on about:blank in release builds, so we avoid that
    // path. Point at the dedicated standalone page just in case this ever runs.
    WebviewWindowBuilder::new(
        app,
        MINI_TIMER_WINDOW,
        WebviewUrl::App("mini-focus.html".into()),
    )
    .title("FocusFlow Mini Timer")
    .inner_size(360.0, 320.0)
    .min_inner_size(320.0, 280.0)
    .resizable(true)
    .maximizable(false)
    .closable(true)
    .always_on_top(true)
    .build()?;

    Ok(())
}

fn close_mini_timer_window(app: &tauri::AppHandle) {
    // Hide rather than destroy: the window is pre-declared in config and reused,
    // so closing it must keep it alive for the next open.
    if let Some(window) = app.get_webview_window(MINI_TIMER_WINDOW) {
        let _ = window.hide();
    }
}

fn emit_focus_action(app: &tauri::AppHandle, action: &str) {
    let state = app.state::<AppState>();
    let snapshot = state
        .focus_snapshot
        .lock()
        .ok()
        .and_then(|snapshot| snapshot.clone());
    let Some(snapshot) = snapshot else {
        return;
    };
    if !has_active_focus(&snapshot) {
        return;
    }

    let payload = FocusTrayActionPayload {
        action: action.to_string(),
        session_id: snapshot.session_id,
    };
    let _ = app.emit("focus-tray-action", payload);
}

#[tauri::command]
fn update_focus_tray(app: tauri::AppHandle, state: State<AppState>, snapshot: FocusTraySnapshot) {
    let snapshot = if has_active_focus(&snapshot) {
        Some(snapshot)
    } else {
        None
    };

    {
        let mut current = state
            .focus_snapshot
            .lock()
            .expect("focus tray state poisoned");
        *current = snapshot.clone();
    }

    refresh_tray(&app, snapshot.as_ref());
    emit_focus_update(&app, snapshot.as_ref());
    if snapshot.is_none() {
        close_mini_timer_window(&app);
    }
}

#[tauri::command]
fn clear_focus_tray(app: tauri::AppHandle, state: State<AppState>) {
    {
        let mut current = state
            .focus_snapshot
            .lock()
            .expect("focus tray state poisoned");
        *current = None;
    }
    refresh_tray(&app, None);
    emit_focus_update(&app, None);
    close_mini_timer_window(&app);
}

#[tauri::command]
fn get_focus_tray_snapshot(state: State<AppState>) -> Option<FocusTraySnapshot> {
    state
        .focus_snapshot
        .lock()
        .ok()
        .and_then(|snapshot| snapshot.clone())
}

#[tauri::command]
fn open_focus_mini_timer(
    app: tauri::AppHandle,
    state: State<AppState>,
    snapshot: FocusTraySnapshot,
) -> tauri::Result<()> {
    update_focus_tray(app.clone(), state, snapshot);
    show_mini_timer_window(&app)?;
    let current = app
        .state::<AppState>()
        .focus_snapshot
        .lock()
        .ok()
        .and_then(|snapshot| snapshot.clone());
    emit_focus_update(&app, current.as_ref());
    Ok(())
}

#[tauri::command]
fn dispatch_focus_tray_action(app: tauri::AppHandle, action: String, session_id: String) {
    let state = app.state::<AppState>();
    let matches_current = state
        .focus_snapshot
        .lock()
        .ok()
        .and_then(|snapshot| snapshot.clone())
        .map(|snapshot| has_active_focus(&snapshot) && snapshot.session_id == session_id)
        .unwrap_or(false);

    if matches_current {
        emit_focus_action(&app, &action);
    }
}

#[tauri::command]
fn close_focus_mini_timer(app: tauri::AppHandle) {
    close_mini_timer_window(&app);
}

// The fs plugin denies all paths by default (see capabilities/default.json,
// which grants the read commands but no static scope). This command extends
// the runtime scope to exactly the folder the user picked via the dialog
// plugin, so the knowledge-base feature can only ever read a directory the
// user explicitly chose — never an arbitrary filesystem path.
#[tauri::command]
fn grant_vault_read_access(app: tauri::AppHandle, path: String) -> Result<(), String> {
    app.fs_scope()
        .allow_directory(&path, true)
        .map_err(|error| error.to_string())
}

// Creates the app data directory that holds the knowledge-base sqlite index.
// The fs plugin denies mkdir outside its static scope (the frontend can't
// create $APPDATA), so directory creation for our own data dir happens here in
// Rust — same trust model as models_dir/grant_vault_read_access.
#[tauri::command]
fn ensure_knowledge_db_dir(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())
}

// ---------------------------------------------------------------------------
// Automatic backups (SETTINGS_REVIEW.md 4.6)
//
// The app is local-first and had only a manual "Export JSON", so an emptied
// localStorage left nothing to go back to. These write real files under the app
// data dir, which is what survives clearing site data.
//
// They live in Rust rather than behind an `fs:allow-write-*` capability on
// purpose. The frontend never names a directory: it hands over the contents and
// a retention count, and the only writable path this exposes is one fixed
// folder holding files this code named itself. Widening it would take a code
// change, not a settings change — the same trust model as models_dir and
// ensure_knowledge_db_dir.
const BACKUP_DIR: &str = "backups";
const BACKUP_PREFIX: &str = "focusflow-";
const BACKUP_SUFFIX: &str = ".json";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupFile {
    name: String,
    path: String,
    size: u64,
    // Milliseconds since the epoch, to match Date.now() on the other side.
    modified_at: u64,
}

fn backups_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join(BACKUP_DIR);
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir)
}

// A name is only ever one this code generated. Anything else — a separator, a
// parent hop, a different extension — is refused rather than sanitised, because
// there is no legitimate caller that would send one.
fn backup_file_path(app: &tauri::AppHandle, name: &str) -> Result<std::path::PathBuf, String> {
    let looks_like_ours = name.starts_with(BACKUP_PREFIX)
        && name.ends_with(BACKUP_SUFFIX)
        && !name.contains('/')
        && !name.contains('\\')
        && !name.contains("..");
    if !looks_like_ours {
        return Err(format!("not a backup file name: {name}"));
    }
    Ok(backups_dir(app)?.join(name))
}

fn read_backup_entries(dir: &std::path::Path) -> Result<Vec<BackupFile>, String> {
    let mut entries: Vec<BackupFile> = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|error| error.to_string())? {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.starts_with(BACKUP_PREFIX) || !name.ends_with(BACKUP_SUFFIX) {
            continue;
        }
        let metadata = match entry.metadata() {
            Ok(metadata) if metadata.is_file() => metadata,
            _ => continue,
        };
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|delta| delta.as_millis() as u64)
            .unwrap_or(0);
        entries.push(BackupFile {
            name,
            path: entry.path().to_string_lossy().to_string(),
            size: metadata.len(),
            modified_at,
        });
    }
    // Newest first. The name carries a sortable timestamp, so it is the tie
    // break when two files share a modified time.
    entries.sort_by(|a, b| b.modified_at.cmp(&a.modified_at).then(b.name.cmp(&a.name)));
    Ok(entries)
}

#[tauri::command]
fn get_backups_dir(app: tauri::AppHandle) -> Result<String, String> {
    Ok(backups_dir(&app)?.to_string_lossy().to_string())
}

#[tauri::command]
fn list_backups(app: tauri::AppHandle) -> Result<Vec<BackupFile>, String> {
    read_backup_entries(&backups_dir(&app)?)
}

#[tauri::command]
fn read_backup(app: tauri::AppHandle, name: String) -> Result<String, String> {
    std::fs::read_to_string(backup_file_path(&app, &name)?).map_err(|error| error.to_string())
}

// `stamp` is formatted by the caller so the file name matches the reader's own
// clock rather than whatever the OS reports here. `keep` is how many files
// survive, newest first; 0 means keep them all.
#[tauri::command]
fn write_backup(
    app: tauri::AppHandle,
    contents: String,
    stamp: String,
    keep: usize,
) -> Result<BackupFile, String> {
    let dir = backups_dir(&app)?;
    let name = format!("{BACKUP_PREFIX}{stamp}{BACKUP_SUFFIX}");
    let path = backup_file_path(&app, &name)?;
    std::fs::write(&path, contents.as_bytes()).map_err(|error| error.to_string())?;

    // Prune after writing, never before: a failed write must not have already
    // cost the oldest copy.
    if keep > 0 {
        let entries = read_backup_entries(&dir)?;
        for stale in entries.iter().skip(keep) {
            let _ = std::fs::remove_file(&stale.path);
        }
    }

    let metadata = std::fs::metadata(&path).map_err(|error| error.to_string())?;
    Ok(BackupFile {
        name,
        path: path.to_string_lossy().to_string(),
        size: metadata.len(),
        modified_at: metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|delta| delta.as_millis() as u64)
            .unwrap_or(0),
    })
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .manage(local_ai::LocalAiDownloadState::default())
        .manage(local_ai::LocalAiRuntimeState::default())
        // Must be registered first: a second launch (e.g. reopening from the
        // shortcut while an instance lingers in the tray) would otherwise spawn
        // a duplicate window whose WebView2 fails to init against the locked
        // user-data dir, showing an empty black window. Instead, focus the
        // existing window and let the second process exit.
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .setup(|app| {
            let menu = build_tray_menu(app.handle(), None)?;
            #[allow(unused_mut)]
            let mut tray = TrayIconBuilder::with_id(TRAY_ID)
                .icon(tray_icon_image())
                .tooltip("FocusFlow")
                .menu(&menu)
                .show_menu_on_left_click(true);
            // Template mode lets macOS tint the glyph for light/dark menu
            // bars; without it the icon renders as a raw bitmap (or not at
            // all). Other platforms don't have the concept.
            #[cfg(target_os = "macos")]
            {
                tray = tray.icon_as_template(true);
            }
            tray.build(app)?;
            Ok(())
        })
        .on_menu_event(|app, event| match event.id().as_ref() {
            MENU_SHOW => show_main_window(app),
            MENU_TOGGLE_FOCUS => {
                let state = app.state::<AppState>();
                let action = state
                    .focus_snapshot
                    .lock()
                    .ok()
                    .and_then(|snapshot| snapshot.clone())
                    .map(|snapshot| {
                        if snapshot.status == "paused" {
                            "resume"
                        } else {
                            "pause"
                        }
                    })
                    .unwrap_or("pause");
                emit_focus_action(app, action);
            }
            MENU_FINISH_FOCUS => emit_focus_action(app, "finish"),
            MENU_QUIT => {
                let state = app.state::<AppState>();
                if let Ok(mut force_quit) = state.force_quit.lock() {
                    *force_quit = true;
                }
                app.exit(0);
            }
            _ => {}
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                // The mini timer is a persistent, pre-declared window: hide it on
                // close (native X included) so it can be reopened, never destroy it.
                if window.label() == MINI_TIMER_WINDOW {
                    api.prevent_close();
                    let _ = window.hide();
                    return;
                }
                if window.label() != "main" {
                    return;
                }
                let app = window.app_handle();
                let state = app.state::<AppState>();
                let force_quit = state.force_quit.lock().map(|value| *value).unwrap_or(false);
                if !force_quit {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            update_focus_tray,
            clear_focus_tray,
            get_focus_tray_snapshot,
            open_focus_mini_timer,
            dispatch_focus_tray_action,
            close_focus_mini_timer,
            grant_vault_read_access,
            ensure_knowledge_db_dir,
            get_backups_dir,
            list_backups,
            read_backup,
            write_backup,
            local_ai::get_local_ai_hardware_profile,
            local_ai::get_local_ai_models_dir,
            local_ai::list_local_ai_models,
            local_ai::get_local_ai_runtime_status,
            local_ai::download_local_ai_model,
            local_ai::cancel_local_ai_download,
            local_ai::delete_local_ai_model,
            local_ai::start_local_ai_server,
            local_ai::stop_local_ai_server,
            local_ai::start_local_ai_embedding_server,
            local_ai::stop_local_ai_embedding_server,
            local_ai::get_local_ai_embedding_runtime_status,
            local_ai::is_local_ai_server_installed,
            local_ai::get_local_ai_server_runtime_version,
            local_ai::install_local_ai_server,
            local_ai::get_local_ai_platform
        ])
        .build(tauri::generate_context!())
        .expect("error while running FocusFlow desktop app")
        .run(|app, event| match event {
            // Closing the window hides it (see on_window_event), and only the
            // tray's Quit really exits — that is what `force_quit` is for. On
            // macOS there is a second way out that never reaches
            // `CloseRequested`: Cmd+Q, the app menu's Quit and the Dock's Quit
            // all raise `ExitRequested` instead. Without this arm the flag was
            // never consulted on that path, so Cmd+Q killed a running focus
            // session outright. Windows has no Cmd+Q, which is exactly why the
            // hole only showed on a Mac.
            //
            // macOS only, deliberately. On Windows this event can also stand
            // for the session ending — a shutdown or a sign-out — and
            // preventing it there would mean an app that argues with the OS
            // about logging off. The platform with the hole gets the patch.
            #[cfg(target_os = "macos")]
            tauri::RunEvent::ExitRequested { api, code, .. } => {
                let force_quit = app
                    .state::<AppState>()
                    .force_quit
                    .lock()
                    .map(|value| *value)
                    .unwrap_or(false);
                // `code` is `Some` when something asked to exit in code rather
                // than a person asking — the tray's `app.exit(0)` and the
                // updater's restart both arrive that way. Those are never
                // second-guessed; only the keystroke is.
                if force_quit || code.is_some() {
                    return;
                }
                api.prevent_exit();
                // Hidden as well, so Cmd+Q puts the app away the way the close
                // button does. Preventing the exit and leaving the window on
                // screen would read as a keystroke that did nothing.
                //
                // The mini timer is left alone: it is a second window the user
                // opened on purpose to keep watching a session, and this
                // gesture is about the main one.
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            // The llama-server sidecar must never outlive the app.
            tauri::RunEvent::Exit => {
                local_ai::shutdown_local_ai_server(app);
            }
            _ => {}
        });
}
