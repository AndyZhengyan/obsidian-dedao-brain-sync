import { WebSocket } from 'ws';

const TARGET = '513EA2DE0CCFAE190314BA9BA1240E41';
const WS_URL = `ws://localhost:9222/devtools/page/${TARGET}`;
const WAIT = (ms) => new Promise(r => setTimeout(r, ms));

let id = 0;
const pending = {};

function cmd(method, params = {}) {
  return JSON.stringify({ id: ++id, method, params });
}

function result(msg) {
  const rid = msg.id;
  if (pending[rid]) {
    pending[rid](msg);
    delete pending[rid];
  }
}

const ws = new WebSocket(WS_URL);

ws.on('open', async () => {
  console.log('✅ Connected to Obsidian CDP');
  
  // 1. Check plugin is loaded
  ws.send(cmd('Runtime.evaluate', {
    expression: `(function() {
      const app = window.app;
      if (!app) return {ok: false, reason: 'window.app not found'};
      const plugin = app.plugins.getPlugin('obsidian-getnote-importer');
      if (!plugin) return {ok: false, reason: 'plugin not loaded', loaded: Object.keys(app.plugins.plugins)};
      return {ok: true, version: plugin.manifest.version, settings: plugin.settings};
    })()`
  }));

  await WAIT(800);
});

ws.on('message', async (data) => {
  const msg = JSON.parse(data.toString());
  result(msg);
  
  if (msg.id === 1) {
    // Plugin check result
    const r = msg.result?.result?.value;
    if (typeof r === 'string') {
      try {
        const info = JSON.parse(r);
        if (info.ok) {
          console.log('✅ Plugin loaded: v' + info.version);
          console.log('   Settings:', JSON.stringify(info.settings).slice(0, 100));
          
          // 2. Open settings tab via keyboard shortcut (Ctrl+,)
          console.log('⏳ Opening settings (Ctrl+,)...');
          ws.send(cmd('Input.dispatchKeyEvent', {
            type: 'keyDown',
            modifiers: 2, // Ctrl
            key: 'Comma',
            code: 'ControlLeft'
          }));
          ws.send(cmd('Input.dispatchKeyEvent', {
            type: 'char',
            modifiers: 2,
            key: ',',
            code: 'ControlLeft'
          }));
          ws.send(cmd('Input.dispatchKeyEvent', {
            type: 'keyUp',
            modifiers: 2,
            key: 'Comma',
            code: 'ControlLeft'
          }));
          await WAIT(2000);
          
          // 3. Check settings tab opened
          ws.send(cmd('Runtime.evaluate', {
            expression: `document.querySelector('.getnote-settings-react') ? 'SETTINGS_OPEN' : document.querySelector('.mod-settings') ? 'SETTINGS_GENERAL' : 'NOT_FOUND'`
          }));
        } else {
          console.log('❌ Plugin NOT loaded:', info.reason);
          if (info.loaded) console.log('   Loaded plugins:', info.loaded.join(', '));
        }
      } catch(e) {
        console.log('❌ Parse error:', r, e.message);
      }
    }
  }
  
  if (msg.id === 3) {
    // Settings check
    const r = msg.result?.result?.value;
    console.log('   Settings page:', r);
    
    // 4. Try to trigger sync via command
    console.log('⏳ Triggering sync command...');
    ws.send(cmd('Runtime.evaluate', {
      expression: `(function() {
        const app = window.app;
        const plugin = app.plugins.getPlugin('obsidian-getnote-importer');
        if (plugin) {
          plugin.startSync();
          return 'SYNC_STARTED';
        }
        return 'PLUGIN_NOT_FOUND';
      })()`
    }));
    await WAIT(5000);
  }
  
  if (msg.id === 4) {
    const r = msg.result?.result?.value;
    console.log('   Sync result:', r);
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (e) => { console.error('❌ WS error:', e.message); });

setTimeout(() => {
  console.log('⏰ Timeout, closing');
  ws.close();
  process.exit(0);
}, 15000);
