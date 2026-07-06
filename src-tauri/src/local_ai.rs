// Local AI system commands (see LOCAL_AI_SYSTEM_DESIGN.md).
//
// Scope so far: hardware profiling and model recommendation, model
// download/install/delete, and managed llama-server runtime for chat plus
// embeddings. The only external network access here is model download,
// restricted to the host allowlist below.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, UNIX_EPOCH};

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use sysinfo::{Disks, System};
use tauri::{Emitter, Manager, State};
use tokio::io::{AsyncReadExt, AsyncWriteExt};

const MODELS_DIR_NAME: &str = "models";
const MODEL_FILE_EXTENSION: &str = "gguf";
const PARTIAL_SUFFIX: &str = ".partial";
const DOWNLOAD_PROGRESS_EVENT: &str = "local-ai://download-progress";
const PROGRESS_EMIT_INTERVAL: Duration = Duration::from_millis(300);
// Mirrors MODEL_DOWNLOAD_ALLOWLIST in src/lib/localAi/modelCatalog.ts —
// defense in depth so a compromised webview still can't point the downloader
// at an arbitrary host. github.com covers the llama.cpp runtime release assets
// (they 302 to release-assets.githubusercontent.com, which reqwest follows).
const DOWNLOAD_HOST_ALLOWLIST: &[&str] = &["huggingface.co", "cdn-lfs.huggingface.co", "github.com"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vram_gb: Option<f64>,
}

// Gathered only when the user explicitly asks for a device scan; used for
// model recommendation on the frontend and never sent off-device.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareProfile {
    pub os: String,
    pub arch: String,
    pub cpu_core_count: u32,
    pub total_ram_gb: Option<f64>,
    pub available_disk_gb: Option<f64>,
    pub gpu: Option<GpuInfo>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledModelFile {
    pub file_name: String,
    pub path: String,
    pub size_bytes: u64,
    pub modified_at: u64, // epoch ms, 0 when unknown
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiRuntimeStatus {
    pub running: bool,
    pub pid: Option<u32>,
    pub port: Option<u16>,
}

// The running build's target, used to pick the right runtime asset (e.g.
// macos-aarch64 vs macos-x86_64 on a universal app). Unlike HardwareProfile
// this reveals nothing about the user's machine beyond the app's own binary, so
// it needs no consent gate.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalAiPlatform {
    pub os: String,
    pub arch: String,
}

#[tauri::command]
pub fn get_local_ai_platform() -> LocalAiPlatform {
    LocalAiPlatform {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
    }
}

fn bytes_to_gb(bytes: u64) -> f64 {
    // One decimal is plenty for recommendation thresholds and the UI.
    (bytes as f64 / (1024.0 * 1024.0 * 1024.0) * 10.0).round() / 10.0
}

fn models_dir_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(base.join(MODELS_DIR_NAME))
}

// Free space on the disk that will hold the models directory, found by the
// longest mount-point prefix. None when the mount table gives no match (e.g.
// exotic filesystems) — the recommender treats that as "unknown", not zero.
fn available_disk_gb_for(path: &Path) -> Option<f64> {
    let disks = Disks::new_with_refreshed_list();
    disks
        .list()
        .iter()
        .filter(|disk| path.starts_with(disk.mount_point()))
        .max_by_key(|disk| disk.mount_point().as_os_str().len())
        .map(|disk| bytes_to_gb(disk.available_space()))
}

fn detect_nvidia_gpu() -> Option<GpuInfo> {
    let mut command = std::process::Command::new("nvidia-smi");
    command.args([
        "--query-gpu=name,memory.total",
        "--format=csv,noheader,nounits",
    ]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let output = command.output().ok()?;
    if !output.status.success() {
        return None;
    }
    let stdout = String::from_utf8(output.stdout).ok()?;
    let first_line = stdout.lines().find(|line| !line.trim().is_empty())?;
    let mut parts = first_line.splitn(2, ',');
    let name = parts.next()?.trim().to_string();
    if name.is_empty() {
        return None;
    }
    let vram_gb = parts
        .next()
        .and_then(|value| value.trim().parse::<f64>().ok())
        .map(|mb| (mb / 1024.0 * 10.0).round() / 10.0);
    Some(GpuInfo { name, vram_gb })
}

#[tauri::command]
pub fn get_local_ai_hardware_profile(app: tauri::AppHandle) -> HardwareProfile {
    let mut system = System::new();
    system.refresh_memory();
    let total_ram_bytes = system.total_memory();

    let cpu_core_count = std::thread::available_parallelism()
        .map(|count| count.get() as u32)
        .unwrap_or(1);

    let available_disk_gb = models_dir_path(&app)
        .ok()
        .as_deref()
        .and_then(available_disk_gb_for);

    HardwareProfile {
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        cpu_core_count,
        total_ram_gb: (total_ram_bytes > 0).then(|| bytes_to_gb(total_ram_bytes)),
        available_disk_gb,
        // Phase 5: NVIDIA VRAM via nvidia-smi when available. Other GPUs fall
        // back to RAM-based recommendation until a cross-platform detector is
        // added.
        gpu: detect_nvidia_gpu(),
    }
}

#[tauri::command]
pub fn get_local_ai_models_dir(app: tauri::AppHandle) -> Result<String, String> {
    let dir = models_dir_path(&app)?;
    std::fs::create_dir_all(&dir).map_err(|error| error.to_string())?;
    Ok(dir.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn list_local_ai_models(app: tauri::AppHandle) -> Result<Vec<InstalledModelFile>, String> {
    let dir = models_dir_path(&app)?;
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(&dir).map_err(|error| error.to_string())?;
    let mut models = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        let is_gguf = path
            .extension()
            .map(|ext| ext.eq_ignore_ascii_case(MODEL_FILE_EXTENSION))
            .unwrap_or(false);
        if !is_gguf {
            continue; // skips *.gguf.partial downloads too
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if !metadata.is_file() {
            continue;
        }
        let modified_at = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or(0);
        models.push(InstalledModelFile {
            file_name: entry.file_name().to_string_lossy().into_owned(),
            path: path.to_string_lossy().into_owned(),
            size_bytes: metadata.len(),
            modified_at,
        });
    }
    models.sort_by(|a, b| a.file_name.cmp(&b.file_name));
    Ok(models)
}

// ===== Model download (Phase 2, LOCAL_AI_SYSTEM_DESIGN.md §6) =====

// One cancel flag per in-flight download, keyed by model id. An entry's
// presence also serves as the "already downloading" guard.
#[derive(Default)]
pub struct LocalAiDownloadState {
    cancel_flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgress {
    model_id: String,
    received_bytes: u64,
    total_bytes: Option<u64>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DownloadOutcome {
    Completed,
    Cancelled,
}

fn validate_download_url(url: &str) -> Result<reqwest::Url, String> {
    let parsed = reqwest::Url::parse(url).map_err(|error| error.to_string())?;
    if parsed.scheme() != "https" {
        return Err("Model downloads must use https.".to_string());
    }
    let host = parsed.host_str().unwrap_or_default();
    let allowed = DOWNLOAD_HOST_ALLOWLIST
        .iter()
        .any(|entry| host == *entry || host.ends_with(&format!(".{entry}")));
    if !allowed {
        return Err(format!("Download host is not allowlisted: {host}"));
    }
    Ok(parsed)
}

// The file name comes from the frontend catalog; reject anything that could
// escape the models directory.
fn validate_model_file_name(file_name: &str) -> Result<(), String> {
    let valid = !file_name.is_empty()
        && !file_name.contains(['/', '\\'])
        && !file_name.contains("..")
        && Path::new(file_name)
            .extension()
            .map(|ext| ext.eq_ignore_ascii_case(MODEL_FILE_EXTENSION))
            .unwrap_or(false);
    if valid {
        Ok(())
    } else {
        Err(format!("Invalid model file name: {file_name}"))
    }
}

fn validate_sha256(expected: &str) -> Result<(), String> {
    if expected.len() == 64 && expected.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        Ok(())
    } else {
        // No hash means no download — partial trust is not an option (§11.2).
        Err("A sha256 hash is required to download a model.".to_string())
    }
}

fn emit_progress(app: &tauri::AppHandle, model_id: &str, received: u64, total: Option<u64>) {
    let _ = app.emit(
        DOWNLOAD_PROGRESS_EVENT,
        DownloadProgress {
            model_id: model_id.to_string(),
            received_bytes: received,
            total_bytes: total,
        },
    );
}

// Feeds the bytes already present in the .partial file into the hasher so a
// resumed download still produces the hash of the complete file.
async fn hash_existing_partial(path: &Path, hasher: &mut Sha256) -> Result<u64, String> {
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|error| error.to_string())?;
    let mut buffer = vec![0u8; 1024 * 1024];
    let mut total = 0u64;
    loop {
        let read = file
            .read(&mut buffer)
            .await
            .map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
        total += read as u64;
    }
    Ok(total)
}

async fn run_download(
    app: &tauri::AppHandle,
    cancel: &AtomicBool,
    model_id: &str,
    url: reqwest::Url,
    expected_sha256: &str,
    final_path: &Path,
    partial_path: &Path,
) -> Result<DownloadOutcome, String> {
    let mut hasher = Sha256::new();
    let mut received = match tokio::fs::metadata(partial_path).await {
        Ok(metadata) if metadata.is_file() && metadata.len() > 0 => {
            hash_existing_partial(partial_path, &mut hasher).await?
        }
        _ => 0,
    };

    let client = reqwest::Client::new();
    let mut request = client.get(url);
    if received > 0 {
        request = request.header(reqwest::header::RANGE, format!("bytes={received}-"));
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    let status = response.status();

    let resuming = status == reqwest::StatusCode::PARTIAL_CONTENT;
    if !resuming && !status.is_success() {
        return Err(format!("Download failed with HTTP status {status}."));
    }
    if received > 0 && !resuming {
        // Server ignored the Range header and is sending the whole file:
        // start over so the hash and byte count stay consistent.
        hasher = Sha256::new();
        received = 0;
    }

    let total_bytes = response.content_length().map(|length| length + received);

    let mut file = tokio::fs::OpenOptions::new()
        .create(true)
        .append(resuming)
        .truncate(!resuming)
        .write(true)
        .open(partial_path)
        .await
        .map_err(|error| error.to_string())?;

    emit_progress(app, model_id, received, total_bytes);
    let mut last_emit = Instant::now();

    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            // Keep the .partial file so a retry resumes instead of restarting.
            file.flush().await.map_err(|error| error.to_string())?;
            return Ok(DownloadOutcome::Cancelled);
        }
        let chunk = chunk.map_err(|error| error.to_string())?;
        file.write_all(&chunk)
            .await
            .map_err(|error| error.to_string())?;
        hasher.update(&chunk);
        received += chunk.len() as u64;
        if last_emit.elapsed() >= PROGRESS_EMIT_INTERVAL {
            emit_progress(app, model_id, received, total_bytes);
            last_emit = Instant::now();
        }
    }

    file.flush().await.map_err(|error| error.to_string())?;
    file.sync_all().await.map_err(|error| error.to_string())?;
    drop(file);

    let actual = format!("{:x}", hasher.finalize());
    if !actual.eq_ignore_ascii_case(expected_sha256) {
        // A corrupt or tampered file must not survive to be resumed (§11.2).
        let _ = tokio::fs::remove_file(partial_path).await;
        return Err("Downloaded file failed sha256 verification and was removed.".to_string());
    }

    tokio::fs::rename(partial_path, final_path)
        .await
        .map_err(|error| error.to_string())?;
    emit_progress(app, model_id, received, Some(received));
    Ok(DownloadOutcome::Completed)
}

#[tauri::command]
pub async fn download_local_ai_model(
    app: tauri::AppHandle,
    state: State<'_, LocalAiDownloadState>,
    model_id: String,
    url: String,
    expected_sha256: String,
    file_name: String,
) -> Result<DownloadOutcome, String> {
    let parsed_url = validate_download_url(&url)?;
    validate_model_file_name(&file_name)?;
    validate_sha256(&expected_sha256)?;

    let dir = models_dir_path(&app)?;
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|error| error.to_string())?;
    let final_path = dir.join(&file_name);
    let partial_path = dir.join(format!("{file_name}{PARTIAL_SUFFIX}"));
    if final_path.exists() {
        return Ok(DownloadOutcome::Completed);
    }

    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut flags = state
            .cancel_flags
            .lock()
            .map_err(|_| "download state poisoned")?;
        if flags.contains_key(&model_id) {
            return Err("This model is already being downloaded.".to_string());
        }
        flags.insert(model_id.clone(), Arc::clone(&cancel));
    }

    let result = run_download(
        &app,
        &cancel,
        &model_id,
        parsed_url,
        &expected_sha256,
        &final_path,
        &partial_path,
    )
    .await;

    if let Ok(mut flags) = state.cancel_flags.lock() {
        flags.remove(&model_id);
    }
    result
}

#[tauri::command]
pub fn cancel_local_ai_download(state: State<'_, LocalAiDownloadState>, model_id: String) {
    if let Ok(flags) = state.cancel_flags.lock() {
        if let Some(flag) = flags.get(&model_id) {
            flag.store(true, Ordering::SeqCst);
        }
    }
}

#[tauri::command]
pub async fn delete_local_ai_model(app: tauri::AppHandle, file_name: String) -> Result<(), String> {
    validate_model_file_name(&file_name)?;
    let dir = models_dir_path(&app)?;
    let final_path = dir.join(&file_name);
    let partial_path = dir.join(format!("{file_name}{PARTIAL_SUFFIX}"));
    if final_path.exists() {
        tokio::fs::remove_file(&final_path)
            .await
            .map_err(|error| error.to_string())?;
    }
    if partial_path.exists() {
        tokio::fs::remove_file(&partial_path)
            .await
            .map_err(|error| error.to_string())?;
    }
    Ok(())
}

// ===== llama-server runtime installer (Phase 6, LOCAL_AI_SYSTEM_DESIGN.md §7.7) =====
//
// Downloads an official llama.cpp release archive (allowlist + sha256, same
// trust model as model files) and extracts it into <app-local-data>/bin, where
// resolve_server_binary already looks. Windows ships a flat .zip; macOS/Linux
// ship a .tar.gz whose contents are wrapped in a single top-level directory
// that we flatten away. Either way we keep every entry so llama-server's
// companion libraries (DLLs / .so / .dylib) stay beside it.

// Extracts a zip into `dest`, rejecting entries that would escape it. Blocking,
// so callers run it on a blocking task. `dest` must already exist.
fn extract_zip_to_dir(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(zip_path).map_err(|error| error.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|error| error.to_string())?;
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|error| error.to_string())?;
        // enclosed_name() returns None for absolute paths or ".." traversal.
        let Some(relative) = entry.enclosed_name() else {
            continue;
        };
        let out_path = dest.join(relative);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path).map_err(|error| error.to_string())?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        let mut out = std::fs::File::create(&out_path).map_err(|error| error.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|error| error.to_string())?;
    }
    Ok(())
}

// Drops the first path component so `llama-<tag>/llama-server` lands at
// `<dest>/llama-server`. llama.cpp's macOS/Linux tarballs wrap everything in one
// top-level dir; a component-less entry (the dir itself) yields None and is
// skipped by the caller.
fn strip_leading_component(path: &Path) -> Option<PathBuf> {
    let mut components = path.components();
    components.next();
    let rest = components.as_path();
    if rest.as_os_str().is_empty() {
        None
    } else {
        Some(rest.to_path_buf())
    }
}

// Extracts a gzipped tar into `dest`, flattening the single wrapper directory
// and preserving Unix permissions (so llama-server keeps its exec bit).
// Blocking; `dest` must already exist.
fn extract_tar_gz_to_dir(archive_path: &Path, dest: &Path) -> Result<(), String> {
    let file = std::fs::File::open(archive_path).map_err(|error| error.to_string())?;
    let mut archive = tar::Archive::new(flate2::read::GzDecoder::new(file));
    archive.set_preserve_permissions(true);
    let entries = archive.entries().map_err(|error| error.to_string())?;
    for entry in entries {
        let mut entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path().map_err(|error| error.to_string())?.into_owned();
        // Reject absolute paths / ".." traversal, then flatten the wrapper dir.
        if path.is_absolute() || path.components().any(|c| c == std::path::Component::ParentDir) {
            continue;
        }
        let Some(relative) = strip_leading_component(&path) else {
            continue;
        };
        let out_path = dest.join(&relative);
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }
        entry.unpack(&out_path).map_err(|error| error.to_string())?;
    }
    Ok(())
}

fn extract_runtime_archive(archive_path: &Path, dest: &Path, is_tar_gz: bool) -> Result<(), String> {
    if is_tar_gz {
        extract_tar_gz_to_dir(archive_path, dest)
    } else {
        extract_zip_to_dir(archive_path, dest)
    }
}

#[tauri::command]
pub fn is_local_ai_server_installed(app: tauri::AppHandle) -> bool {
    local_bin_dir_path(&app)
        .map(|dir| dir.join(server_binary_file_name()).is_file())
        .unwrap_or(false)
}

#[tauri::command]
pub async fn install_local_ai_server(
    app: tauri::AppHandle,
    state: State<'_, LocalAiDownloadState>,
    url: String,
    expected_sha256: String,
) -> Result<DownloadOutcome, String> {
    let parsed_url = validate_download_url(&url)?;
    validate_sha256(&expected_sha256)?;

    let bin_dir = local_bin_dir_path(&app)?;
    tokio::fs::create_dir_all(&bin_dir)
        .await
        .map_err(|error| error.to_string())?;
    if bin_dir.join(server_binary_file_name()).is_file() {
        return Ok(DownloadOutcome::Completed);
    }

    let is_tar_gz = {
        let lower = url.to_ascii_lowercase();
        lower.ends_with(".tar.gz") || lower.ends_with(".tgz")
    };
    let archive_name = format!(
        "{SERVER_RUNTIME_ARCHIVE_STEM}.{}",
        if is_tar_gz { "tar.gz" } else { "zip" }
    );
    let archive_path = bin_dir.join(&archive_name);
    let partial_path = bin_dir.join(format!("{archive_name}{PARTIAL_SUFFIX}"));

    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut flags = state
            .cancel_flags
            .lock()
            .map_err(|_| "download state poisoned")?;
        if flags.contains_key(SERVER_RUNTIME_DOWNLOAD_ID) {
            return Err("The runtime is already being installed.".to_string());
        }
        flags.insert(SERVER_RUNTIME_DOWNLOAD_ID.to_string(), Arc::clone(&cancel));
    }

    let outcome = run_download(
        &app,
        &cancel,
        SERVER_RUNTIME_DOWNLOAD_ID,
        parsed_url,
        &expected_sha256,
        &archive_path,
        &partial_path,
    )
    .await;

    if let Ok(mut flags) = state.cancel_flags.lock() {
        flags.remove(SERVER_RUNTIME_DOWNLOAD_ID);
    }

    match outcome? {
        DownloadOutcome::Cancelled => return Ok(DownloadOutcome::Cancelled),
        DownloadOutcome::Completed => {}
    }

    let extract_dir = bin_dir.clone();
    let extract_archive = archive_path.clone();
    let extract_result = tokio::task::spawn_blocking(move || extract_runtime_archive(&extract_archive, &extract_dir, is_tar_gz))
        .await
        .map_err(|error| error.to_string())?;
    // Drop the downloaded archive either way so a failed extract doesn't leave
    // a stale zip/tarball behind for the next attempt to trip over.
    let _ = tokio::fs::remove_file(&archive_path).await;
    extract_result?;

    if !bin_dir.join(server_binary_file_name()).is_file() {
        return Err("The runtime archive did not contain llama-server.".to_string());
    }
    Ok(DownloadOutcome::Completed)
}

// ===== llama-server sidecar runtime (Phase 3, LOCAL_AI_SYSTEM_DESIGN.md §7) =====
//
// The server binary is resolved at RUNTIME, not bundled via externalBin:
// builds stay green without binaries in the repo, and the lookup order below
// keeps a future externalBin/resource-dir integration additive.

const SERVER_BINARY_NAME: &str = "llama-server";
const LOCAL_BIN_DIR_NAME: &str = "bin";
// Progress for the runtime install streams under this synthetic id so the
// frontend can reuse the same download-progress subscription as model files.
const SERVER_RUNTIME_DOWNLOAD_ID: &str = "llama-server-runtime";
// Base name for the runtime archive while it downloads into the bin dir; the
// real extension (.zip or .tar.gz) is chosen from the download URL.
const SERVER_RUNTIME_ARCHIVE_STEM: &str = "llama-server-runtime";
// How far above the preferred port we probe for a free one.
const PORT_PROBE_RANGE: u16 = 20;

struct ManagedServer {
    child: std::process::Child,
    port: u16,
    model_file: String,
}

#[derive(Default)]
pub struct LocalAiRuntimeState {
    server: Mutex<Option<ManagedServer>>,
}

fn server_binary_file_name() -> String {
    if cfg!(windows) {
        format!("{SERVER_BINARY_NAME}.exe")
    } else {
        SERVER_BINARY_NAME.to_string()
    }
}

// The app-managed bin dir (<app-local-data>/bin) that the runtime installer
// populates and resolve_server_binary looks in.
fn local_bin_dir_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?;
    Ok(base.join(LOCAL_BIN_DIR_NAME))
}

fn find_in_path() -> Option<PathBuf> {
    let file_name = server_binary_file_name();
    std::env::var_os("PATH").and_then(|paths| {
        std::env::split_paths(&paths)
            .map(|dir| dir.join(&file_name))
            .find(|candidate| candidate.is_file())
    })
}

// Lookup order: explicit user override (advanced setting) → the app-managed
// bin dir (<app-local-data>/bin, where a future binary installer will place
// it) → PATH. A clear error tells the user what to do when nothing matches.
fn resolve_server_binary(app: &tauri::AppHandle, override_path: &str) -> Result<PathBuf, String> {
    let override_path = override_path.trim();
    if !override_path.is_empty() {
        let candidate = PathBuf::from(override_path);
        if candidate.is_file() {
            return Ok(candidate);
        }
        return Err(format!(
            "llama-server binary not found at the configured path: {override_path}"
        ));
    }

    let managed = local_bin_dir_path(app)?.join(server_binary_file_name());
    if managed.is_file() {
        return Ok(managed);
    }

    if let Some(found) = find_in_path() {
        return Ok(found);
    }

    Err(format!(
        "llama-server binary not found. Place it at {} or set its path in Local AI settings.",
        managed.to_string_lossy()
    ))
}

// Binding briefly is the portable free-port test; the small TOCTOU window
// until llama-server binds is acceptable for a localhost dev port.
fn find_free_port(preferred: u16) -> Result<u16, String> {
    for offset in 0..=PORT_PROBE_RANGE {
        let Some(port) = preferred.checked_add(offset) else {
            break;
        };
        if std::net::TcpListener::bind(("127.0.0.1", port)).is_ok() {
            return Ok(port);
        }
    }
    Err(format!(
        "No free port found between {preferred} and {}.",
        preferred.saturating_add(PORT_PROBE_RANGE)
    ))
}

fn status_of(server: &mut Option<ManagedServer>) -> LocalAiRuntimeStatus {
    // try_wait() reaps a crashed/exited child so a stale entry never reports
    // as running.
    if let Some(managed) = server.as_mut() {
        match managed.child.try_wait() {
            Ok(None) => {
                return LocalAiRuntimeStatus {
                    running: true,
                    pid: Some(managed.child.id()),
                    port: Some(managed.port),
                };
            }
            _ => {
                *server = None;
            }
        }
    }
    LocalAiRuntimeStatus {
        running: false,
        pid: None,
        port: None,
    }
}

fn kill_managed_server(server: &mut Option<ManagedServer>) {
    if let Some(mut managed) = server.take() {
        let _ = managed.child.kill();
        let _ = managed.child.wait();
    }
}

// Kills the sidecar when the app exits (wired to RunEvent::Exit in main.rs).
pub fn shutdown_local_ai_server(app: &tauri::AppHandle) {
    let state = app.state::<LocalAiRuntimeState>();
    let mut server = match state.server.lock() {
        Ok(guard) => guard,
        Err(_) => return,
    };
    kill_managed_server(&mut server);
}

#[tauri::command]
pub fn start_local_ai_server(
    app: tauri::AppHandle,
    state: State<'_, LocalAiRuntimeState>,
    model_file_name: String,
    preferred_port: u16,
    binary_path_override: String,
) -> Result<LocalAiRuntimeStatus, String> {
    validate_model_file_name(&model_file_name)?;
    let model_path = models_dir_path(&app)?.join(&model_file_name);
    if !model_path.is_file() {
        return Err(format!("Model file is not installed: {model_file_name}"));
    }

    let mut server = state.server.lock().map_err(|_| "runtime state poisoned")?;

    // Already serving this model? Reuse it. A different model means the old
    // process must go first — llama-server loads one model per process.
    let current = status_of(&mut server);
    if current.running {
        match server.as_ref() {
            Some(managed) if managed.model_file == model_file_name => return Ok(current),
            _ => kill_managed_server(&mut server),
        }
    }

    let binary = resolve_server_binary(&app, &binary_path_override)?;
    let port = find_free_port(preferred_port)?;

    let mut command = std::process::Command::new(&binary);
    command
        .arg("-m")
        .arg(&model_path)
        // Never expose the server beyond this machine (§11.4).
        .args(["--host", "127.0.0.1", "--port"])
        .arg(port.to_string())
        .args(["--ctx-size", "4096"])
        // Phase 5: Full RAG uses OpenAI-compatible /v1/embeddings on this
        // same local endpoint. llama-server rejects that endpoint unless
        // embeddings support is enabled at startup.
        .arg("--embeddings")
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let child = command.spawn().map_err(|error| {
        format!(
            "Failed to start llama-server ({}): {error}",
            binary.to_string_lossy()
        )
    })?;

    let status = LocalAiRuntimeStatus {
        running: true,
        pid: Some(child.id()),
        port: Some(port),
    };
    *server = Some(ManagedServer {
        child,
        port,
        model_file: model_file_name,
    });
    // Readiness (model loading can take a while) is the frontend's job: it
    // polls GET /health until llama-server reports ok.
    Ok(status)
}

#[tauri::command]
pub fn stop_local_ai_server(state: State<'_, LocalAiRuntimeState>) -> Result<(), String> {
    let mut server = state.server.lock().map_err(|_| "runtime state poisoned")?;
    kill_managed_server(&mut server);
    Ok(())
}

#[tauri::command]
pub fn get_local_ai_runtime_status(state: State<'_, LocalAiRuntimeState>) -> LocalAiRuntimeStatus {
    let Ok(mut server) = state.server.lock() else {
        return LocalAiRuntimeStatus {
            running: false,
            pid: None,
            port: None,
        };
    };
    status_of(&mut server)
}
