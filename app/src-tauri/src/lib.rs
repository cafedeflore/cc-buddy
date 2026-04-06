use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{mpsc, Arc, Mutex},
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use dirs::home_dir;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, State, WebviewWindow,
    WindowEvent,
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct SessionSnapshot {
    session_id: String,
    cwd: String,
    pid: u32,
    alive: bool,
    started_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct ConversationEvent {
    #[serde(rename = "type")]
    event_type: String,
    timestamp: String,
    tool_name: Option<String>,
    detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PetState {
    mood: String,
    action: String,
    label: String,
    intensity: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct SessionRoom {
    session: SessionSnapshot,
    latest_event: Option<ConversationEvent>,
    pet_state: PetState,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct CompanionState {
    name: String,
    personality: String,
    age_days: u64,
    hatched_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MonitorSnapshot {
    companion: CompanionState,
    rooms: Vec<SessionRoom>,
    feed: Vec<ConversationEvent>,
    active_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct MonitorDelta {
    companion: Option<CompanionState>,
    rooms: Option<Vec<SessionRoom>>,
    feed_append: Vec<ConversationEvent>,
    active_count: Option<usize>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawSessionFile {
    pid: u32,
    session_id: String,
    cwd: String,
    started_at: serde_json::Value,
}

#[derive(Debug, Deserialize)]
struct RawCompanionFile {
    companion: Option<RawCompanion>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RawCompanion {
    name: Option<String>,
    personality: Option<String>,
    hatched_at: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
struct TailState {
    offset: u64,
    remainder: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct SavedWindowBounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct DisplayWorkArea {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
struct PersistedWindowState {
    windows: HashMap<String, SavedWindowBounds>,
}

#[derive(Debug, Clone)]
struct WindowStateStore {
    path: Option<PathBuf>,
    state: PersistedWindowState,
}

#[derive(Debug, Clone)]
struct MonitorRuntime {
    claude_root: PathBuf,
    cwd: Option<PathBuf>,
    companion: CompanionState,
    sessions: HashMap<String, SessionSnapshot>,
    latest_events: HashMap<String, ConversationEvent>,
    session_logs: HashMap<String, PathBuf>,
    tail_states: HashMap<PathBuf, TailState>,
}

type SharedMonitorState = Arc<Mutex<MonitorRuntime>>;
type SharedWindowState = Arc<Mutex<WindowStateStore>>;

const IDLE_AFTER_MS: i128 = 30 * 1000;
const WINDOW_STATE_FILE_NAME: &str = "window-state.json";
const HIDDEN_WINDOW_COORDINATE_THRESHOLD: i32 = -32000;

pub fn run() {
    let runtime = match build_runtime() {
        Ok(runtime) => Arc::new(Mutex::new(runtime)),
        Err(_) => return,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("pet") {
                let _ = window.set_focus();
            }
        }))
        .manage(runtime.clone())
        .setup(move |app| {
            let window_state = Arc::new(Mutex::new(build_window_state_store(&app.handle())));

            // System tray
            let dashboard_item = MenuItem::with_id(app, "dashboard", "Dashboard", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let tray_menu = Menu::with_items(app, &[&dashboard_item, &quit_item])?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&tray_menu)
                .tooltip("CC Buddy")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "dashboard" => {
                        let _ = toggle_dashboard(app.clone());
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            if let Some(pet_window) = app.get_webview_window("pet") {
                let _ = pet_window.set_skip_taskbar(true);
                initialize_window_state_tracking(&pet_window, &window_state);

                // Make the pet window's webview truly transparent on Windows.
                let _ = pet_window.set_background_color(Some(tauri::window::Color(0, 0, 0, 0)));
            }
            if let Some(dashboard_window) = app.get_webview_window("dashboard") {
                initialize_window_state_tracking(&dashboard_window, &window_state);
            }

            emit_snapshot(&app.handle(), &runtime);
            emit_delta(
                &app.handle(),
                MonitorDelta {
                    companion: None,
                    rooms: None,
                    feed_append: Vec::new(),
                    active_count: None,
                },
            );
            spawn_monitor_watcher(app.handle().clone(), runtime.clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![monitor_snapshot, toggle_dashboard])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[tauri::command]
fn monitor_snapshot(state: State<'_, SharedMonitorState>) -> Result<MonitorSnapshot, String> {
    let runtime = state
        .lock()
        .map_err(|_| "Monitor state lock poisoned".to_string())?;
    snapshot_from_runtime(&runtime)
}

#[tauri::command]
fn toggle_dashboard(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("dashboard") {
        if window.is_visible().unwrap_or(false) {
            window.hide().map_err(|e| e.to_string())?;
        } else {
            window.show().map_err(|e| e.to_string())?;
            window.set_focus().map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn build_window_state_store(app: &AppHandle) -> WindowStateStore {
    let path = app
        .path()
        .app_config_dir()
        .ok()
        .map(|dir| dir.join(WINDOW_STATE_FILE_NAME));
    let state = path
        .as_deref()
        .map(load_window_state)
        .unwrap_or_default();

    WindowStateStore { path, state }
}

fn load_window_state(path: &Path) -> PersistedWindowState {
    let mut state = fs::read_to_string(path)
        .ok()
        .and_then(|content| serde_json::from_str::<PersistedWindowState>(&content).ok())
        .unwrap_or_default();
    state
        .windows
        .retain(|_, bounds| is_valid_window_bounds(bounds));
    state
}

fn save_window_state(path: &Path, state: &PersistedWindowState) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("Unable to create {}: {error}", parent.display()))?;
    }

    let content =
        serde_json::to_string_pretty(state).map_err(|error| format!("Unable to serialize window state: {error}"))?;
    fs::write(path, content).map_err(|error| format!("Unable to write {}: {error}", path.display()))
}

fn update_window_bounds(
    state: &mut PersistedWindowState,
    label: &str,
    position: Option<(i32, i32)>,
    size: Option<(u32, u32)>,
) -> bool {
    if position.is_none() && size.is_none() {
        return false;
    }

    let mut next = state
        .windows
        .get(label)
        .cloned()
        .unwrap_or(SavedWindowBounds {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        });
    let previous = next.clone();

    if let Some((x, y)) = position {
        if x <= HIDDEN_WINDOW_COORDINATE_THRESHOLD || y <= HIDDEN_WINDOW_COORDINATE_THRESHOLD {
            return false;
        }
        next.x = x;
        next.y = y;
    }

    if let Some((width, height)) = size {
        next.width = width;
        next.height = height;
    }

    if next == previous {
        return false;
    }

    state.windows.insert(label.to_string(), next);
    true
}

fn is_valid_window_bounds(bounds: &SavedWindowBounds) -> bool {
    bounds.x > HIDDEN_WINDOW_COORDINATE_THRESHOLD
        && bounds.y > HIDDEN_WINDOW_COORDINATE_THRESHOLD
        && bounds.width > 0
        && bounds.height > 0
}

fn is_valid_display_work_area(work_area: &DisplayWorkArea) -> bool {
    work_area.width > 0 && work_area.height > 0
}

fn display_work_area_from_monitor(monitor: &tauri::window::Monitor) -> DisplayWorkArea {
    let work_area = monitor.work_area();
    DisplayWorkArea {
        x: work_area.position.x,
        y: work_area.position.y,
        width: work_area.size.width,
        height: work_area.size.height,
    }
}

fn is_window_bounds_visible_on_work_area(bounds: &SavedWindowBounds, work_area: DisplayWorkArea) -> bool {
    let bounds_left = i64::from(bounds.x);
    let bounds_top = i64::from(bounds.y);
    let bounds_right = bounds_left + i64::from(bounds.width);
    let bounds_bottom = bounds_top + i64::from(bounds.height);
    let work_area_left = i64::from(work_area.x);
    let work_area_top = i64::from(work_area.y);
    let work_area_right = work_area_left + i64::from(work_area.width);
    let work_area_bottom = work_area_top + i64::from(work_area.height);

    bounds_left < work_area_right
        && bounds_right > work_area_left
        && bounds_top < work_area_bottom
        && bounds_bottom > work_area_top
}

fn is_window_bounds_visible_on_any_work_area(
    bounds: &SavedWindowBounds,
    work_areas: &[DisplayWorkArea],
) -> bool {
    work_areas.iter().copied().filter(is_valid_display_work_area).any(|work_area| {
        is_window_bounds_visible_on_work_area(bounds, work_area)
    })
}

fn recenter_window_bounds_on_work_area(
    bounds: &SavedWindowBounds,
    work_area: DisplayWorkArea,
) -> SavedWindowBounds {
    let width = bounds.width.min(work_area.width);
    let height = bounds.height.min(work_area.height);
    let x = work_area.x + ((i64::from(work_area.width) - i64::from(width)) / 2) as i32;
    let y = work_area.y + ((i64::from(work_area.height) - i64::from(height)) / 2) as i32;

    SavedWindowBounds {
        x,
        y,
        width,
        height,
    }
}

fn resolve_restored_window_bounds(
    bounds: &SavedWindowBounds,
    work_areas: &[DisplayWorkArea],
    primary_work_area: Option<DisplayWorkArea>,
) -> SavedWindowBounds {
    if is_window_bounds_visible_on_any_work_area(bounds, work_areas) {
        return bounds.clone();
    }

    let fallback_work_area = primary_work_area
        .filter(is_valid_display_work_area)
        .or_else(|| {
            work_areas
                .iter()
                .copied()
                .find(is_valid_display_work_area)
        });

    fallback_work_area
        .map(|work_area| recenter_window_bounds_on_work_area(bounds, work_area))
        .unwrap_or_else(|| bounds.clone())
}

fn initialize_window_state_tracking(window: &WebviewWindow, store: &SharedWindowState) {
    if let Ok(guard) = store.lock() {
        restore_window_bounds(window, &guard.state);
    }

    sync_window_bounds(window, store);
    attach_window_state_tracking(window, store.clone());
}

fn restore_window_bounds(window: &WebviewWindow, state: &PersistedWindowState) {
    let Some(bounds) = state.windows.get(window.label()) else {
        return;
    };
    if !is_valid_window_bounds(bounds) {
        return;
    }

    let work_areas = window
        .available_monitors()
        .ok()
        .map(|monitors| {
            monitors
                .iter()
                .map(display_work_area_from_monitor)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    let primary_work_area = window
        .primary_monitor()
        .ok()
        .flatten()
        .as_ref()
        .map(display_work_area_from_monitor);
    let restored_bounds = resolve_restored_window_bounds(bounds, &work_areas, primary_work_area);

    let _ = window.set_size(PhysicalSize::new(restored_bounds.width, restored_bounds.height));
    let _ = window.set_position(PhysicalPosition::new(restored_bounds.x, restored_bounds.y));
}

fn sync_window_bounds(window: &WebviewWindow, store: &SharedWindowState) {
    let Ok(position) = window.outer_position() else {
        return;
    };
    let Ok(size) = window.outer_size() else {
        return;
    };

    persist_window_bounds(
        store,
        window.label(),
        Some((position.x, position.y)),
        Some((size.width, size.height)),
    );
}

fn attach_window_state_tracking(window: &WebviewWindow, store: SharedWindowState) {
    let label = window.label().to_string();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(position) => {
            persist_window_bounds(&store, &label, Some((position.x, position.y)), None);
        }
        WindowEvent::Resized(size) => {
            persist_window_bounds(&store, &label, None, Some((size.width, size.height)));
        }
        _ => {}
    });
}

fn persist_window_bounds(
    store: &SharedWindowState,
    label: &str,
    position: Option<(i32, i32)>,
    size: Option<(u32, u32)>,
) {
    let pending_write = match store.lock() {
        Ok(mut guard) => {
            if !update_window_bounds(&mut guard.state, label, position, size) {
                return;
            }

            guard
                .path
                .clone()
                .map(|path| (path, guard.state.clone()))
        }
        Err(_) => return,
    };

    if let Some((path, state)) = pending_write {
        let _ = save_window_state(&path, &state);
    }
}

fn build_runtime() -> Result<MonitorRuntime, String> {
    let claude_root = home_dir()
        .ok_or_else(|| "Unable to locate user home directory".to_string())?
        .join(".claude");
    let cwd = std::env::current_dir().ok();
    let companion = load_companion(&claude_root);
    let mut runtime = MonitorRuntime {
        claude_root: claude_root.clone(),
        cwd,
        companion,
        sessions: HashMap::new(),
        latest_events: HashMap::new(),
        session_logs: HashMap::new(),
        tail_states: HashMap::new(),
    };

    refresh_sessions(&mut runtime)?;
    Ok(runtime)
}

fn snapshot_from_runtime(runtime: &MonitorRuntime) -> Result<MonitorSnapshot, String> {
    let mut sessions = runtime.sessions.values().cloned().collect::<Vec<_>>();
    sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    let now = current_iso_timestamp();

    let rooms = sessions
        .into_iter()
        .take(3)
        .map(|session| {
            let latest_event = runtime.latest_events.get(&session.session_id).cloned();
            let pet_state = infer_pet_state(&session, latest_event.as_ref(), &now);
            SessionRoom {
                session,
                latest_event,
                pet_state,
            }
        })
        .collect::<Vec<_>>();

    let feed = rooms
        .iter()
        .filter_map(|room| room.latest_event.clone())
        .collect::<Vec<_>>();

    Ok(MonitorSnapshot {
        companion: runtime.companion.clone(),
        active_count: rooms.len(),
        rooms,
        feed,
    })
}

fn emit_snapshot(app: &AppHandle, runtime: &SharedMonitorState) {
    let snapshot = runtime
        .lock()
        .map_err(|_| "Monitor state lock poisoned".to_string())
        .and_then(|state| snapshot_from_runtime(&state));

    if let Ok(snapshot) = snapshot {
        let _ = app.emit("monitor-snapshot", snapshot);
    }
}

fn emit_delta(app: &AppHandle, delta: MonitorDelta) {
    let _ = app.emit("monitor-delta", delta);
}

fn spawn_monitor_watcher(app: AppHandle, runtime: SharedMonitorState) {
    let watch_targets = match runtime.lock() {
        Ok(state) => build_watch_targets(&state.claude_root, state.cwd.as_deref()),
        Err(_) => return,
    };

    thread::spawn(move || {
        let (tx, rx) = mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(
            move |result| {
                let _ = tx.send(result);
            },
            Config::default(),
        ) {
            Ok(watcher) => watcher,
            Err(_) => return,
        };

        for target in watch_targets {
            let is_file_target = target.extension().is_some();
            let watch_path = if is_file_target {
                target.parent().map(Path::to_path_buf)
            } else {
                Some(target.clone())
            };

            if let Some(path) = watch_path {
                if path.exists() {
                    let mode = if is_file_target {
                        RecursiveMode::NonRecursive
                    } else if path.is_dir() {
                        RecursiveMode::Recursive
                    } else {
                        RecursiveMode::NonRecursive
                    };
                    let _ = watcher.watch(&path, mode);
                }
            }
        }

        while let Ok(result) = rx.recv() {
            if let Ok(event) = result {
                if let Ok(mut state) = runtime.lock() {
                    if let Some(delta) = apply_watch_event(&mut state, &event) {
                        emit_delta(&app, delta);
                    }
                }
                emit_snapshot(&app, &runtime);
            }
        }
    });
}

fn build_watch_targets(claude_root: &Path, cwd: Option<&Path>) -> Vec<PathBuf> {
    let mut targets = vec![claude_root.join("sessions"), claude_root.join("projects")];

    if let Some(current_dir) = cwd {
        targets.push(current_dir.join(".claude.json"));
    }

    if let Some(home) = home_dir() {
        targets.push(home.join(".claude.json"));
    }

    targets
}

fn refresh_sessions(runtime: &mut MonitorRuntime) -> Result<(), String> {
    let sessions = load_sessions(&runtime.claude_root)?;
    let mut next_sessions = HashMap::new();
    let mut next_logs = HashMap::new();

    for session in sessions {
        if let Some(log_path) = find_session_log_path(&runtime.claude_root, &session.session_id) {
            next_logs.insert(session.session_id.clone(), log_path.clone());

            if !runtime.tail_states.contains_key(&log_path) {
                let (tail_state, latest_event) = initialize_tail_state(&log_path);
                runtime.tail_states.insert(log_path.clone(), tail_state);
                if let Some(event) = latest_event {
                    let mut session = session.clone();
                    session.updated_at = event.timestamp.clone();
                    runtime
                        .latest_events
                        .insert(session.session_id.clone(), event);
                    next_sessions.insert(session.session_id.clone(), session);
                    continue;
                }
            }
        }

        next_sessions.insert(session.session_id.clone(), session);
    }

    runtime
        .latest_events
        .retain(|session_id, _| next_sessions.contains_key(session_id));
    runtime
        .tail_states
        .retain(|path, _| next_logs.values().any(|candidate| candidate == path));
    runtime.sessions = next_sessions;
    runtime.session_logs = next_logs;

    Ok(())
}

fn load_sessions(claude_root: &Path) -> Result<Vec<SessionSnapshot>, String> {
    let sessions_dir = claude_root.join("sessions");
    let mut sessions = fs::read_dir(&sessions_dir)
        .map_err(|error| format!("Unable to read {}: {error}", sessions_dir.display()))?
        .flatten()
        .filter(|entry| entry.path().extension().and_then(|ext| ext.to_str()) == Some("json"))
        .filter_map(|entry| fs::read_to_string(entry.path()).ok())
        .filter_map(|content| serde_json::from_str::<RawSessionFile>(&content).ok())
        .map(|session| SessionSnapshot {
            session_id: session.session_id,
            cwd: session.cwd,
            pid: session.pid,
            alive: process_is_alive(session.pid),
            started_at: normalize_started_at(&session.started_at),
            updated_at: normalize_started_at(&session.started_at),
        })
        .filter(|session| session.alive)
        .collect::<Vec<_>>();

    sessions.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(sessions)
}

fn find_session_log_path(claude_root: &Path, session_id: &str) -> Option<PathBuf> {
    let projects_dir = claude_root.join("projects");
    let project_dirs = fs::read_dir(projects_dir).ok()?;

    for project_dir in project_dirs.flatten() {
        let jsonl_path = project_dir.path().join(format!("{session_id}.jsonl"));
        if jsonl_path.exists() {
            return Some(jsonl_path);
        }
    }

    None
}

fn initialize_tail_state(path: &Path) -> (TailState, Option<ConversationEvent>) {
    let bytes = fs::read(path).unwrap_or_default();
    let (state, events) = consume_jsonl_chunk(TailState::default(), &bytes);
    (state, events.into_iter().last())
}

fn update_tail_state(
    path: &Path,
    previous: &TailState,
) -> Result<(TailState, Option<ConversationEvent>), String> {
    let metadata =
        fs::metadata(path).map_err(|error| format!("Unable to stat {}: {error}", path.display()))?;

    let file_len = metadata.len();
    if file_len < previous.offset {
        return Ok(initialize_tail_state(path));
    }

    let bytes = fs::read(path).map_err(|error| format!("Unable to read {}: {error}", path.display()))?;
    let start = previous.offset as usize;
    let chunk = bytes.get(start..).unwrap_or(&[]);
    let (state, events) = consume_jsonl_chunk(previous.clone(), chunk);
    Ok((state, events.into_iter().last()))
}

fn apply_watch_event(runtime: &mut MonitorRuntime, event: &notify::Event) -> Option<MonitorDelta> {
    let mut sessions_dirty = false;
    let mut companion_dirty = false;
    let mut feed_append = Vec::new();

    for path in &event.paths {
        if path.starts_with(runtime.claude_root.join("sessions")) {
            sessions_dirty = true;
            continue;
        }

        if path
            .extension()
            .and_then(|ext| ext.to_str())
            .map(|ext| ext.eq_ignore_ascii_case("jsonl"))
            .unwrap_or(false)
        {
            if let Some(appended) = update_runtime_for_jsonl(runtime, path) {
                feed_append.push(appended);
            }
            continue;
        }

        if path.file_name().and_then(|name| name.to_str()) == Some(".claude.json") {
            companion_dirty = true;
        }
    }

    if sessions_dirty {
        let _ = refresh_sessions(runtime);
    }

    if companion_dirty {
        runtime.companion = load_companion(&runtime.claude_root);
    }

    if !sessions_dirty && !companion_dirty && feed_append.is_empty() {
        return None;
    }

    let snapshot = snapshot_from_runtime(runtime).ok()?;

    Some(MonitorDelta {
        companion: if companion_dirty {
            Some(runtime.companion.clone())
        } else {
            None
        },
        rooms: if sessions_dirty || !feed_append.is_empty() {
            Some(snapshot.rooms)
        } else {
            None
        },
        active_count: if sessions_dirty || !feed_append.is_empty() {
            Some(snapshot.active_count)
        } else {
            None
        },
        feed_append,
    })
}

fn update_runtime_for_jsonl(runtime: &mut MonitorRuntime, path: &Path) -> Option<ConversationEvent> {
    let session_id = match path.file_stem().and_then(|stem| stem.to_str()) {
        Some(session_id) => session_id.to_string(),
        None => return None,
    };

    let previous = runtime.tail_states.get(path).cloned().unwrap_or_default();
    if let Ok((next_state, latest_event)) = update_tail_state(path, &previous) {
        runtime.tail_states.insert(path.to_path_buf(), next_state);
        runtime
            .session_logs
            .insert(session_id.clone(), path.to_path_buf());

        if let Some(event) = latest_event {
            if let Some(session) = runtime.sessions.get_mut(&session_id) {
                session.updated_at = event.timestamp.clone();
            }
            runtime.latest_events.insert(session_id, event.clone());
            return Some(event);
        }
    }

    None
}

fn consume_jsonl_chunk(
    state: TailState,
    chunk: &[u8],
) -> (TailState, Vec<ConversationEvent>) {
    let chunk_text = String::from_utf8_lossy(chunk);
    let combined = format!("{}{}", state.remainder, chunk_text);
    let mut parts = combined.split('\n').map(|part| part.to_string()).collect::<Vec<_>>();
    let remainder = parts.pop().unwrap_or_default();
    let events = parts
        .into_iter()
        .filter(|line| !line.trim().is_empty())
        .filter_map(|line| parse_event_line(&line))
        .collect::<Vec<_>>();

    (
        TailState {
            offset: state.offset + chunk.len() as u64,
            remainder,
        },
        events,
    )
}

fn parse_event_line(line: &str) -> Option<ConversationEvent> {
    let value = serde_json::from_str::<serde_json::Value>(line).ok()?;
    let timestamp = value
        .get("timestamp")
        .and_then(|item| item.as_str())
        .unwrap_or("1970-01-01T00:00:00.000Z")
        .to_string();

    if let Some(message_type) = value
        .get("message")
        .and_then(|message| message.get("role"))
        .and_then(|role| role.as_str())
    {
        if message_type == "assistant" {
            if let Some(tool_use) = value
                .get("message")
                .and_then(|message| message.get("content"))
                .and_then(|content| content.as_array())
                .and_then(|content| content.iter().find(|item| item.get("type").and_then(|value| value.as_str()) == Some("tool_use")))
            {
                return Some(ConversationEvent {
                    event_type: "tool_use".into(),
                    timestamp,
                    tool_name: tool_use.get("name").and_then(|value| value.as_str()).map(|value| value.to_string()),
                    detail: tool_use.get("name").and_then(|value| value.as_str()).map(|value| format!("Using {value}")),
                });
            }

            return Some(ConversationEvent {
                event_type: "assistant".into(),
                timestamp,
                tool_name: None,
                detail: value
                    .get("message")
                    .and_then(|message| message.get("content"))
                    .and_then(|content| content.as_array())
                    .and_then(|items| items.iter().find_map(|item| item.get("text").and_then(|value| value.as_str())))
                    .map(|text| text.chars().take(80).collect()),
            });
        }
    }

    let event_type = value.get("type").and_then(|item| item.as_str())?;
    match event_type {
        "user" => Some(ConversationEvent {
            event_type: "tool_result".into(),
            timestamp,
            tool_name: None,
            detail: Some("Tool result received".into()),
        }),
        "system" if value.get("subtype").and_then(|item| item.as_str()) == Some("api_error") => {
            Some(ConversationEvent {
                event_type: "error".into(),
                timestamp,
                tool_name: None,
                detail: Some("Claude API error".into()),
            })
        }
        "result" => Some(ConversationEvent {
            event_type: "result".into(),
            timestamp,
            tool_name: None,
            detail: Some("Run completed".into()),
        }),
        _ => None,
    }
}

fn infer_pet_state(
    session: &SessionSnapshot,
    event: Option<&ConversationEvent>,
    now: &str,
) -> PetState {
    if !session.alive {
        return PetState {
            mood: "idle".into(),
            action: "sleeping".into(),
            label: "No active Claude Code sessions".into(),
            intensity: "low".into(),
        };
    }

    let updated_at = event
        .map(|event| event.timestamp.as_str())
        .unwrap_or(session.updated_at.as_str());
    if let (Some(updated_ms), Some(now_ms)) =
        (parse_rfc3339_millis(updated_at), parse_rfc3339_millis(now))
    {
        if (now_ms as i128) - (updated_ms as i128) > IDLE_AFTER_MS {
            return PetState {
                mood: "idle".into(),
                action: "sleeping".into(),
                label: "Session is idle".into(),
                intensity: "low".into(),
            };
        }
    }

    match event.map(|event| event.event_type.as_str()) {
        Some("assistant") => PetState {
            mood: "thinking".into(),
            action: "pondering".into(),
            label: "Assistant is thinking out loud".into(),
            intensity: "medium".into(),
        },
        Some("tool_use") => match event.and_then(|item| item.tool_name.as_deref()) {
            Some("Bash") => tool_state("excited", "running_command", "Running shell commands", "high"),
            Some("Edit") | Some("Write") => tool_state("focused", "writing_code", "Editing source files", "high"),
            Some("Read") => tool_state("curious", "reading", "Reading project files", "medium"),
            Some("Grep") | Some("Glob") => tool_state("hunting", "searching", "Searching through the codebase", "high"),
            Some("Agent") => tool_state("busy", "delegating", "Coordinating a sub-agent", "medium"),
            _ => tool_state("curious", "reading", "Handling a tool invocation", "medium"),
        },
        Some("result") => tool_state("happy", "celebrating", "Task finished successfully", "medium"),
        Some("error") => tool_state("worried", "debugging", "Recovering from an error", "high"),
        _ => tool_state("thinking", "pondering", "Waiting for the next event", "low"),
    }
}

fn tool_state(mood: &str, action: &str, label: &str, intensity: &str) -> PetState {
    PetState {
        mood: mood.into(),
        action: action.into(),
        label: label.into(),
        intensity: intensity.into(),
    }
}

fn load_companion(claude_root: &Path) -> CompanionState {
    let candidates = [
        std::env::current_dir().ok().map(|dir| dir.join(".claude.json")),
        home_dir().map(|dir| dir.join(".claude.json")),
        Some(claude_root.join(".claude.json")),
    ];

    let fallback = CompanionState {
        name: "Siltpaw".into(),
        personality: "curious guardian with a nose for unfinished tasks".into(),
        age_days: 0,
        hatched_at: "2026-03-27T08:00:00.000Z".into(),
    };

    for candidate in candidates.into_iter().flatten() {
        if let Ok(content) = fs::read_to_string(candidate) {
            if let Ok(parsed) = serde_json::from_str::<RawCompanionFile>(&content) {
                if let Some(companion) = parsed.companion {
                    let hatched_at = companion
                        .hatched_at
                        .unwrap_or_else(|| fallback.hatched_at.clone());
                    return CompanionState {
                        name: companion.name.unwrap_or_else(|| fallback.name.clone()),
                        personality: companion
                            .personality
                            .unwrap_or_else(|| fallback.personality.clone()),
                        age_days: age_days(&hatched_at),
                        hatched_at,
                    };
                }
            }
        }
    }

    fallback
}

fn age_days(hatched_at: &str) -> u64 {
    let hatched = parse_rfc3339_millis(hatched_at).unwrap_or(0);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(hatched);

    now.saturating_sub(hatched) / 86_400_000
}

fn parse_rfc3339_millis(value: &str) -> Option<u64> {
    let parsed = time::OffsetDateTime::parse(value, &time::format_description::well_known::Rfc3339).ok()?;
    Some(parsed.unix_timestamp_nanos().unsigned_abs() as u64 / 1_000_000)
}

fn normalize_started_at(value: &serde_json::Value) -> String {
    if let Some(number) = value.as_i64() {
        return millis_to_iso(number as u64);
    }

    value.as_str().unwrap_or("1970-01-01T00:00:00.000Z").to_string()
}

fn millis_to_iso(millis: u64) -> String {
    time::OffsetDateTime::from_unix_timestamp_nanos((millis as i128) * 1_000_000)
        .map(|timestamp| {
            timestamp
                .format(&time::format_description::well_known::Rfc3339)
                .unwrap_or_else(|_| "1970-01-01T00:00:00.000Z".into())
        })
        .unwrap_or_else(|_| "1970-01-01T00:00:00.000Z".into())
}

fn current_iso_timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| millis_to_iso(duration.as_millis() as u64))
        .unwrap_or_else(|_| "1970-01-01T00:00:00.000Z".into())
}

fn process_is_alive(pid: u32) -> bool {
    #[cfg(target_os = "windows")]
    {
        let filter = format!("PID eq {pid}");
        return Command::new("tasklist")
            .args(["/FI", &filter, "/FO", "CSV", "/NH"])
            .output()
            .ok()
            .and_then(|output| String::from_utf8(output.stdout).ok())
            .map(|stdout| stdout.contains(&pid.to_string()))
            .unwrap_or(false);
    }

    #[cfg(not(target_os = "windows"))]
    {
        PathBuf::from(format!("/proc/{pid}")).exists()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_assistant_tool_use_as_tool_event() {
        let line = r#"{"message":{"role":"assistant","content":[{"type":"tool_use","name":"Edit"}]},"timestamp":"2026-04-03T12:18:08.000Z"}"#;

        let event = parse_event_line(line).expect("event");

        assert_eq!(event.event_type, "tool_use");
        assert_eq!(event.tool_name.as_deref(), Some("Edit"));
    }

    #[test]
    fn parses_api_error_as_error_event() {
        let line = r#"{"type":"system","subtype":"api_error","timestamp":"2026-04-03T12:21:13.686Z"}"#;

        let event = parse_event_line(line).expect("event");

        assert_eq!(event.event_type, "error");
    }

    #[test]
    fn loads_latest_event_from_matching_session_file() {
        let temp = tempfile::tempdir().expect("tempdir");
        let project_dir = temp.path().join("projects").join("sample");
        fs::create_dir_all(&project_dir).expect("projects");
        fs::write(
            project_dir.join("session-123.jsonl"),
            "{\"type\":\"result\",\"timestamp\":\"2026-04-03T12:20:00.000Z\"}\n",
        )
        .expect("jsonl");

        let (_, event) = initialize_tail_state(&project_dir.join("session-123.jsonl"));
        let event = event.expect("event");

        assert_eq!(event.event_type, "result");
    }

    #[test]
    fn build_watch_paths_includes_core_claude_directories() {
        let root = Path::new("C:\\Users\\linna\\.claude");
        let cwd = Path::new("D:\\repo\\cc-buddy");

        let paths = build_watch_targets(root, Some(cwd));

        assert!(paths.iter().any(|path| path == &root.join("sessions")));
        assert!(paths.iter().any(|path| path == &root.join("projects")));
        assert!(paths.iter().any(|path| path == &cwd.join(".claude.json")));
    }

    #[test]
    fn consume_jsonl_chunk_keeps_partial_line_as_remainder() {
        let (state, events) = consume_jsonl_chunk(
            TailState::default(),
            b"{\"type\":\"result\",\"timestamp\":\"2026-04-04T00:00:00.000Z\"}\n{\"type\":\"tool_use\"",
        );

        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event_type, "result");
        assert_eq!(
            state,
            TailState {
                offset: 75,
                remainder: "{\"type\":\"tool_use\"".into(),
            }
        );
    }

    #[test]
    fn consume_jsonl_chunk_parses_buffered_remainder_on_next_read() {
        let (state, events) =
            consume_jsonl_chunk(TailState::default(), b"{\"type\":\"tool_use\"");

        assert!(events.is_empty());

        let (next_state, next_events) =
            consume_jsonl_chunk(state, b",\"timestamp\":\"2026-04-04T00:00:00.000Z\"}\n");

        assert!(next_events.is_empty());
        assert_eq!(next_state.remainder, "");
        assert_eq!(next_state.offset, 59);
    }

    #[test]
    fn infer_pet_state_returns_idle_for_stale_session() {
        let event = ConversationEvent {
            event_type: "tool_use".into(),
            timestamp: "2026-04-04T00:00:00.000Z".into(),
            tool_name: Some("Edit".into()),
            detail: None,
        };

        let session = SessionSnapshot {
            session_id: "session-1".into(),
            cwd: "D:\\repo\\cc-buddy".into(),
            pid: 1,
            alive: true,
            started_at: "2026-04-04T00:00:00.000Z".into(),
            updated_at: "2026-04-04T00:00:00.000Z".into(),
        };

        let pet_state = infer_pet_state(&session, Some(&event), "2026-04-04T00:05:00.000Z");

        assert_eq!(pet_state.mood, "idle");
        assert_eq!(pet_state.action, "sleeping");
    }

    #[test]
    fn infer_pet_state_returns_idle_after_30_seconds() {
        let event = ConversationEvent {
            event_type: "assistant".into(),
            timestamp: "2026-04-04T00:00:00.000Z".into(),
            tool_name: None,
            detail: None,
        };

        let session = SessionSnapshot {
            session_id: "session-1".into(),
            cwd: "D:\\repo\\cc-buddy".into(),
            pid: 1,
            alive: true,
            started_at: "2026-04-04T00:00:00.000Z".into(),
            updated_at: "2026-04-04T00:00:00.000Z".into(),
        };

        let pet_state = infer_pet_state(&session, Some(&event), "2026-04-04T00:00:31.000Z");

        assert_eq!(pet_state.mood, "idle");
        assert_eq!(pet_state.action, "sleeping");
    }

    #[test]
    fn loads_empty_window_state_when_file_is_missing() {
        let temp = tempfile::tempdir().expect("tempdir");
        let state = load_window_state(&temp.path().join("window-state.json"));

        assert!(state.windows.is_empty());
    }

    #[test]
    fn saves_and_reloads_window_state() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("window-state.json");
        let mut state = PersistedWindowState::default();

        assert!(update_window_bounds(
            &mut state,
            "pet",
            Some((120, 48)),
            Some((512, 512)),
        ));
        save_window_state(&path, &state).expect("save");

        let reloaded = load_window_state(&path);

        assert_eq!(reloaded, state);
    }

    #[test]
    fn update_window_bounds_preserves_existing_values_for_partial_updates() {
        let mut state = PersistedWindowState::default();

        assert!(update_window_bounds(
            &mut state,
            "dashboard",
            Some((200, 180)),
            Some((1360, 900)),
        ));
        assert!(update_window_bounds(
            &mut state,
            "dashboard",
            None,
            Some((1440, 920)),
        ));

        assert_eq!(
            state.windows.get("dashboard"),
            Some(&SavedWindowBounds {
                x: 200,
                y: 180,
                width: 1440,
                height: 920,
            })
        );
    }

    #[test]
    fn update_window_bounds_returns_false_when_values_do_not_change() {
        let mut state = PersistedWindowState::default();

        assert!(update_window_bounds(
            &mut state,
            "pet",
            Some((120, 48)),
            Some((512, 512)),
        ));
        assert!(!update_window_bounds(
            &mut state,
            "pet",
            Some((120, 48)),
            Some((512, 512)),
        ));
    }

    #[test]
    fn window_state_updates_do_not_overwrite_other_windows() {
        let mut state = PersistedWindowState::default();

        update_window_bounds(&mut state, "pet", Some((10, 20)), Some((512, 512)));
        update_window_bounds(&mut state, "dashboard", Some((30, 40)), Some((1360, 900)));

        assert_eq!(state.windows.len(), 2);
        assert_eq!(state.windows["pet"].x, 10);
        assert_eq!(state.windows["dashboard"].x, 30);
    }

    #[test]
    fn update_window_bounds_ignores_hidden_window_coordinates() {
        let mut state = PersistedWindowState::default();

        assert!(update_window_bounds(
            &mut state,
            "pet",
            Some((120, 48)),
            Some((512, 512)),
        ));
        assert!(!update_window_bounds(
            &mut state,
            "pet",
            Some((-32000, -32000)),
            None,
        ));

        assert_eq!(
            state.windows.get("pet"),
            Some(&SavedWindowBounds {
                x: 120,
                y: 48,
                width: 512,
                height: 512,
            })
        );
    }

    #[test]
    fn restore_window_bounds_keeps_visible_secondary_monitor_positions() {
        let bounds = SavedWindowBounds {
            x: -1800,
            y: 120,
            width: 512,
            height: 512,
        };
        let work_areas = vec![
            DisplayWorkArea {
                x: 0,
                y: 0,
                width: 1920,
                height: 1040,
            },
            DisplayWorkArea {
                x: -1920,
                y: 0,
                width: 1920,
                height: 1040,
            },
        ];

        assert_eq!(
            resolve_restored_window_bounds(&bounds, &work_areas, Some(work_areas[0])),
            bounds
        );
    }

    #[test]
    fn restore_window_bounds_recenters_offscreen_windows_on_primary_monitor() {
        let bounds = SavedWindowBounds {
            x: 2800,
            y: 200,
            width: 512,
            height: 512,
        };
        let work_areas = vec![DisplayWorkArea {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        }];

        assert_eq!(
            resolve_restored_window_bounds(&bounds, &work_areas, Some(work_areas[0])),
            SavedWindowBounds {
                x: 704,
                y: 264,
                width: 512,
                height: 512,
            }
        );
    }

    #[test]
    fn restore_window_bounds_clamps_oversized_windows_to_primary_monitor() {
        let bounds = SavedWindowBounds {
            x: 2800,
            y: 200,
            width: 2400,
            height: 1400,
        };
        let work_areas = vec![DisplayWorkArea {
            x: 0,
            y: 0,
            width: 1920,
            height: 1040,
        }];

        assert_eq!(
            resolve_restored_window_bounds(&bounds, &work_areas, Some(work_areas[0])),
            SavedWindowBounds {
                x: 0,
                y: 0,
                width: 1920,
                height: 1040,
            }
        );
    }

    #[test]
    fn invalid_saved_window_bounds_are_treated_as_missing() {
        let temp = tempfile::tempdir().expect("tempdir");
        let path = temp.path().join("window-state.json");
        fs::write(
            &path,
            r#"{
  "windows": {
    "pet": {
      "x": -32000,
      "y": -32000,
      "width": 314,
      "height": 50
    }
  }
}"#,
        )
        .expect("write");

        let state = load_window_state(&path);

        assert!(state.windows.is_empty());
    }
}
