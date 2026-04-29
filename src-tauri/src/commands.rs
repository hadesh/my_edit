use base64::{engine::general_purpose, Engine as _};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Stdio;
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
    pub size: u64,
    pub extension: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SaveResult {
    pub success: bool,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProcessOutput {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct StreamEvent {
    pub id: String,
    pub stream: String,
    pub data: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ImageData {
    pub data: String,       // base64 编码的图片数据
    pub mime: String,       // MIME 类型，如 image/png
    pub size: u64,          // 文件字节数
    pub width: u32,         // 图片宽度（像素），0 表示未知
    pub height: u32,        // 图片高度（像素），0 表示未知
    pub extension: String,  // 文件扩展名（小写）
}

#[tauri::command]
pub fn read_file_base64(path: String) -> Result<ImageData, String> {
    let p = Path::new(&path);
    let bytes = fs::read(&path).map_err(|e| format!("读取图片失败: {}", e))?;
    let size = bytes.len() as u64;

    let extension = p
        .extension()
        .map(|e| e.to_string_lossy().to_lowercase())
        .unwrap_or_default();

    let mime = match extension.as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "png"          => "image/png",
        "gif"          => "image/gif",
        "webp"         => "image/webp",
        "bmp"          => "image/bmp",
        "ico"          => "image/x-icon",
        "svg"          => "image/svg+xml",
        "tiff" | "tif" => "image/tiff",
        "avif"         => "image/avif",
        _              => "image/png",
    }
    .to_string();

    let data = general_purpose::STANDARD.encode(&bytes);

    // 尝试从 PNG / JPEG 头解析宽高
    let (width, height) = parse_image_dimensions(&bytes, &extension);

    Ok(ImageData { data, mime, size, width, height, extension })
}

/// 从字节流解析图片宽高，失败时返回 (0, 0)
fn parse_image_dimensions(bytes: &[u8], ext: &str) -> (u32, u32) {
    match ext {
        "png" => {
            // PNG 签名 8 字节，IHDR chunk: 4(len) + 4(type) + 4(width) + 4(height)
            if bytes.len() >= 24 {
                let w = u32::from_be_bytes([bytes[16], bytes[17], bytes[18], bytes[19]]);
                let h = u32::from_be_bytes([bytes[20], bytes[21], bytes[22], bytes[23]]);
                return (w, h);
            }
        }
        "jpg" | "jpeg" => {
            // JPEG SOI marker + 扫描 SOF 段
            if let Some((w, h)) = parse_jpeg_dimensions(bytes) {
                return (w, h);
            }
        }
        "gif" => {
            // GIF87a/GIF89a: 偏移 6–9 为逻辑屏幕宽高（小端序）
            if bytes.len() >= 10 {
                let w = u16::from_le_bytes([bytes[6], bytes[7]]) as u32;
                let h = u16::from_le_bytes([bytes[8], bytes[9]]) as u32;
                return (w, h);
            }
        }
        "bmp" => {
            if bytes.len() >= 26 {
                let w = u32::from_le_bytes([bytes[18], bytes[19], bytes[20], bytes[21]]);
                let h = i32::from_le_bytes([bytes[22], bytes[23], bytes[24], bytes[25]]).unsigned_abs();
                return (w, h);
            }
        }
        "webp" => {
            // VP8（有损）：偏移 26–28 包含宽高（14 位），VP8L/VP8X 略
            if bytes.len() >= 30 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
                if &bytes[12..16] == b"VP8 " {
                    let w = (u16::from_le_bytes([bytes[26], bytes[27]]) & 0x3FFF) as u32 + 1;
                    let h = (u16::from_le_bytes([bytes[28], bytes[29]]) & 0x3FFF) as u32 + 1;
                    return (w, h);
                }
            }
        }
        _ => {}
    }
    (0, 0)
}

fn parse_jpeg_dimensions(bytes: &[u8]) -> Option<(u32, u32)> {
    if bytes.len() < 2 || bytes[0] != 0xFF || bytes[1] != 0xD8 {
        return None;
    }
    let mut i = 2usize;
    while i + 3 < bytes.len() {
        if bytes[i] != 0xFF {
            break;
        }
        let marker = bytes[i + 1];
        // SOF 段 marker: 0xC0–0xC3, 0xC5–0xC7, 0xC9–0xCB, 0xCD–0xCF
        if matches!(marker, 0xC0..=0xC3 | 0xC5..=0xC7 | 0xC9..=0xCB | 0xCD..=0xCF) {
            if i + 9 < bytes.len() {
                let h = u16::from_be_bytes([bytes[i + 5], bytes[i + 6]]) as u32;
                let w = u16::from_be_bytes([bytes[i + 7], bytes[i + 8]]) as u32;
                return Some((w, h));
            }
        }
        let len = u16::from_be_bytes([bytes[i + 2], bytes[i + 3]]) as usize;
        i += 2 + len;
    }
    None
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("读取文件失败: {}", e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<SaveResult, String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }
    fs::write(&path, content).map_err(|e| format!("写入文件失败: {}", e))?;
    Ok(SaveResult {
        success: true,
        message: "保存成功".to_string(),
    })
}

#[tauri::command]
pub fn read_dir_tree(path: String) -> Result<Vec<FileEntry>, String> {
    read_dir_recursive(&path, 0, 5)
}

fn read_dir_recursive(
    path: &str,
    depth: usize,
    max_depth: usize,
) -> Result<Vec<FileEntry>, String> {
    if depth > max_depth {
        return Ok(vec![]);
    }

    let entries =
        fs::read_dir(path).map_err(|e| format!("读取目录失败 {}: {}", path, e))?;

    let mut result: Vec<FileEntry> = entries
        .filter_map(|e| e.ok())
        .filter_map(|entry| {
            let p = entry.path();
            let name = p.file_name()?.to_string_lossy().to_string();

            if name.starts_with('.') || name == "node_modules" || name == "target" {
                return None;
            }

            let is_dir = p.is_dir();
            let meta = fs::metadata(&p).ok()?;
            let size = if is_dir { 0 } else { meta.len() };
            let extension = if is_dir {
                String::new()
            } else {
                p.extension()
                    .map(|e| e.to_string_lossy().to_string())
                    .unwrap_or_default()
            };

            let children = if is_dir && depth < max_depth {
                read_dir_recursive(&p.to_string_lossy(), depth + 1, max_depth).ok()
            } else if is_dir {
                Some(vec![])
            } else {
                None
            };

            Some(FileEntry {
                name,
                path: p.to_string_lossy().to_string(),
                is_dir,
                children,
                size,
                extension,
            })
        })
        .collect();

    result.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(result)
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        if !parent.exists() {
            fs::create_dir_all(parent).map_err(|e| format!("创建目录失败: {}", e))?;
        }
    }
    fs::write(&path, "").map_err(|e| format!("创建文件失败: {}", e))
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("创建目录失败: {}", e))
}

#[tauri::command]
pub fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| format!("删除目录失败: {}", e))
    } else {
        fs::remove_file(&path).map_err(|e| format!("删除文件失败: {}", e))
    }
}

#[tauri::command]
pub fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| format!("重命名失败: {}", e))
}

#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
pub fn get_file_info(path: String) -> Result<FileEntry, String> {
    let p = Path::new(&path);
    let meta = fs::metadata(&path).map_err(|e| format!("获取文件信息失败: {}", e))?;
    Ok(FileEntry {
        name: p
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default(),
        path: path.clone(),
        is_dir: meta.is_dir(),
        children: None,
        size: meta.len(),
        extension: p
            .extension()
            .map(|e| e.to_string_lossy().to_string())
            .unwrap_or_default(),
    })
}

#[tauri::command]
pub async fn execute_command(
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<ProcessOutput, String> {
    let mut cmd = Command::new(&program);
    cmd.args(&args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    if let Some(dir) = &cwd {
        cmd.current_dir(dir);
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("执行命令失败 '{}': {}", program, e))?;

    Ok(ProcessOutput {
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
        exit_code: output.status.code().unwrap_or(-1),
    })
}

#[tauri::command]
pub async fn execute_command_stream(
    app: AppHandle,
    id: String,
    program: String,
    args: Vec<String>,
    cwd: Option<String>,
) -> Result<(), String> {
    let mut cmd = Command::new(&program);
    cmd.args(&args);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    cmd.kill_on_drop(true);

    if let Some(dir) = &cwd {
        cmd.current_dir(dir);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("启动进程失败 '{}': {}", program, e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or("无法获取 stdout".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or("无法获取 stderr".to_string())?;

    let event_name = format!("process-output-{}", id);

    let app_clone = app.clone();
    let event_name_clone = event_name.clone();
    let id_clone = id.clone();

    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_clone.emit(
                &event_name_clone,
                StreamEvent {
                    id: id_clone.clone(),
                    stream: "stdout".to_string(),
                    data: line,
                },
            );
        }
    });

    let app_clone2 = app.clone();
    let event_name_clone2 = event_name.clone();
    let id_clone2 = id.clone();

    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app_clone2.emit(
                &event_name_clone2,
                StreamEvent {
                    id: id_clone2.clone(),
                    stream: "stderr".to_string(),
                    data: line,
                },
            );
        }
    });

    let _ = tokio::join!(stdout_task, stderr_task);
    let status = child.wait().await.map_err(|e| format!("等待进程失败: {}", e))?;
    let exit_code = status.code().unwrap_or(-1);

    app.emit(
        &event_name,
        StreamEvent {
            id: id.clone(),
            stream: "exit".to_string(),
            data: exit_code.to_string(),
        },
    )
    .map_err(|e| format!("发送退出事件失败: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn execute_curl(
    app: AppHandle,
    id: String,
    curl_command: String,
) -> Result<(), String> {
    let parts = shell_split(&curl_command);
    if parts.is_empty() {
        return Err("空命令".to_string());
    }

    let program = parts[0].clone();
    let args = parts[1..].to_vec();

    execute_command_stream(app, id, program, args, None).await
}

#[tauri::command]
pub fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub async fn shell_exec(
    app: AppHandle,
    id: String,
    cmd: String,
    cwd: Option<String>,
) -> Result<(), String> {
    let mut command = Command::new("/bin/bash");
    command.args(["-l", "-c", &cmd]);
    command.stdout(Stdio::piped());
    command.stderr(Stdio::piped());
    command.kill_on_drop(true);

    if let Some(dir) = &cwd {
        command.current_dir(dir);
    }

    let mut child = command
        .spawn()
        .map_err(|e| format!("启动失败: {}", e))?;

    let stdout = child.stdout.take().ok_or("无法获取 stdout")?;
    let stderr = child.stderr.take().ok_or("无法获取 stderr")?;

    let event_name = format!("shell-output-{}", id);

    let app1 = app.clone();
    let ev1 = event_name.clone();
    let id1 = id.clone();
    let stdout_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app1.emit(&ev1, StreamEvent { id: id1.clone(), stream: "stdout".into(), data: line });
        }
    });

    let app2 = app.clone();
    let ev2 = event_name.clone();
    let id2 = id.clone();
    let stderr_task = tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await {
            let _ = app2.emit(&ev2, StreamEvent { id: id2.clone(), stream: "stderr".into(), data: line });
        }
    });

    let _ = tokio::join!(stdout_task, stderr_task);
    let status = child.wait().await.map_err(|e| format!("等待进程失败: {}", e))?;
    let exit_code = status.code().unwrap_or(-1);

    let _ = app.emit(&event_name, StreamEvent {
        id: id.clone(),
        stream: "exit".into(),
        data: exit_code.to_string(),
    });

    Ok(())
}

#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn save_session(app: AppHandle, data: String) -> Result<(), String> {
    let path = app
        .path()
        .home_dir()
        .map_err(|e| format!("获取 home 目录失败: {}", e))?
        .join(".myedit_session.json");

    fs::write(&path, data).map_err(|e| format!("写入会话失败: {}", e))
}

#[tauri::command]
pub fn load_session(app: AppHandle) -> Result<String, String> {
    let path = app
        .path()
        .home_dir()
        .map_err(|e| format!("获取 home 目录失败: {}", e))?
        .join(".myedit_session.json");

    if !path.exists() {
        return Ok("null".to_string());
    }
    fs::read_to_string(&path).map_err(|e| format!("读取会话失败: {}", e))
}

fn shell_split(s: &str) -> Vec<String> {
    let mut result = Vec::new();
    let mut current = String::new();
    let mut in_single = false;
    let mut in_double = false;
    let mut chars = s.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '\'' if !in_double => in_single = !in_single,
            '"' if !in_single => in_double = !in_double,
            ' ' | '\t' if !in_single && !in_double => {
                if !current.is_empty() {
                    result.push(current.clone());
                    current.clear();
                }
            }
            '\\' if !in_single => {
                if let Some(next) = chars.next() {
                    current.push(next);
                }
            }
            _ => current.push(c),
        }
    }

    if !current.is_empty() {
        result.push(current);
    }

    result
}
