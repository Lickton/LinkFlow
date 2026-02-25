use chrono::{Datelike, Duration, Local, NaiveDate, NaiveTime, TimeZone, Utc};
use rusqlite::{params, Connection};
use serde::de::{self, Deserializer};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Notify;
use tokio::time::{sleep, Duration as TokioDuration};
use uuid::Uuid;

#[derive(Clone)]
struct DbState {
  db_path: PathBuf,
}

#[derive(Clone)]
struct SchedulerState {
  wakeup: Arc<Notify>,
}

#[derive(Debug, Clone)]
struct ReminderCandidate {
  task_id: String,
  task_title: String,
  task_detail: Option<String>,
  list_name: Option<String>,
  due_date: String,
  time: String,
  remind_at_ms: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DebugNextReminder {
  task_id: String,
  task_title: String,
  remind_at: i64,
  due_date: String,
  time: String,
  now: i64,
  delay_ms: i64,
}

const REMINDER_GRACE_MS: i64 = 10 * 60 * 1000;
const FIRED_REMINDER_RETENTION_MS: i64 = 30 * 24 * 60 * 60 * 1000;

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
struct Reminder {
  #[serde(rename = "type")]
  reminder_type: String,
  offset_minutes: i64,
}

fn deserialize_reminder<'de, D>(deserializer: D) -> Result<Option<Reminder>, D::Error>
where
  D: Deserializer<'de>,
{
  let value = Option::<serde_json::Value>::deserialize(deserializer)?;
  match value {
    None | Some(serde_json::Value::Null) => Ok(None),
    Some(serde_json::Value::Bool(enabled)) => {
      if enabled {
        Ok(Some(Reminder {
          reminder_type: "relative".to_string(),
          offset_minutes: 10,
        }))
      } else {
        Ok(None)
      }
    }
    Some(raw) => serde_json::from_value::<Reminder>(raw)
      .map(Some)
      .map_err(de::Error::custom),
  }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct TaskItem {
  id: String,
  list_id: Option<String>,
  title: String,
  detail: Option<String>,
  completed: bool,
  due_date: Option<String>,
  time: Option<String>,
  #[serde(default, deserialize_with = "deserialize_reminder")]
  reminder: Option<Reminder>,
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
  due_date: Option<String>,
  time: Option<String>,
  #[serde(default, deserialize_with = "deserialize_reminder")]
  reminder: Option<Reminder>,
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
  due_date: Option<String>,
  time: Option<String>,
  #[serde(default, deserialize_with = "deserialize_reminder")]
  reminder: Option<Reminder>,
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

fn normalize_relative_reminder(reminder: &Option<Reminder>) -> Result<Option<Reminder>, String> {
  if let Some(value) = reminder {
    if value.reminder_type != "relative" {
      return Err("Only relative reminders are supported".to_string());
    }
    return Ok(Some(Reminder {
      reminder_type: "relative".to_string(),
      offset_minutes: value.offset_minutes.max(0),
    }));
  }
  Ok(None)
}

fn reminder_to_db(reminder: &Option<Reminder>) -> Result<(Option<i64>, Option<i64>), String> {
  let normalized = normalize_relative_reminder(reminder)?;
  if let Some(value) = normalized {
    return Ok((Some(1), Some(value.offset_minutes)));
  }
  Ok((None, None))
}

fn reminder_from_db(enabled: Option<i64>, offset: Option<i64>) -> Option<Reminder> {
  if enabled.unwrap_or(0) == 0 {
    return None;
  }
  Some(Reminder {
    reminder_type: "relative".to_string(),
    offset_minutes: offset.unwrap_or(10).max(0),
  })
}

fn normalize_scheme_kind(kind: Option<String>) -> String {
  let _ = kind;
  "url".to_string()
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

      CREATE TABLE IF NOT EXISTS fired_reminders (
        task_id TEXT NOT NULL,
        remind_at INTEGER NOT NULL,
        fired_at INTEGER NOT NULL,
        PRIMARY KEY(task_id, remind_at)
      );
      "#,
    )
    .map_err(|err| format!("Failed to initialize schema: {err}"))?;

  conn
    .execute("UPDATE schemes SET kind = 'url' WHERE kind IS NULL OR kind != 'url'", [])
    .map_err(|err| format!("Failed to normalize scheme kinds: {err}"))?;

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
        due_date: row.get(5)?,
        time: row.get(6)?,
        reminder: reminder_from_db(row.get(7)?, row.get(8)?),
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
    .execute("DELETE FROM fired_reminders", [])
    .map_err(|err| format!("Failed to clear fired reminders: {err}"))?;
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
      let (reminder_enabled, reminder_offset_minutes) = reminder_to_db(&task.reminder)?;
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
          task.due_date,
          task.time,
          reminder_enabled,
          reminder_offset_minutes,
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

fn parse_time_hm(value: &str) -> Option<NaiveTime> {
  NaiveTime::parse_from_str(value, "%H:%M").ok()
}

fn now_epoch_ms() -> i64 {
  Utc::now().timestamp_millis()
}

fn compute_remind_at(task: &TaskItem) -> Option<i64> {
  let due_date = parse_date_ymd(task.due_date.as_deref()?)?;
  let due_time = parse_time_hm(task.time.as_deref()?)?;
  let reminder = task.reminder.as_ref()?;
  if reminder.reminder_type != "relative" {
    return None;
  }

  let naive_dt = due_date.and_time(due_time);
  let due_local = match Local.from_local_datetime(&naive_dt) {
    chrono::LocalResult::Single(dt) => dt,
    chrono::LocalResult::Ambiguous(first, _) => first,
    chrono::LocalResult::None => return None,
  };

  Some(due_local.timestamp_millis() - reminder.offset_minutes.max(0) * 60_000)
}

fn cleanup_old_fired_reminders(conn: &Connection, now_ms: i64) -> Result<(), String> {
  let threshold = now_ms - FIRED_REMINDER_RETENTION_MS;
  conn
    .execute(
      "DELETE FROM fired_reminders WHERE fired_at < ?1",
      params![threshold],
    )
    .map_err(|err| format!("Failed to cleanup fired reminders: {err}"))?;
  Ok(())
}

fn is_reminder_fired(conn: &Connection, task_id: &str, remind_at_ms: i64) -> Result<bool, String> {
  let exists: i64 = conn
    .query_row(
      "SELECT EXISTS(SELECT 1 FROM fired_reminders WHERE task_id = ?1 AND remind_at = ?2)",
      params![task_id, remind_at_ms],
      |row| row.get(0),
    )
    .map_err(|err| format!("Failed to check fired reminder: {err}"))?;
  Ok(exists != 0)
}

fn query_next_reminder(db_path: &Path, now_ms: i64) -> Result<Option<ReminderCandidate>, String> {
  let conn = open_connection(db_path)?;
  cleanup_old_fired_reminders(&conn, now_ms)?;

  let mut stmt = conn
    .prepare(
      "SELECT t.id, t.title, t.detail, t.date, t.time, t.reminder, t.reminder_offset_minutes, l.name
       FROM tasks t
       LEFT JOIN lists l ON l.id = t.list_id
       WHERE t.completed = 0
         AND t.date IS NOT NULL
         AND t.time IS NOT NULL
         AND t.reminder = 1
       ORDER BY t.date ASC, t.time ASC, t.rowid ASC",
    )
    .map_err(|err| format!("Failed to query reminder candidates: {err}"))?;

  let rows = stmt
    .query_map([], |row| {
      Ok((
        row.get::<_, String>(0)?,
        row.get::<_, String>(1)?,
        row.get::<_, Option<String>>(2)?,
        row.get::<_, Option<String>>(3)?,
        row.get::<_, Option<String>>(4)?,
        row.get::<_, Option<i64>>(5)?,
        row.get::<_, Option<i64>>(6)?,
        row.get::<_, Option<String>>(7)?,
      ))
    })
    .map_err(|err| format!("Failed to map reminder candidates: {err}"))?;

  let mut next: Option<ReminderCandidate> = None;
  for row in rows {
    let (task_id, title, detail, due_date, time, reminder_enabled, reminder_offset, list_name) =
      row.map_err(|err| format!("Failed to read reminder candidate row: {err}"))?;
    if reminder_enabled.unwrap_or(0) == 0 {
      continue;
    }

    let task = TaskItem {
      id: task_id.clone(),
      list_id: None,
      title: title.clone(),
      detail: detail.clone(),
      completed: false,
      due_date: due_date.clone(),
      time: time.clone(),
      reminder: reminder_from_db(reminder_enabled, reminder_offset),
      repeat_rule: None,
      actions: None,
    };
    let Some(remind_at_ms) = compute_remind_at(&task) else {
      continue;
    };
    if remind_at_ms < now_ms - REMINDER_GRACE_MS {
      continue;
    }
    if is_reminder_fired(&conn, &task_id, remind_at_ms)? {
      continue;
    }

    let candidate = ReminderCandidate {
      task_id,
      task_title: title,
      task_detail: detail,
      list_name,
      due_date: due_date.unwrap_or_default(),
      time: time.unwrap_or_default(),
      remind_at_ms,
    };

    let should_replace = next
      .as_ref()
      .map(|existing| candidate.remind_at_ms < existing.remind_at_ms)
      .unwrap_or(true);
    if should_replace {
      next = Some(candidate);
    }
  }

  Ok(next)
}

fn mark_reminder_fired(
  conn: &Connection,
  task_id: &str,
  remind_at_ms: i64,
  fired_at_ms: i64,
) -> Result<bool, String> {
  let affected = conn
    .execute(
      "INSERT OR IGNORE INTO fired_reminders (task_id, remind_at, fired_at) VALUES (?1, ?2, ?3)",
      params![task_id, remind_at_ms, fired_at_ms],
    )
    .map_err(|err| format!("Failed to record fired reminder: {err}"))?;
  Ok(affected == 1)
}

fn send_task_reminder_notification(app: &AppHandle, candidate: &ReminderCandidate) -> Result<(), String> {
  let body = candidate
    .task_detail
    .as_deref()
    .filter(|text| !text.trim().is_empty())
    .map(|text| text.to_string())
    .unwrap_or_else(|| {
      let list_prefix = candidate
        .list_name
        .as_ref()
        .map(|name| format!("{} · ", name))
        .unwrap_or_default();
      format!("{list_prefix}{} {}", candidate.due_date, candidate.time)
    });

  app
    .notification()
    .builder()
    .title(format!("任务提醒：{}", candidate.task_title))
    .body(body)
    .show()
    .map_err(|err| format!("Failed to show notification: {err}"))
}

fn scheduler_wakeup(scheduler: &SchedulerState) {
  scheduler.wakeup.notify_one();
}

async fn scheduler_loop(app: AppHandle, db_path: PathBuf, wakeup: Arc<Notify>) {
  loop {
    let now_ms = now_epoch_ms();
    let next = match query_next_reminder(&db_path, now_ms) {
      Ok(next) => next,
      Err(error) => {
        eprintln!("scheduler query_next_reminder error: {error}");
        tokio::select! {
          _ = wakeup.notified() => {},
          _ = sleep(TokioDuration::from_secs(5)) => {},
        }
        continue;
      }
    };

    let Some(candidate) = next else {
      wakeup.notified().await;
      continue;
    };

    let now_ms = now_epoch_ms();
    let delay_ms = candidate.remind_at_ms.saturating_sub(now_ms);

    if delay_ms > 0 {
      tokio::select! {
        _ = wakeup.notified() => {
          continue;
        }
        _ = sleep(TokioDuration::from_millis(delay_ms as u64)) => {}
      }
    }

    let fired_at_ms = now_epoch_ms();
    let conn = match open_connection(&db_path) {
      Ok(conn) => conn,
      Err(error) => {
        eprintln!("scheduler open db error: {error}");
        continue;
      }
    };

    if let Err(error) = cleanup_old_fired_reminders(&conn, fired_at_ms) {
      eprintln!("scheduler cleanup fired reminders error: {error}");
    }

    match mark_reminder_fired(&conn, &candidate.task_id, candidate.remind_at_ms, fired_at_ms) {
      Ok(true) => {
        if let Err(error) = send_task_reminder_notification(&app, &candidate) {
          eprintln!("scheduler send notification error: {error}");
        }
      }
      Ok(false) => {}
      Err(error) => eprintln!("scheduler mark reminder fired error: {error}"),
    }
  }
}

fn compute_next_repeat_date(task: &TaskItem) -> Option<String> {
  let repeat_rule = task.repeat_rule.as_ref()?;
  let current_date = parse_date_ymd(task.due_date.as_deref()?)?;

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
fn import_backup(
  db: State<'_, DbState>,
  scheduler: State<'_, SchedulerState>,
  path: String,
) -> Result<AppSnapshot, String> {
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
  scheduler_wakeup(&scheduler);

  let conn = open_connection(&db.db_path)?;
  Ok(AppSnapshot {
    lists: load_lists(&conn)?,
    tasks: load_tasks(&conn)?,
    schemes: load_schemes(&conn)?,
  })
}

#[tauri::command]
fn debug_next_reminder(db: State<'_, DbState>) -> Result<Option<DebugNextReminder>, String> {
  let now = now_epoch_ms();
  let next = query_next_reminder(&db.db_path, now)?;
  Ok(next.map(|item| DebugNextReminder {
    task_id: item.task_id,
    task_title: item.task_title,
    remind_at: item.remind_at_ms,
    due_date: item.due_date,
    time: item.time,
    now,
    delay_ms: item.remind_at_ms.saturating_sub(now),
  }))
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
fn create_task(
  db: State<'_, DbState>,
  scheduler: State<'_, SchedulerState>,
  input: NewTaskInput,
) -> Result<TaskItem, String> {
  validate_repeat_rule(&input.repeat_rule)?;
  let (reminder_enabled, reminder_offset_minutes) = reminder_to_db(&input.reminder)?;

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
        input.due_date,
        input.time,
        reminder_enabled,
        reminder_offset_minutes,
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
  scheduler_wakeup(&scheduler);

  let conn = open_connection(&db.db_path)?;
  fetch_task_by_id(&conn, &task_id)
}

#[tauri::command]
fn save_task(
  db: State<'_, DbState>,
  scheduler: State<'_, SchedulerState>,
  task: SaveTaskInput,
) -> Result<TaskItem, String> {
  validate_repeat_rule(&task.repeat_rule)?;
  let (reminder_enabled, reminder_offset_minutes) = reminder_to_db(&task.reminder)?;

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
        task.due_date,
        task.time,
        reminder_enabled,
        reminder_offset_minutes,
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
  scheduler_wakeup(&scheduler);

  let conn = open_connection(&db.db_path)?;
  fetch_task_by_id(&conn, &task.id)
}

#[tauri::command]
fn toggle_task_completed(
  db: State<'_, DbState>,
  scheduler: State<'_, SchedulerState>,
  task_id: String,
) -> Result<TaskItem, String> {
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
      let (reminder_enabled, reminder_offset_minutes) = reminder_to_db(&task.reminder)?;
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
            reminder_enabled,
            reminder_offset_minutes,
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
  scheduler_wakeup(&scheduler);

  let conn = open_connection(&db.db_path)?;
  fetch_task_by_id(&conn, &task_id)
}

#[tauri::command]
fn delete_task(
  db: State<'_, DbState>,
  scheduler: State<'_, SchedulerState>,
  task_id: String,
) -> Result<(), String> {
  let conn = open_connection(&db.db_path)?;
  let affected = conn
    .execute("DELETE FROM tasks WHERE id = ?1", params![task_id])
    .map_err(|err| format!("Failed to delete task: {err}"))?;

  if affected == 0 {
    return Err("Task not found".to_string());
  }

  scheduler_wakeup(&scheduler);
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

      let wakeup = Arc::new(Notify::new());
      app.manage(DbState {
        db_path: db_path.clone(),
      });
      app.manage(SchedulerState {
        wakeup: wakeup.clone(),
      });

      let app_handle = app.handle().clone();
      tauri::async_runtime::spawn(scheduler_loop(app_handle, db_path, wakeup));
      Ok(())
    })
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_notification::init())
    .invoke_handler(tauri::generate_handler![
      get_app_snapshot,
      export_backup,
      import_backup,
      debug_next_reminder,
      create_list,
      update_list,
      create_scheme,
      update_scheme,
      delete_scheme,
      create_task,
      save_task,
      toggle_task_completed,
      delete_task,
      delete_list
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
