use chrono::{Datelike, Duration, NaiveDate};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::{Manager, State};
use uuid::Uuid;

#[derive(Clone)]
struct DbState {
  db_path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListItem {
  id: String,
  name: String,
  icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UrlScheme {
  id: String,
  name: String,
  icon: String,
  template: String,
  kind: String,
  param_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskActionBinding {
  scheme_id: String,
  params: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RepeatRule {
  #[serde(rename = "type")]
  rule_type: String,
  day_of_week: Option<Vec<u8>>,
  day_of_month: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskItem {
  id: String,
  list_id: Option<String>,
  title: String,
  detail: Option<String>,
  completed: bool,
  date: Option<String>,
  time: Option<String>,
  reminder: Option<bool>,
  reminder_offset_minutes: Option<i64>,
  #[serde(rename = "repeat")]
  repeat_rule: Option<RepeatRule>,
  actions: Option<Vec<TaskActionBinding>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSnapshot {
  lists: Vec<ListItem>,
  tasks: Vec<TaskItem>,
  schemes: Vec<UrlScheme>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupPayload {
  version: u32,
  exported_at: String,
  snapshot: AppSnapshot,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListInput {
  name: String,
  icon: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SchemeInput {
  name: String,
  icon: String,
  template: String,
  kind: Option<String>,
  param_type: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NewTaskInput {
  list_id: Option<String>,
  title: String,
  detail: Option<String>,
  date: Option<String>,
  time: Option<String>,
  reminder: Option<bool>,
  reminder_offset_minutes: Option<i64>,
  #[serde(rename = "repeat")]
  repeat_rule: Option<RepeatRule>,
  actions: Option<Vec<TaskActionBinding>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SaveTaskInput {
  id: String,
  list_id: Option<String>,
  title: String,
  detail: Option<String>,
  completed: bool,
  date: Option<String>,
  time: Option<String>,
  reminder: Option<bool>,
  reminder_offset_minutes: Option<i64>,
  #[serde(rename = "repeat")]
  repeat_rule: Option<RepeatRule>,
  actions: Option<Vec<TaskActionBinding>>,
}

fn validate_repeat_rule(rule: &Option<RepeatRule>) -> Result<(), String> {
  if let Some(rule) = rule {
    match rule.rule_type.as_str() {
      "daily" => Ok(()),
      "weekly" => {
        let days = rule.day_of_week.clone().unwrap_or_default();
        if days.is_empty() {
          return Err("Weekly repeat must contain at least one weekday".to_string());
        }
        if days.iter().any(|day| *day > 6) {
          return Err("Weekly repeat day must be between 0 and 6".to_string());
        }
        Ok(())
      }
      "monthly" => {
        let days = rule.day_of_month.clone().unwrap_or_default();
        if days.is_empty() {
          return Err("Monthly repeat must contain at least one day".to_string());
        }
        if days.iter().any(|day| *day == 0 || *day > 31) {
          return Err("Monthly repeat day must be between 1 and 31".to_string());
        }
        Ok(())
      }
      _ => Err("Unsupported repeat type".to_string()),
    }
  } else {
    Ok(())
  }
}

fn normalize_scheme_kind(kind: Option<String>) -> String {
  match kind
    .unwrap_or_else(|| "url".to_string())
    .trim()
    .to_ascii_lowercase()
    .as_str()
  {
    "script" => "script".to_string(),
    _ => "url".to_string(),
  }
}

fn open_connection(db_path: &Path) -> Result<Connection, String> {
  let conn = Connection::open(db_path).map_err(|err| format!("Failed to open database: {err}"))?;
  conn
    .pragma_update(None, "foreign_keys", "ON")
    .map_err(|err| format!("Failed to enable foreign keys: {err}"))?;
  Ok(conn)
}

fn default_lists() -> Vec<ListItem> {
  vec![
    ListItem {
      id: "list_today".to_string(),
      name: "所有任务".to_string(),
      icon: "📋".to_string(),
    },
    ListItem {
      id: "list_work".to_string(),
      name: "工作".to_string(),
      icon: "💼".to_string(),
    },
    ListItem {
      id: "list_life".to_string(),
      name: "生活".to_string(),
      icon: "🏡".to_string(),
    },
  ]
}

fn default_schemes() -> Vec<UrlScheme> {
  vec![
    UrlScheme {
      id: "scheme_wemeet".to_string(),
      name: "腾讯会议".to_string(),
      icon: "📹".to_string(),
      template: "wemeet://inmeeting?code={param}".to_string(),
      kind: "url".to_string(),
      param_type: "number".to_string(),
    },
    UrlScheme {
      id: "scheme_mail".to_string(),
      name: "邮件".to_string(),
      icon: "✉️".to_string(),
      template: "mailto:{param}?subject={param}".to_string(),
      kind: "url".to_string(),
      param_type: "string".to_string(),
    },
    UrlScheme {
      id: "scheme_maps".to_string(),
      name: "高德地图".to_string(),
      icon: "🗺️".to_string(),
      template: "iosamap://path?sourceApplication=linkflow&dname={param}".to_string(),
      kind: "url".to_string(),
      param_type: "string".to_string(),
    },
    UrlScheme {
      id: "scheme_weixin_scanqrcode".to_string(),
      name: "微信-扫一扫".to_string(),
      icon: "🟢".to_string(),
      template: "weixin://scanqrcode".to_string(),
      kind: "url".to_string(),
      param_type: "string".to_string(),
    },
    UrlScheme {
      id: "scheme_zhihu_search".to_string(),
      name: "知乎-搜索".to_string(),
      icon: "🔎".to_string(),
      template: "zhihu://search?q={param}".to_string(),
      kind: "url".to_string(),
      param_type: "string".to_string(),
    },
    UrlScheme {
      id: "scheme_macos_tel".to_string(),
      name: "macos-电话".to_string(),
      icon: "📞".to_string(),
      template: "tel://{param}".to_string(),
      kind: "url".to_string(),
      param_type: "number".to_string(),
    },
    UrlScheme {
      id: "scheme_macos_message".to_string(),
      name: "macos-邮件".to_string(),
      icon: "📨".to_string(),
      template: "message://".to_string(),
      kind: "url".to_string(),
      param_type: "string".to_string(),
    },
    UrlScheme {
      id: "scheme_script_local".to_string(),
      name: "本地脚本".to_string(),
      icon: "📜".to_string(),
      template: "/absolute/path/to/your-script.sh".to_string(),
      kind: "script".to_string(),
      param_type: "string".to_string(),
    },
  ]
}

fn init_database(db_path: &Path) -> Result<(), String> {
  let conn = open_connection(db_path)?;

  conn
    .execute_batch(
      r#"
      CREATE TABLE IF NOT EXISTS lists (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS schemes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        template TEXT NOT NULL,
        kind TEXT NOT NULL,
        param_type TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        list_id TEXT NULL,
        title TEXT NOT NULL,
        detail TEXT NULL,
        completed INTEGER NOT NULL DEFAULT 0,
        date TEXT NULL,
        time TEXT NULL,
        reminder INTEGER NULL,
        reminder_offset_minutes INTEGER NULL,
        repeat_type TEXT NULL,
        repeat_day_of_week TEXT NULL,
        repeat_day_of_month TEXT NULL,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(list_id) REFERENCES lists(id) ON DELETE SET NULL
      );

      CREATE TABLE IF NOT EXISTS task_actions (
        task_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        scheme_id TEXT NOT NULL,
        params TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY(task_id, position),
        FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY(scheme_id) REFERENCES schemes(id) ON DELETE CASCADE
      );
      "#,
    )
    .map_err(|err| format!("Failed to initialize schema: {err}"))?;

  let list_count: i64 = conn
    .query_row("SELECT COUNT(*) FROM lists", [], |row| row.get(0))
    .map_err(|err| format!("Failed to count lists: {err}"))?;

  if list_count == 0 {
    let mut stmt = conn
      .prepare("INSERT INTO lists (id, name, icon) VALUES (?1, ?2, ?3)")
      .map_err(|err| format!("Failed to prepare list seed statement: {err}"))?;

    for list in default_lists() {
      stmt
        .execute(params![list.id, list.name, list.icon])
        .map_err(|err| format!("Failed to seed lists: {err}"))?;
    }
  }

  let scheme_count: i64 = conn
    .query_row("SELECT COUNT(*) FROM schemes", [], |row| row.get(0))
    .map_err(|err| format!("Failed to count schemes: {err}"))?;

  if scheme_count == 0 {
    let mut stmt = conn
      .prepare(
        "INSERT INTO schemes (id, name, icon, template, kind, param_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      )
      .map_err(|err| format!("Failed to prepare scheme seed statement: {err}"))?;

    for scheme in default_schemes() {
      stmt
        .execute(params![
          scheme.id,
          scheme.name,
          scheme.icon,
          scheme.template,
          scheme.kind,
          scheme.param_type
        ])
        .map_err(|err| format!("Failed to seed schemes: {err}"))?;
    }
  }

  Ok(())
}

fn load_lists(conn: &Connection) -> Result<Vec<ListItem>, String> {
  let mut stmt = conn
    .prepare("SELECT id, name, icon FROM lists ORDER BY rowid ASC")
    .map_err(|err| format!("Failed to query lists: {err}"))?;

  let rows = stmt
    .query_map([], |row| {
      Ok(ListItem {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
      })
    })
    .map_err(|err| format!("Failed to map lists: {err}"))?;

  let mut lists = Vec::new();
  for row in rows {
    lists.push(row.map_err(|err| format!("Failed to read list row: {err}"))?);
  }
  Ok(lists)
}

fn load_schemes(conn: &Connection) -> Result<Vec<UrlScheme>, String> {
  let mut stmt = conn
    .prepare("SELECT id, name, icon, template, kind, param_type FROM schemes ORDER BY rowid ASC")
    .map_err(|err| format!("Failed to query schemes: {err}"))?;

  let rows = stmt
    .query_map([], |row| {
      Ok(UrlScheme {
        id: row.get(0)?,
        name: row.get(1)?,
        icon: row.get(2)?,
        template: row.get(3)?,
        kind: row.get(4)?,
        param_type: row.get(5)?,
      })
    })
    .map_err(|err| format!("Failed to map schemes: {err}"))?;

  let mut schemes = Vec::new();
  for row in rows {
    schemes.push(row.map_err(|err| format!("Failed to read scheme row: {err}"))?);
  }
  Ok(schemes)
}

fn load_task_actions(conn: &Connection) -> Result<HashMap<String, Vec<TaskActionBinding>>, String> {
  let mut stmt = conn
    .prepare("SELECT task_id, scheme_id, params FROM task_actions ORDER BY task_id ASC, position ASC")
    .map_err(|err| format!("Failed to query task actions: {err}"))?;

  let rows = stmt
    .query_map([], |row| {
      let task_id: String = row.get(0)?;
      let scheme_id: String = row.get(1)?;
      let params_json: String = row.get(2)?;
      let params: Vec<String> = serde_json::from_str(&params_json).unwrap_or_default();
      Ok((
        task_id,
        TaskActionBinding {
          scheme_id,
          params,
        },
      ))
    })
    .map_err(|err| format!("Failed to map task actions: {err}"))?;

  let mut grouped: HashMap<String, Vec<TaskActionBinding>> = HashMap::new();
  for row in rows {
    let (task_id, action) = row.map_err(|err| format!("Failed to read action row: {err}"))?;
    grouped.entry(task_id).or_default().push(action);
  }

  Ok(grouped)
}

fn load_tasks(conn: &Connection) -> Result<Vec<TaskItem>, String> {
  let action_map = load_task_actions(conn)?;

  let mut stmt = conn
    .prepare(
      "SELECT id, list_id, title, detail, completed, date, time, reminder, reminder_offset_minutes, repeat_type, repeat_day_of_week, repeat_day_of_month
       FROM tasks
       ORDER BY completed ASC, date IS NULL ASC, date ASC, time IS NULL ASC, time ASC, rowid DESC",
    )
    .map_err(|err| format!("Failed to query tasks: {err}"))?;

  let rows = stmt
    .query_map([], |row| {
      let id: String = row.get(0)?;
      let repeat_type: Option<String> = row.get(9)?;
      let repeat_day_of_week_json: Option<String> = row.get(10)?;
      let repeat_day_of_month_json: Option<String> = row.get(11)?;

      let repeat_rule = repeat_type.map(|repeat_type_value| RepeatRule {
        rule_type: repeat_type_value,
        day_of_week: repeat_day_of_week_json
          .as_deref()
          .and_then(|text| serde_json::from_str::<Vec<u8>>(text).ok()),
        day_of_month: repeat_day_of_month_json
          .as_deref()
          .and_then(|text| serde_json::from_str::<Vec<u8>>(text).ok()),
      });

      Ok(TaskItem {
        id: id.clone(),
        list_id: row.get(1)?,
        title: row.get(2)?,
        detail: row.get(3)?,
        completed: row.get::<_, i64>(4)? != 0,
        date: row.get(5)?,
        time: row.get(6)?,
        reminder: row.get::<_, Option<i64>>(7)?.map(|value| value != 0),
        reminder_offset_minutes: row.get(8)?,
        repeat_rule,
        actions: action_map.get(&id).cloned(),
      })
    })
    .map_err(|err| format!("Failed to map tasks: {err}"))?;

  let mut tasks = Vec::new();
  for row in rows {
    tasks.push(row.map_err(|err| format!("Failed to read task row: {err}"))?);
  }

  Ok(tasks)
}

fn persist_task_actions(
  tx: &rusqlite::Transaction,
  task_id: &str,
  actions: &[TaskActionBinding],
) -> Result<(), String> {
  tx
    .execute("DELETE FROM task_actions WHERE task_id = ?1", params![task_id])
    .map_err(|err| format!("Failed to clear task actions: {err}"))?;

  let mut stmt = tx
    .prepare(
      "INSERT INTO task_actions (task_id, position, scheme_id, params) VALUES (?1, ?2, ?3, ?4)",
    )
    .map_err(|err| format!("Failed to prepare action insert statement: {err}"))?;

  for (index, action) in actions.iter().enumerate() {
    let params_json =
      serde_json::to_string(&action.params).map_err(|err| format!("Failed to encode action params: {err}"))?;
    stmt
      .execute(params![task_id, index as i64, action.scheme_id, params_json])
      .map_err(|err| format!("Failed to insert task action: {err}"))?;
  }

  Ok(())
}

fn fetch_task_by_id(conn: &Connection, task_id: &str) -> Result<TaskItem, String> {
  load_tasks(conn)?
    .into_iter()
    .find(|task| task.id == task_id)
    .ok_or_else(|| "Task not found".to_string())
}

fn persist_snapshot(conn: &mut Connection, snapshot: &AppSnapshot) -> Result<(), String> {
  let tx = conn
    .transaction()
    .map_err(|err| format!("Failed to start snapshot transaction: {err}"))?;

  tx
    .execute("DELETE FROM task_actions", [])
    .map_err(|err| format!("Failed to clear task actions: {err}"))?;
  tx
    .execute("DELETE FROM tasks", [])
    .map_err(|err| format!("Failed to clear tasks: {err}"))?;
  tx
    .execute("DELETE FROM schemes", [])
    .map_err(|err| format!("Failed to clear schemes: {err}"))?;
  tx
    .execute("DELETE FROM lists", [])
    .map_err(|err| format!("Failed to clear lists: {err}"))?;

  {
    let mut list_stmt = tx
      .prepare("INSERT INTO lists (id, name, icon) VALUES (?1, ?2, ?3)")
      .map_err(|err| format!("Failed to prepare list insert statement: {err}"))?;
    for list in &snapshot.lists {
      list_stmt
        .execute(params![list.id, list.name, list.icon])
        .map_err(|err| format!("Failed to insert list: {err}"))?;
    }
  }

  {
    let mut scheme_stmt = tx
      .prepare(
        "INSERT INTO schemes (id, name, icon, template, kind, param_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      )
      .map_err(|err| format!("Failed to prepare scheme insert statement: {err}"))?;
    for scheme in &snapshot.schemes {
      scheme_stmt
        .execute(params![
          scheme.id,
          scheme.name,
          scheme.icon,
          scheme.template,
          scheme.kind,
          scheme.param_type
        ])
        .map_err(|err| format!("Failed to insert scheme: {err}"))?;
    }
  }

  {
    let mut task_stmt = tx
      .prepare(
        "INSERT INTO tasks (id, list_id, title, detail, completed, date, time, reminder, reminder_offset_minutes, repeat_type, repeat_day_of_week, repeat_day_of_month)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
      )
      .map_err(|err| format!("Failed to prepare task insert statement: {err}"))?;

    for task in &snapshot.tasks {
      validate_repeat_rule(&task.repeat_rule)?;
      let repeat_type = task.repeat_rule.as_ref().map(|rule| rule.rule_type.clone());
      let repeat_day_of_week = task
        .repeat_rule
        .as_ref()
        .and_then(|rule| rule.day_of_week.clone())
        .map(|days| serde_json::to_string(&days))
        .transpose()
        .map_err(|err| format!("Failed to encode repeat days of week: {err}"))?;
      let repeat_day_of_month = task
        .repeat_rule
        .as_ref()
        .and_then(|rule| rule.day_of_month.clone())
        .map(|days| serde_json::to_string(&days))
        .transpose()
        .map_err(|err| format!("Failed to encode repeat days of month: {err}"))?;

      task_stmt
        .execute(params![
          task.id,
          task.list_id,
          task.title,
          task.detail,
          if task.completed { 1 } else { 0 },
          task.date,
          task.time,
          task.reminder.map(|v| if v { 1 } else { 0 }),
          task.reminder_offset_minutes,
          repeat_type,
          repeat_day_of_week,
          repeat_day_of_month
        ])
        .map_err(|err| format!("Failed to insert task: {err}"))?;

      if let Some(actions) = task.actions.as_ref() {
        persist_task_actions(&tx, &task.id, actions)?;
      }
    }
  }

  tx
    .commit()
    .map_err(|err| format!("Failed to commit snapshot transaction: {err}"))?;
  Ok(())
}

fn parse_date_ymd(value: &str) -> Option<NaiveDate> {
  NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

fn compute_next_repeat_date(task: &TaskItem) -> Option<String> {
  let repeat_rule = task.repeat_rule.as_ref()?;
  let current_date = parse_date_ymd(task.date.as_deref()?)?;

  let next = match repeat_rule.rule_type.as_str() {
    "daily" => current_date.checked_add_signed(Duration::days(1))?,
    "weekly" => {
      let mut days = repeat_rule.day_of_week.clone().unwrap_or_default();
      if days.is_empty() {
        return None;
      }
      days.sort_unstable();
      let today_weekday = current_date.weekday().num_days_from_sunday() as u8;

      let mut target_offset: Option<i64> = None;
      for day in days {
        if day > today_weekday {
          target_offset = Some((day - today_weekday) as i64);
          break;
        }
      }
      let fallback = repeat_rule
        .day_of_week
        .as_ref()
        .and_then(|items| items.iter().min().copied())
        .map(|day| {
          let delta = (7 - today_weekday as i64) + day as i64;
          if delta <= 0 { 7 } else { delta }
        })?;

      current_date.checked_add_signed(Duration::days(target_offset.unwrap_or(fallback)))?
    }
    "monthly" => {
      let mut days = repeat_rule.day_of_month.clone().unwrap_or_default();
      if days.is_empty() {
        return None;
      }
      days.sort_unstable();
      let current_day = current_date.day() as u8;

      for day in &days {
        if *day > current_day {
          if let Some(candidate) =
            NaiveDate::from_ymd_opt(current_date.year(), current_date.month(), *day as u32)
          {
            return Some(candidate.format("%Y-%m-%d").to_string());
          }
        }
      }

      let mut year = current_date.year();
      let mut month = current_date.month();
      for _ in 0..24 {
        if month == 12 {
          month = 1;
          year += 1;
        } else {
          month += 1;
        }

        for day in &days {
          if let Some(candidate) = NaiveDate::from_ymd_opt(year, month, *day as u32) {
            return Some(candidate.format("%Y-%m-%d").to_string());
          }
        }
      }
      return None;
    }
    _ => return None,
  };

  Some(next.format("%Y-%m-%d").to_string())
}

#[tauri::command]
fn get_app_snapshot(db: State<'_, DbState>) -> Result<AppSnapshot, String> {
  let conn = open_connection(&db.db_path)?;

  Ok(AppSnapshot {
    lists: load_lists(&conn)?,
    tasks: load_tasks(&conn)?,
    schemes: load_schemes(&conn)?,
  })
}

#[tauri::command]
fn export_backup(db: State<'_, DbState>, path: String) -> Result<String, String> {
  let output_path = PathBuf::from(path.trim());
  if output_path.as_os_str().is_empty() {
    return Err("Backup path is required".to_string());
  }

  let conn = open_connection(&db.db_path)?;
  let snapshot = AppSnapshot {
    lists: load_lists(&conn)?,
    tasks: load_tasks(&conn)?,
    schemes: load_schemes(&conn)?,
  };

  let payload = BackupPayload {
    version: 1,
    exported_at: chrono::Utc::now().to_rfc3339(),
    snapshot,
  };

  let content =
    serde_json::to_string_pretty(&payload).map_err(|err| format!("Failed to encode backup: {err}"))?;
  fs::write(&output_path, content).map_err(|err| format!("Failed to write backup file: {err}"))?;

  Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
fn import_backup(db: State<'_, DbState>, path: String) -> Result<AppSnapshot, String> {
  let input_path = PathBuf::from(path.trim());
  if input_path.as_os_str().is_empty() {
    return Err("Backup path is required".to_string());
  }

  let content = fs::read_to_string(&input_path)
    .map_err(|err| format!("Failed to read backup file: {err}"))?;
  let payload: BackupPayload =
    serde_json::from_str(&content).map_err(|err| format!("Failed to parse backup file: {err}"))?;

  if payload.version != 1 {
    return Err("Unsupported backup version".to_string());
  }
  if payload.snapshot.lists.is_empty() {
    return Err("Backup data is invalid: lists cannot be empty".to_string());
  }

  let mut conn = open_connection(&db.db_path)?;
  persist_snapshot(&mut conn, &payload.snapshot)?;

  let conn = open_connection(&db.db_path)?;
  Ok(AppSnapshot {
    lists: load_lists(&conn)?,
    tasks: load_tasks(&conn)?,
    schemes: load_schemes(&conn)?,
  })
}

#[tauri::command]
fn create_list(db: State<'_, DbState>, input: ListInput) -> Result<ListItem, String> {
  let name = input.name.trim();
  let icon = input.icon.trim();
  if name.is_empty() {
    return Err("List name is required".to_string());
  }

  let list = ListItem {
    id: format!("list_{}", Uuid::new_v4()),
    name: name.to_string(),
    icon: if icon.is_empty() { "🗂️".to_string() } else { icon.to_string() },
  };

  let conn = open_connection(&db.db_path)?;
  conn
    .execute(
      "INSERT INTO lists (id, name, icon) VALUES (?1, ?2, ?3)",
      params![list.id, list.name, list.icon],
    )
    .map_err(|err| format!("Failed to create list: {err}"))?;

  Ok(list)
}

#[tauri::command]
fn update_list(db: State<'_, DbState>, list_id: String, patch: ListInput) -> Result<ListItem, String> {
  let name = patch.name.trim();
  let icon = patch.icon.trim();
  if name.is_empty() {
    return Err("List name is required".to_string());
  }

  let list = ListItem {
    id: list_id.clone(),
    name: name.to_string(),
    icon: if icon.is_empty() { "🗂️".to_string() } else { icon.to_string() },
  };

  let conn = open_connection(&db.db_path)?;
  let affected = conn
    .execute(
      "UPDATE lists SET name = ?2, icon = ?3 WHERE id = ?1",
      params![list.id, list.name, list.icon],
    )
    .map_err(|err| format!("Failed to update list: {err}"))?;

  if affected == 0 {
    return Err("List not found".to_string());
  }

  Ok(list)
}

#[tauri::command]
fn create_scheme(db: State<'_, DbState>, input: SchemeInput) -> Result<UrlScheme, String> {
  let name = input.name.trim();
  let icon = input.icon.trim();
  let template = input.template.trim();
  if name.is_empty() || template.is_empty() {
    return Err("Scheme name and template are required".to_string());
  }

  let scheme = UrlScheme {
    id: format!("scheme_{}", Uuid::new_v4()),
    name: name.to_string(),
    icon: if icon.is_empty() { "🔗".to_string() } else { icon.to_string() },
    template: template.to_string(),
    kind: normalize_scheme_kind(input.kind),
    param_type: match input.param_type.trim() {
      "number" => "number".to_string(),
      _ => "string".to_string(),
    },
  };

  let conn = open_connection(&db.db_path)?;
  conn
    .execute(
      "INSERT INTO schemes (id, name, icon, template, kind, param_type) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
      params![
        scheme.id,
        scheme.name,
        scheme.icon,
        scheme.template,
        scheme.kind,
        scheme.param_type
      ],
    )
    .map_err(|err| format!("Failed to create scheme: {err}"))?;

  Ok(scheme)
}

#[tauri::command]
fn update_scheme(
  db: State<'_, DbState>,
  scheme_id: String,
  patch: SchemeInput,
) -> Result<UrlScheme, String> {
  let name = patch.name.trim();
  let icon = patch.icon.trim();
  let template = patch.template.trim();
  if name.is_empty() || template.is_empty() {
    return Err("Scheme name and template are required".to_string());
  }

  let scheme = UrlScheme {
    id: scheme_id.clone(),
    name: name.to_string(),
    icon: if icon.is_empty() { "🔗".to_string() } else { icon.to_string() },
    template: template.to_string(),
    kind: normalize_scheme_kind(patch.kind),
    param_type: match patch.param_type.trim() {
      "number" => "number".to_string(),
      _ => "string".to_string(),
    },
  };

  let conn = open_connection(&db.db_path)?;
  let affected = conn
    .execute(
      "UPDATE schemes SET name = ?2, icon = ?3, template = ?4, kind = ?5, param_type = ?6 WHERE id = ?1",
      params![
        scheme.id,
        scheme.name,
        scheme.icon,
        scheme.template,
        scheme.kind,
        scheme.param_type
      ],
    )
    .map_err(|err| format!("Failed to update scheme: {err}"))?;

  if affected == 0 {
    return Err("Scheme not found".to_string());
  }

  Ok(scheme)
}

#[tauri::command]
fn delete_scheme(db: State<'_, DbState>, scheme_id: String) -> Result<(), String> {
  let conn = open_connection(&db.db_path)?;
  conn
    .execute("DELETE FROM schemes WHERE id = ?1", params![scheme_id])
    .map_err(|err| format!("Failed to delete scheme: {err}"))?;

  Ok(())
}

#[tauri::command]
fn create_task(db: State<'_, DbState>, input: NewTaskInput) -> Result<TaskItem, String> {
  validate_repeat_rule(&input.repeat_rule)?;

  let title = input.title.trim();
  if title.is_empty() {
    return Err("Task title is required".to_string());
  }

  let task_id = format!("task_{}", Uuid::new_v4());
  let repeat_type = input.repeat_rule.as_ref().map(|rule| rule.rule_type.clone());
  let repeat_day_of_week = input
    .repeat_rule
    .as_ref()
    .and_then(|rule| rule.day_of_week.clone())
    .map(|days| serde_json::to_string(&days))
    .transpose()
    .map_err(|err| format!("Failed to encode repeat days of week: {err}"))?;
  let repeat_day_of_month = input
    .repeat_rule
    .as_ref()
    .and_then(|rule| rule.day_of_month.clone())
    .map(|days| serde_json::to_string(&days))
    .transpose()
    .map_err(|err| format!("Failed to encode repeat days of month: {err}"))?;

  let mut conn = open_connection(&db.db_path)?;
  let tx = conn
    .transaction()
    .map_err(|err| format!("Failed to start transaction: {err}"))?;

  tx
    .execute(
      "INSERT INTO tasks (id, list_id, title, detail, completed, date, time, reminder, reminder_offset_minutes, repeat_type, repeat_day_of_week, repeat_day_of_month)
       VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
      params![
        task_id,
        input.list_id,
        title,
        input.detail.and_then(|v| {
          let trimmed = v.trim().to_string();
          if trimmed.is_empty() { None } else { Some(trimmed) }
        }),
        input.date,
        input.time,
        input.reminder.map(|v| if v { 1 } else { 0 }),
        input.reminder_offset_minutes,
        repeat_type,
        repeat_day_of_week,
        repeat_day_of_month
      ],
    )
    .map_err(|err| format!("Failed to create task: {err}"))?;

  if let Some(actions) = &input.actions {
    persist_task_actions(&tx, &task_id, actions)?;
  }

  tx
    .commit()
    .map_err(|err| format!("Failed to commit task creation: {err}"))?;

  let conn = open_connection(&db.db_path)?;
  fetch_task_by_id(&conn, &task_id)
}

#[tauri::command]
fn save_task(db: State<'_, DbState>, task: SaveTaskInput) -> Result<TaskItem, String> {
  validate_repeat_rule(&task.repeat_rule)?;

  let title = task.title.trim();
  if title.is_empty() {
    return Err("Task title is required".to_string());
  }

  let repeat_type = task.repeat_rule.as_ref().map(|rule| rule.rule_type.clone());
  let repeat_day_of_week = task
    .repeat_rule
    .as_ref()
    .and_then(|rule| rule.day_of_week.clone())
    .map(|days| serde_json::to_string(&days))
    .transpose()
    .map_err(|err| format!("Failed to encode repeat days of week: {err}"))?;
  let repeat_day_of_month = task
    .repeat_rule
    .as_ref()
    .and_then(|rule| rule.day_of_month.clone())
    .map(|days| serde_json::to_string(&days))
    .transpose()
    .map_err(|err| format!("Failed to encode repeat days of month: {err}"))?;

  let mut conn = open_connection(&db.db_path)?;
  let tx = conn
    .transaction()
    .map_err(|err| format!("Failed to start transaction: {err}"))?;

  let affected = tx
    .execute(
      "UPDATE tasks
       SET list_id = ?2,
           title = ?3,
           detail = ?4,
           completed = ?5,
           date = ?6,
           time = ?7,
           reminder = ?8,
           reminder_offset_minutes = ?9,
           repeat_type = ?10,
           repeat_day_of_week = ?11,
           repeat_day_of_month = ?12,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?1",
      params![
        task.id,
        task.list_id,
        title,
        task.detail.and_then(|v| {
          let trimmed = v.trim().to_string();
          if trimmed.is_empty() { None } else { Some(trimmed) }
        }),
        if task.completed { 1 } else { 0 },
        task.date,
        task.time,
        task.reminder.map(|v| if v { 1 } else { 0 }),
        task.reminder_offset_minutes,
        repeat_type,
        repeat_day_of_week,
        repeat_day_of_month
      ],
    )
    .map_err(|err| format!("Failed to update task: {err}"))?;

  if affected == 0 {
    return Err("Task not found".to_string());
  }

  persist_task_actions(&tx, &task.id, &task.actions.unwrap_or_default())?;

  tx
    .commit()
    .map_err(|err| format!("Failed to commit task update: {err}"))?;

  let conn = open_connection(&db.db_path)?;
  fetch_task_by_id(&conn, &task.id)
}

#[tauri::command]
fn toggle_task_completed(db: State<'_, DbState>, task_id: String) -> Result<TaskItem, String> {
  let mut conn = open_connection(&db.db_path)?;
  let task = fetch_task_by_id(&conn, &task_id)?;
  let next = if task.completed { 0 } else { 1 };

  let tx = conn
    .transaction()
    .map_err(|err| format!("Failed to start transaction: {err}"))?;

  tx
    .execute(
      "UPDATE tasks SET completed = ?2, updated_at = CURRENT_TIMESTAMP WHERE id = ?1",
      params![task_id, next],
    )
    .map_err(|err| format!("Failed to toggle task completion: {err}"))?;

  if !task.completed && next == 1 {
    if let Some(next_date) = compute_next_repeat_date(&task) {
      let next_task_id = format!("task_{}", Uuid::new_v4());
      let repeat_type = task.repeat_rule.as_ref().map(|rule| rule.rule_type.clone());
      let repeat_day_of_week = task
        .repeat_rule
        .as_ref()
        .and_then(|rule| rule.day_of_week.clone())
        .map(|days| serde_json::to_string(&days))
        .transpose()
        .map_err(|err| format!("Failed to encode repeat days of week: {err}"))?;
      let repeat_day_of_month = task
        .repeat_rule
        .as_ref()
        .and_then(|rule| rule.day_of_month.clone())
        .map(|days| serde_json::to_string(&days))
        .transpose()
        .map_err(|err| format!("Failed to encode repeat days of month: {err}"))?;

      tx
        .execute(
          "INSERT INTO tasks (id, list_id, title, detail, completed, date, time, reminder, reminder_offset_minutes, repeat_type, repeat_day_of_week, repeat_day_of_month)
           VALUES (?1, ?2, ?3, ?4, 0, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
          params![
            next_task_id,
            task.list_id,
            task.title,
            task.detail,
            next_date,
            task.time,
            task.reminder.map(|v| if v { 1 } else { 0 }),
            task.reminder_offset_minutes,
            repeat_type,
            repeat_day_of_week,
            repeat_day_of_month
          ],
        )
        .map_err(|err| format!("Failed to create next recurring task: {err}"))?;

      if let Some(actions) = task.actions.as_ref() {
        persist_task_actions(&tx, &next_task_id, actions)?;
      }
    }
  }

  tx
    .commit()
    .map_err(|err| format!("Failed to commit task toggle: {err}"))?;

  let conn = open_connection(&db.db_path)?;
  fetch_task_by_id(&conn, &task_id)
}

#[tauri::command]
fn delete_task(db: State<'_, DbState>, task_id: String) -> Result<(), String> {
  let conn = open_connection(&db.db_path)?;
  let affected = conn
    .execute("DELETE FROM tasks WHERE id = ?1", params![task_id])
    .map_err(|err| format!("Failed to delete task: {err}"))?;

  if affected == 0 {
    return Err("Task not found".to_string());
  }

  Ok(())
}

#[tauri::command]
fn delete_list(db: State<'_, DbState>, list_id: String) -> Result<(), String> {
  if list_id == "list_today" {
    return Err("Default list cannot be deleted".to_string());
  }

  let conn = open_connection(&db.db_path)?;
  let affected = conn
    .execute("DELETE FROM lists WHERE id = ?1", params![list_id])
    .map_err(|err| format!("Failed to delete list: {err}"))?;

  if affected == 0 {
    return Err("List not found".to_string());
  }

  Ok(())
}

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
    .setup(|app| {
      let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Failed to resolve app data dir: {err}"))?;

      fs::create_dir_all(&app_data_dir)
        .map_err(|err| format!("Failed to create app data dir: {err}"))?;

      let db_path = app_data_dir.join("linkflow.db");
      init_database(&db_path)?;

      app.manage(DbState { db_path });
      Ok(())
    })
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init())
    .invoke_handler(tauri::generate_handler![
      get_app_snapshot,
      export_backup,
      import_backup,
      create_list,
      update_list,
      create_scheme,
      update_scheme,
      delete_scheme,
      create_task,
      save_task,
      toggle_task_completed,
      delete_task,
      delete_list,
      run_script
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
