# LinkFlow 当前实现梳理（平台 / 功能 / 技术栈）

更新时间：2026-02-21（基于当前仓库代码静态梳理）

## 1. 项目定位与总体结构

LinkFlow 当前是一个 **Tauri 2 + React** 的桌面任务管理应用，核心能力是：

- 任务管理（含日期时间、提醒、重复）
- 动作触发（URL Scheme / 本地脚本）
- 本地持久化（SQLite）
- 备份导入导出（JSON）

代码结构是典型前后端同仓模式：

- 前端：`src/`（React + Zustand + Tailwind）
- 桌面后端：`src-tauri/`（Rust + Tauri command + SQLite）
- 前端通过 `@tauri-apps/api` 的 `invoke` 调用 Rust 命令。

## 2. 平台支持现状

## 2.1 运行平台（实际可用）

- **桌面端 Tauri 运行：已实现且必需**
  - 前端显式判断 `isTauri()`，非 Tauri 环境会直接显示“请使用 tauri 运行”的提示。
  - SQLite 后端 API 也在前端做了 `ensureTauri()` 限制，浏览器模式不可用。

## 2.2 系统/打包相关状态

- Tauri `bundle.targets` 配置为 `"all"`，理论上可面向多桌面目标打包。
- `src-tauri/icons/` 下有 Android/iOS 图标素材，但当前工程主流程是桌面应用。
- `#[cfg_attr(mobile, tauri::mobile_entry_point)]` 存在，但仓库未见完整移动端工程落地代码（可视为“有入口条件编译，未形成完整移动产品实现”）。

## 2.3 Web 端状态

- `npm run dev` 可启动 Vite 页面，但核心功能（数据读写、备份、脚本执行）依赖 Tauri 命令，**不构成可独立工作的 Web 应用**。

## 3. 功能实现清单

## 3.1 任务列表与视图

已实现：

- 列表视图 + 已完成视图切换。
- 内置默认列表（首次初始化写入数据库）：
  - 所有任务（`list_today`）
  - 工作（`list_work`）
  - 生活（`list_life`）
- “所有任务”视图可展示跨列表任务并显示来源列表。
- 侧边栏支持：
  - 选中列表
  - 新建列表
  - 编辑列表图标
  - 删除列表（`list_today` 受保护不可删）
  - 打开动作设置
- 侧边栏支持拖拽调宽（最小 240，最大 520）。

## 3.2 任务 CRUD

已实现：

- 创建任务
  - 标题必填
  - 详情可选
  - 可选择所属列表（在“所有任务”视图创建时）
  - 可绑定多个动作
- 编辑任务（弹窗）
  - 标题、日期、时间、提醒、重复规则
- 删除任务（确认框）
- 完成状态切换（checkbox）
- 已完成任务可单独查看。

后端校验：

- 标题为空直接拒绝。
- 保存/创建都通过事务写入，动作绑定与任务一致性有事务保障。

## 3.3 时间、提醒、重复（调度语义）

### A. 时间字段规则

已实现规则：

- `dueDate` 必须是 `YYYY-MM-DD` 才算有效。
- `time` 必须是 `HH:mm` 才算有效。
- 若没有日期，则时间与提醒会被清空（调度不变量）。
- 若有日期但没时间，则提醒会被清空。

### B. 默认时间推断（创建时）

已实现：

- 若用户未显式给时间：
  - 白天（6:00~20:00）：默认“当前时间向上取 5 分钟”
  - 夜间（>=20:00 或 <6:00）：默认“明天 09:00”
- 默认提醒是提前 10 分钟（仅在有日期+时间时）。

### C. 提醒

已实现：

- 仅支持 **相对提醒**（`relative` + `offsetMinutes`）。
- UI 提供快捷值 `0/1/2/5/10` 分钟与手动输入。
- 到点提醒通过 Tauri Notification 插件发送系统通知。

触发机制：

- 前端每 30 秒轮询一次任务。
- 到达提醒触发时间后，发送通知并在内存集合中标记，避免同一次运行期间重复提醒。

### D. 重复任务

已实现类型：

- 每天（daily）
- 每周（weekly，0-6）
- 每月（monthly，1-31）

核心机制：

- **不是定时自动生成下一条**，而是在“将当前任务标记为完成”时，由 Rust 计算下一次日期并复制生成下一条任务（含时间、提醒、动作绑定）。

## 3.4 动作系统（Action Schemes）

## 3.4.1 动作模板管理（Settings）

已实现：

- 创建、编辑、删除动作模板。
- 模板字段：
  - `name`
  - `icon`
  - `template`
  - `kind`（`url` / `script`）
  - `paramType`（`string` / `number`）
- URL 模板支持 `{param}` 占位符（可 0~N 个）。
- 脚本模板要求绝对路径（UI 校验 + 后端执行时校验）。
- 可拖拽文件到脚本区域、可调用文件选择器填路径。

## 3.4.2 任务绑定动作（ActionPickerModal）

已实现：

- 从模板库搜索并添加动作到任务（支持多动作共存）。
- 自动计算每个动作期望参数数：
  - URL：按 `{param}` 个数
  - Script：固定 1 个参数（脚本路径）
- 参数编辑与校验：
  - number 类型限制数字输入
  - script 必须是绝对路径
  - 缺参会阻止确认保存

## 3.4.3 动作执行

已实现：

- URL 类：
  - Tauri 环境用 `@tauri-apps/plugin-shell` 的 `open()`
  - 非 Tauri 环境回退 `window.location.href`
- Script 类：
  - 调用 Rust command `run_script`
  - 后端按后缀选择执行器：
    - `.sh` -> `zsh`
    - `.py` -> `python3`
    - `.js/.mjs/.cjs` -> `node`
    - 其他 -> 直接执行该路径

额外自动触发：

- 到达任务到期时间后，前端轮询会自动执行该任务绑定的 script 动作（同一运行会话用内存 key 去重）。

## 3.5 搜索、筛选、排序

已实现：

- 文本搜索：标题 + 详情（前端小写匹配）
- 时间筛选：
  - 全部
  - 今天
  - 逾期
  - 未来
- 排序规则（升序）：
  - 先有日期再无日期
  - 日期早的在前
  - 同日期先有时间再无时间
  - 时间早的在前

## 3.6 备份与恢复

已实现：

- 导出备份：完整快照写入 JSON
  - 包含 `version`、`exportedAt`、`snapshot`
- 导入备份：
  - 校验版本（当前支持 `version = 1`）
  - 导入会覆盖现有列表/任务/动作模板/任务动作绑定（事务方式重写）
- 设置页提供导入导出按钮，使用 Tauri Dialog 选择文件。

## 4. 数据持久化与后端能力

## 4.1 数据库

- SQLite（`rusqlite` + bundled）
- 数据库路径：Tauri `app_data_dir/linkflow.db`

表结构：

- `lists`
- `schemes`
- `tasks`
- `task_actions`

关系与约束：

- `tasks.list_id -> lists.id`（删除列表后置空）
- `task_actions.task_id -> tasks.id`（级联删除）
- `task_actions.scheme_id -> schemes.id`（级联删除）

## 4.2 暴露的 Tauri Commands

已实现并在前端调用：

- `get_app_snapshot`
- `export_backup`
- `import_backup`
- `create_list`
- `update_list`
- `delete_list`
- `create_scheme`
- `update_scheme`
- `delete_scheme`
- `create_task`
- `save_task`
- `toggle_task_completed`
- `delete_task`
- `run_script`

## 4.3 后端初始化行为

已实现：

- App 启动时自动建库建表。
- 首次启动自动 seed 默认列表 + 默认动作模板（包含会议、邮件、地图、微信等示例，以及“本地脚本”模板）。

## 5. 前端技术栈

核心：

- React 18
- TypeScript 5（strict 开启）
- Zustand 5（应用状态管理）
- Tailwind CSS 3 + PostCSS + Autoprefixer
- Lucide React（图标）
- Vite 5（开发/构建）

Tauri 前端插件依赖：

- `@tauri-apps/api`
- `@tauri-apps/plugin-shell`
- `@tauri-apps/plugin-dialog`
- `@tauri-apps/plugin-notification`

## 6. 桌面后端技术栈（Rust/Tauri）

- Tauri 2
- Rust 2021
- `rusqlite`（bundled SQLite）
- `serde` / `serde_json`
- `uuid`
- `chrono`
- Tauri plugins:
  - shell
  - dialog
  - notification

权限能力（capability）当前开放：

- `core:default`
- `shell:allow-open`
- `dialog:allow-open`
- `dialog:allow-save`
- `notification:default`

## 7. 架构与数据流（现状）

1. 前端启动后调用 `initFromBackend()` 读取快照。
2. Zustand 存放列表/任务/动作模板与草稿状态。
3. 用户操作触发 store action，store 调 backendApi -> `invoke(command)`。
4. Rust 命令写入 SQLite，返回实体给前端回填状态。
5. 前端常驻 30 秒轮询做提醒与脚本到点执行。

## 8. 已识别的边界与限制（按当前代码）

- 非 Tauri 环境不可用（Web 仅展示层）。
- 无账号体系、无云同步、无多人协作。
- 无自动后台常驻调度服务；提醒/自动脚本依赖应用正在运行。
- 提醒仅支持相对分钟，不支持绝对提醒时间点/多提醒规则。
- 重复任务仅在“勾选完成时”生成下一条，不是基于时钟自动滚动。
- 脚本执行依赖本地环境（zsh/python3/node 或可执行文件），无沙箱与权限细粒度控制。
- `shell.open` 放行了较宽泛 scheme 正则，安全策略较宽。
- `csp: null`（桌面场景下常见，但仍属于宽松策略）。
- 当前仓库未见自动化测试（单测/集成/E2E）与 lint 脚本定义。

## 9. 结论（简版）

当前 LinkFlow 已实现一个完整可用的 **本地优先桌面任务管理器**：

- 平台：以 Tauri 桌面端为核心
- 功能：任务/列表/提醒/重复/动作触发/备份恢复全链路闭环
- 技术：React + Zustand + Tailwind + Tauri + Rust + SQLite

若进入下一阶段，优先建议方向通常会是：稳定性测试、调度可靠性（后台化）、云同步与权限安全收敛。
