use std::path::Path;
use std::process::Command;

#[tauri::command]
fn run_script(path: String) -> Result<(), String> {
  let trimmed = path.trim();
  if trimmed.is_empty() {
    return Err("Script path is empty".to_string());
  }

  let script_path = Path::new(trimmed);
  if !script_path.is_absolute() {
    return Err("Script path must be absolute".to_string());
  }
  if !script_path.exists() {
    return Err("Script file does not exist".to_string());
  }

  let extension = script_path
    .extension()
    .and_then(|ext| ext.to_str())
    .map(|ext| ext.to_ascii_lowercase());

  let mut command = match extension.as_deref() {
    Some("sh") => {
      let mut cmd = Command::new("zsh");
      cmd.arg(trimmed);
      cmd
    }
    Some("py") => {
      let mut cmd = Command::new("python3");
      cmd.arg(trimmed);
      cmd
    }
    Some("js") | Some("mjs") | Some("cjs") => {
      let mut cmd = Command::new("node");
      cmd.arg(trimmed);
      cmd
    }
    _ => Command::new(trimmed),
  };

  command
    .spawn()
    .map_err(|error| format!("Failed to execute script: {error}"))?;

  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![run_script])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
