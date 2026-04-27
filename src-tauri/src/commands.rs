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
