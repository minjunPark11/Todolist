// Local AI system commands (see LOCAL_AI_SYSTEM_DESIGN.md).
//
// Phase 0 scope: hardware profiling for model recommendation, the app-local
// models directory, and the installed-model listing. Model download (Phase 2)
// and the llama-server sidecar (Phase 3) are TODOs documented in the design
// doc — no network access and no process spawning happens here yet.

use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::Serialize;
use sysinfo::{Disks, System};
use tauri::Manager;

const MODELS_DIR_NAME: &str = "models";
const MODEL_FILE_EXTENSION: &str = "gguf";

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
        // TODO(Phase 1+): GPU detection — wgpu adapter enumeration for the
        // name, nvml-wrapper for NVIDIA VRAM. On Apple Silicon, unified
        // memory means RAM already covers it. See LOCAL_AI_SYSTEM_DESIGN.md §3.
        gpu: None,
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

#[tauri::command]
pub fn get_local_ai_runtime_status() -> LocalAiRuntimeStatus {
    // TODO(Phase 3): track the spawned llama-server sidecar in managed state
    // (pid + actual port after port probing) and report it here. Until the
    // sidecar exists there is nothing to report.
    LocalAiRuntimeStatus {
        running: false,
        pid: None,
        port: None,
    }
}
