import { App, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { GetNoteSettingsTab } from './settings-tab';
import { SyncEngine } from './sync';
import { LoadingModal } from './ui/loading-modal';
import { SyncModal } from './ui/sync-modal';
import { showError, showSuccess } from './ui/notice';

export default class GetNoteSyncPlugin extends Plugin {
  settings!: Settings;

  async onload(): Promise<void> {
    // 加载设置
    const loaded = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...loaded };

    // 注册设置面板
    this.addSettingTab(new GetNoteSettingsTab(this.app, this));

    // 注册命令
    this.addCommand({
      id: 'sync-notes',
      name: '同步笔记',
      callback: () => this.startSync(),
    });

    // 注册 Ribbon 图标（使用文字图标，兼容所有平台）
    this.addRibbonIcon('book-lock', '同步 Get笔记', () => this.startSync());

    console.log('[Get笔记 Importer] 插件已加载');
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async startSync(): Promise<void> {
    // 验证配置
    if (!this.settings.apiToken || !this.settings.clientId) {
      showError('请先在设置中填写 API Token 和 Client ID');
      return;
    }

    const loading = new LoadingModal(this.app);
    loading.open();

    try {
      const engine = new SyncEngine(this.app, this.settings);

      const syncModal = new SyncModal(this.app);
      syncModal.open();
      loading.close();

      const result = await engine.sync(syncModal);
      syncModal.showResult(result);

      showSuccess(
        `同步完成：新增 ${result.created} · 更新 ${result.updated} · 跳过 ${result.skipped}${result.failed > 0 ? ` · 失败 ${result.failed}` : ''}`
      );
    } catch (err) {
      loading.close();
      const msg = err instanceof Error ? err.message : String(err);
      showError(`同步失败：${msg}`);
      console.error('[Get笔记 Importer] 同步错误:', err);
    }
  }
}
