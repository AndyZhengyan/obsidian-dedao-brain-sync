import { App, debounce, PluginSettingTab } from 'obsidian';
import ReactDOM from 'react-dom';
import { useLayoutEffect, useState } from 'preact/hooks';
import { SettingsComponent } from './settings/index';
import type { Settings } from './types';
import type GetNoteSyncPlugin from './main';
import { confirmDatePathMigration } from './ui/date-path-confirm-modal';
import type {
  DatePathMigrationResult,
  DatePathMigrationTarget,
} from './date-path-migration';
import type { DatePathConfirmationRequest } from './ui/date-path-confirm-modal';

class SettingsRuntimeUpdates {
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function MountedSettings({
  app,
  plugin,
  updateSetting,
  runtimeUpdates,
  applyDatePathSettings,
  confirmDatePathMigration: confirmDatePathMigrationProp,
}: {
  app: App;
  plugin: GetNoteSyncPlugin;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  runtimeUpdates: SettingsRuntimeUpdates;
  applyDatePathSettings?: (target: DatePathMigrationTarget) => Promise<DatePathMigrationResult>;
  confirmDatePathMigration?: (request: DatePathConfirmationRequest) => Promise<boolean>;
}) {
  const [, setRevision] = useState(0);
  useLayoutEffect(
    () => runtimeUpdates.subscribe(() => setRevision(revision => revision + 1)),
    [runtimeUpdates],
  );

  return (
    <SettingsComponent
      settings={plugin.settings}
      updateSetting={updateSetting}
      startSync={() => plugin.openManualSyncModal()}
      isSyncing={plugin.isSyncing}
      syncProgress={plugin.syncProgress}
      openNotePicker={() => plugin.openNotePicker()}
      startSubscribedKnowledgeSync={() => plugin.syncSubscribedKnowledge()}
      openLocalUpload={() => plugin.openLocalUploadModal()}
      startAutoSync={() => plugin.startAutoSync()}
      stopAutoSync={() => plugin.stopAutoSync()}
      cancelSync={() => plugin.cancelSync()}
      app={app}
      lastSyncTime={plugin.lastSyncResult?.timestamp}
      syncHistory={plugin.syncHistory}
      applyDatePathSettings={applyDatePathSettings}
      confirmDatePathMigration={confirmDatePathMigrationProp}
    />
  );
}

export class GetNoteSettingsTab extends PluginSettingTab {
  private plugin: GetNoteSyncPlugin;
  private mounted = false;
  private readonly runtimeUpdates = new SettingsRuntimeUpdates();

  constructor(app: App, plugin: GetNoteSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.debouncedSave = debounce(
      () => this.plugin.saveSettings(),
      150,
      true
    );
  }

  display(): void {
    if (this.mounted) return;
    this.mounted = true;
    ReactDOM.render(
      <MountedSettings
        app={this.app}
        plugin={this.plugin}
        updateSetting={this.updateSetting}
        runtimeUpdates={this.runtimeUpdates}
        applyDatePathSettings={(target) => this.plugin.applyDatePathSettings(target)}
        confirmDatePathMigration={(request) => confirmDatePathMigration(this.app, request)}
      />,
      this.containerEl
    );
  }

  updateRuntimeState(): void {
    if (!this.mounted) return;
    this.runtimeUpdates.emit();
  }

  hide(): void {
    ReactDOM.unmountComponentAtNode(this.containerEl);
    this.mounted = false;
  }

  private debouncedSave: () => void;

  updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]): void => {
    this.plugin.settings[key] = value;
    if (key === 'ribbonActions') this.plugin.refreshRibbonActions();
    this.debouncedSave();
  };
}
