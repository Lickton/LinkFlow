import type { List, Task, UrlScheme } from '../types/models';

export const mockLists: List[] = [
  { id: 'list_today', name: '所有任务', icon: '📋' },
  { id: 'list_work', name: '工作', icon: '💼' },
  { id: 'list_life', name: '生活', icon: '🏡' },
];

export const mockSchemes: UrlScheme[] = [
  {
    id: 'scheme_wemeet',
    name: '腾讯会议',
    icon: '📹',
    template: 'wemeet://inmeeting?code={param}',
    paramType: 'number',
  },
  {
    id: 'scheme_mail',
    name: '邮件',
    icon: '✉️',
    template: 'mailto:{param}?subject={param}',
    paramType: 'string',
  },
  {
    id: 'scheme_maps',
    name: '高德地图',
    icon: '🗺️',
    template: 'iosamap://path?sourceApplication=linkflow&dname={param}',
    paramType: 'string',
  },
  {
    id: 'scheme_script_local',
    name: '本地脚本',
    icon: '📜',
    template: '/absolute/path/to/your-script.sh',
    kind: 'script',
    paramType: 'string',
  },
];

export const mockTasks: Task[] = [
  {
    id: 'task_1',
    listId: 'list_today',
    title: '参加产品例会',
    completed: false,
    time: '10:30',
    actions: [{ schemeId: 'scheme_wemeet', params: ['123456789'] }],
  },
  {
    id: 'task_2',
    listId: 'list_work',
    title: '给客户发送周报',
    completed: false,
    date: '2026-02-20',
    actions: [{ schemeId: 'scheme_mail', params: ['team@example.com', 'LinkFlow 周报'] }],
  },
  {
    id: 'task_3',
    listId: 'list_life',
    title: '导航去健身房',
    completed: true,
    actions: [{ schemeId: 'scheme_maps', params: ['静安体育中心'] }],
  },
];
