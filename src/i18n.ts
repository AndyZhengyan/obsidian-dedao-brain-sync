const translations: Record<string, Record<string, string>> = {
  zh: {
    // === Settings ===
    'settings.title': 'Get笔记导入',
    'settings.desc': '🔄 Get笔记 → Obsidian，一键迁移无负担',
    'settings.community': '欢迎交流',
    'settings.apiToken.label': 'API Token',
    'settings.apiToken.desc': 'Get笔记开放平台的 Authorization Token（gk_live_xxx）',
    'settings.apiToken.placeholder': 'gk_live_xxx',
    'settings.clientId.label': 'Client ID',
    'settings.clientId.desc': 'Get笔记开放平台的 Client ID（cli_xxx）',
    'settings.clientId.placeholder': 'cli_xxx',
    'settings.folder.label': '目标文件夹',
    'settings.folder.desc': '笔记同步到 vault 内的子目录名（默认：Get笔记）',
    'settings.folder.placeholder': 'Get笔记',
    'settings.maxDays.label': '最大同步天数',
    'settings.maxDays.desc': '只同步最近 N 天内更新的笔记（0 = 不限制）',
    'settings.maxDays.placeholder': '30',
    'settings.prefix.label': '文件名前缀（时间戳）',
    'settings.prefix.desc': '格式如 YYYY-MM-DD 或 YYYYMMDD_HHmm，留空则不加前缀',
    'settings.prefix.placeholder': '如 YYYY-MM-DD 或 YYYYMMDD_HHmm，留空不加前缀',
    'settings.scheduled.label': '自动同步',
    'settings.scheduled.desc': '开启后自动定时同步笔记',
    'settings.scheduled.enabled': '启用定时同步',
    'settings.scheduled.interval': '同步间隔（分钟）',
    'settings.scheduled.onStart': '启动时同步',
    'settings.sync.label': '全量初始化',
    'settings.sync.desc': '同步最大同步天数内全部 Get笔记笔记到 vault',
    'settings.syncPicker.label': '手动导入',
    'settings.syncPicker.desc': '先选择笔记，再同步',
    'settings.syncPicker.button': '手动导入',
    'settings.testConnection': '测试连接',
    'settings.testingConnection': '测试中...',
    'settings.connectionSuccess': '连接成功',
    'settings.connectionError': '连接失败',
    'settings.maxDays.hint': '0 = 不限制',
    'settings.interval.hint': '最小 5 分钟',
    'settings.prefix.hint': '例：YYYY-MM-DD 或 YYYYMMDD_HHmm',
    'settings.lastSync': '上次同步',
    'settings.lastSync.never': '暂未同步',
    'settings.lastSync.result': '{time} · 新增 {created} 更新 {updated}',
    'settings.onboarding': '👋 欢迎使用！请先选择认证方式获取凭证，然后点击同步。',

    // === Sync Button ===
    'sync.syncing': '同步中...',
    'sync.noCredentials': '请先填写 API Token 和 Client ID',
    'sync.start': '立即同步',

    // === OAuth ===
    'oauth.label': 'OAuth 认证',
    'oauth.desc': '使用 Get笔记 账号授权，自动获取 API Token 和 Client ID',
    'settings.authManual': '手动输入',
    'oauth.start': '授权登录',
    'oauth.link': '打开验证页面',
    'oauth.linkHint': '请在浏览器中打开此链接，输入验证码',
    'oauth.code': '验证码',
    'oauth.pollWaiting': '等待授权...（请在 Get笔记 App 中确认）',
    'oauth.pollHint': '授权完成后自动获取凭证',
    'oauth.success': '授权成功！',
    'oauth.error': '授权失败',
    'oauth.cancelled': '已取消',
    'oauth.copyCode': '复制验证码',
    'oauth.openBrowser': '打开验证页面',

    // === Note Picker ===
    'picker.title': '选择要同步的笔记',
    'picker.selectAll': '全选',
    'picker.selectNone': '全不选',
    'picker.loading': '正在获取笔记列表...',
    'picker.error': '加载失败',
    'picker.retry': '重试',
    'picker.empty': '暂无笔记',
    'picker.selected': '已选 {count} 条',
    'picker.cancel': '取消',
    'picker.confirm': '同步',
    'picker.yesterday': '昨天',
    'picker.daysAgo': '天前',
    'picker.loadMore': '加载更多 (共 {count} 条)',
    'picker.loadingMore': '加载更多...',
    'picker.search': '搜索笔记...',
    'picker.noTitle': '(无标题)',
    'picker.noMatch': '没有匹配的笔记',
    'picker.type.plain_text': '纯文本',
    'picker.type.link': '链接笔记',
    'picker.type.recorder_audio': '录音长录',
    'picker.type.recorder_flash_audio': '录音长录',
    'picker.type.immediate_audio': '即时录音',
    'picker.type.audio_long': '录音长录',
    'picker.type.local_audio': '本地音频',
    'picker.type.unknown': '其他',

    // === Sync Modal ===
    'modal.title': 'Get笔记 同步中',
    'modal.connecting': '正在连接 API...',
    'modal.done': '同步完成',
    'modal.created': '新增 {created}',
    'modal.updated': '更新 {updated}',
    'modal.skipped': '跳过 {skipped}',
    'modal.failed': '失败 {failed}',
    'modal.total': '共处理 {total} 条笔记',
    'modal.cancel': '取消同步',
    'modal.cancelled': '已取消',
    'modal.countProgress': '处理中 {processed} 条...',

    // === Loading Modal ===
    'loading': '正在获取笔记列表...',

    // === Sync Engine ===
    'sync.fetching': '正在获取笔记... 第 {page} 页',
    'sync.fetched': '已获取 {count} 条笔记',
    'sync.processing': '处理中：新增 {created} · 更新 {updated} · 跳过 {skipped} · 失败 {failed}',
    'sync.processingCount': '处理中... {current}/{total}',

    // === Notices ===
    'sync.started': 'Get笔记同步开始...',
    'sync.autoComplete': '自动同步完成：新增 {created} 更新 {updated}',
    'sync.autoFailRepeated': '自动同步连续失败 {count} 次，请检查设置',
    'notice.autoSynced': '[GetNote] 自动同步：新增 {created}，更新 {updated}',
    'notice.autoSyncFailed': '[GetNote] 自动同步失败',
    'notice.fillCredentials': '请先在设置中填写 API Token 和 Client ID',
    'notice.syncComplete': '同步完成：新增 {created} · 更新 {updated} · 跳过 {skipped}{failed}',
    'notice.syncFailed': '同步失败：{msg}',

    // === API Errors ===
    'error.invalidCredentials': 'API Token 或 Client ID 无效，请检查设置',
    'error.apiFailed': 'API 错误 {status}: {msg}',
    'error.oauthDeviceCodeFailed': 'OAuth 设备码请求失败 {status}: {msg}',
    'error.oauthTokenInvalid': 'OAuth 返回凭证格式无效',
    'error.oauthExpired': 'OAuth 授权已过期，请重试',
    'error.oauthTimeout': 'OAuth 授权超时，请重试',
    'error.oauthUnknown': 'OAuth 授权未知错误 {status}',
    'error.oauthCancelled': 'OAuth 授权已取消',

    // === Console (English only) ===
    'console.loaded': '[GetNote Importer] 插件已加载',
    'console.syncError': '[GetNote Importer] 同步错误:',

    // === Command / Ribbon ===
    'command.sync': '同步笔记',
    'ribbon.tooltip': '同步 Get笔记',
  },

  en: {
    // === Settings ===
    'settings.title': 'Get笔记导入',
    'settings.desc': '🔄 Get笔记 → Obsidian，one-click migration',
    'settings.community': 'Welcome to discuss',
    'settings.apiToken.label': 'API Token',
    'settings.apiToken.desc': 'Get笔记 Open Platform Authorization Token (gk_live_xxx)',
    'settings.apiToken.placeholder': 'gk_live_xxx',
    'settings.clientId.label': 'Client ID',
    'settings.clientId.desc': 'Get笔记 Open Platform Client ID (cli_xxx)',
    'settings.clientId.placeholder': 'cli_xxx',
    'settings.folder.label': 'Target Folder',
    'settings.folder.desc': 'Subfolder in vault to sync notes to (default: Get笔记)',
    'settings.folder.placeholder': 'Get笔记',
    'settings.maxDays.label': 'Max Sync Days',
    'settings.maxDays.desc': 'Only sync notes updated within the last N days (0 = no limit)',
    'settings.maxDays.placeholder': '30',
    'settings.prefix.label': 'Filename Prefix (Timestamp)',
    'settings.prefix.desc': 'Format like YYYY-MM-DD or YYYYMMDD_HHmm, leave empty to disable',
    'settings.prefix.placeholder': 'e.g. YYYY-MM-DD or YYYYMMDD_HHmm',
    'settings.scheduled.label': 'Scheduled Sync',
    'settings.scheduled.desc': 'Automatically sync notes at regular intervals',
    'settings.scheduled.enabled': 'Enable scheduled sync',
    'settings.scheduled.interval': 'Sync interval (minutes)',
    'settings.scheduled.onStart': 'Sync on startup',
    'settings.sync.label': 'Full Sync',
    'settings.sync.desc': 'Sync all Get笔记 notes within max sync days to vault',
    'settings.syncPicker.label': 'Selective Sync',
    'settings.syncPicker.desc': 'Select notes first, then sync',
    'settings.syncPicker.button': 'Selective Sync',
    'settings.testConnection': 'Test Connection',
    'settings.testingConnection': 'Testing...',
    'settings.connectionSuccess': 'Connection successful',
    'settings.connectionError': 'Connection failed',
    'settings.maxDays.hint': '0 = no limit',
    'settings.interval.hint': 'min 5 minutes',
    'settings.prefix.hint': 'e.g. YYYY-MM-DD or YYYYMMDD_HHmm',
    'settings.lastSync': 'Last sync',
    'settings.lastSync.never': 'Never synced',
    'settings.lastSync.result': '{time} · Created {created} Updated {updated}',
    'settings.onboarding': '👋 Welcome! Please choose an auth method to get credentials, then click sync.',

    // === Sync Button ===
    'sync.syncing': 'Syncing...',
    'sync.noCredentials': 'Please fill in API Token and Client ID first',
    'sync.start': 'Sync Now',

    // === OAuth ===
    'oauth.label': 'OAuth Authentication',
    'oauth.desc': 'Authorize with your Get笔记 account to auto-fetch API Token and Client ID',
    'settings.authManual': 'Manual Input',
    'oauth.start': 'Authorize Login',
    'oauth.link': 'Open verification page',
    'oauth.linkHint': 'Open this link in browser and enter the verification code',
    'oauth.code': 'Verification Code',
    'oauth.pollWaiting': 'Waiting for authorization... (please confirm in Get笔记 App)',
    'oauth.pollHint': 'Will auto-fetch credentials after authorization',
    'oauth.success': 'Authorization successful!',
    'oauth.error': 'Authorization failed',
    'oauth.cancelled': 'Cancelled',
    'oauth.copyCode': 'Copy Code',
    'oauth.openBrowser': 'Open Verification Page',

    // === Note Picker ===
    'picker.title': 'Select notes to sync',
    'picker.selectAll': 'Select All',
    'picker.selectNone': 'Select None',
    'picker.loading': 'Fetching notes...',
    'picker.error': 'Failed to load',
    'picker.retry': 'Retry',
    'picker.empty': 'No notes found',
    'picker.selected': '{count} selected',
    'picker.cancel': 'Cancel',
    'picker.confirm': 'Sync',
    'picker.yesterday': 'Yesterday',
    'picker.daysAgo': 'days ago',
    'picker.loadMore': 'Load more ({count} total)',
    'picker.loadingMore': 'Loading more...',
    'picker.search': 'Search notes...',
    'picker.noTitle': '(No title)',
    'picker.noMatch': 'No matching notes',
    'picker.type.plain_text': 'Plain Text',
    'picker.type.link': 'Link Note',
    'picker.type.recorder_audio': 'Long Recording',
    'picker.type.recorder_flash_audio': 'Long Recording',
    'picker.type.immediate_audio': 'Instant Recording',
    'picker.type.audio_long': 'Long Recording',
    'picker.type.local_audio': 'Local Audio',
    'picker.type.unknown': 'Other',

    // === Sync Modal ===
    'modal.title': 'Get笔记 Syncing',
    'modal.connecting': 'Connecting to API...',
    'modal.done': 'Sync Complete',
    'modal.created': 'Created {created}',
    'modal.updated': 'Updated {updated}',
    'modal.skipped': 'Skipped {skipped}',
    'modal.failed': 'Failed {failed}',
    'modal.total': 'Processed {total} notes',
    'modal.cancel': 'Cancel Sync',
    'modal.cancelled': 'Cancelled',
    'modal.countProgress': 'Processing {processed} notes...',

    // === Loading Modal ===
    'loading': 'Fetching notes list...',

    // === Sync Engine ===
    'sync.fetching': 'Fetching notes... Page {page}',
    'sync.fetched': 'Retrieved {count} notes',
    'sync.processing': 'Processing: Created {created} · Updated {updated} · Skipped {skipped} · Failed {failed}',
    'sync.processingCount': 'Processing... {current}/{total}',

    // === Notices ===
    'sync.started': 'GetNote sync started...',
    'sync.autoComplete': 'Auto sync complete: {created} created {updated} updated',
    'sync.autoFailRepeated': 'Auto sync failed {count} times, please check settings',
    'notice.autoSynced': '[GetNote] Auto sync: {created} created, {updated} updated',
    'notice.autoSyncFailed': '[GetNote] Auto sync failed',
    'notice.fillCredentials': 'Please fill in API Token and Client ID in settings',
    'notice.syncComplete': 'Sync complete: {created} created · {updated} updated · {skipped} skipped{failed}',
    'notice.syncFailed': 'Sync failed: {msg}',

    // === API Errors ===
    'error.invalidCredentials': 'Invalid API Token or Client ID, please check settings',
    'error.apiFailed': 'API error {status}: {msg}',
    'error.oauthDeviceCodeFailed': 'OAuth device code request failed {status}: {msg}',
    'error.oauthTokenInvalid': 'OAuth returned invalid credentials format',
    'error.oauthExpired': 'OAuth authorization expired, please retry',
    'error.oauthTimeout': 'OAuth authorization timed out, please retry',
    'error.oauthUnknown': 'OAuth unknown error {status}',
    'error.oauthCancelled': 'OAuth authorization cancelled',

    // === Console (English only) ===
    'console.loaded': '[GetNote Importer] Plugin loaded',
    'console.syncError': '[GetNote Importer] Sync error:',
  },
};

let currentLocale = 'zh';

export function initI18n(locale: string): void {
  currentLocale = locale.startsWith('zh') ? 'zh' : 'en';
}

export function t(key: string, vars?: Record<string, string | number>): string {
  let text = translations[currentLocale]?.[key] ?? translations['zh']?.[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.replace(`{${k}}`, String(v));
    }
  }
  return text;
}
