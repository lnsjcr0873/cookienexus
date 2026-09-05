import { E2EECrypto } from '../crypto/e2ee.js';

let ws = null;
let currentConfig = {
  hubUrl: 'ws://localhost:8765/ws/sync',
  vaultId: 'default_vault',
  password: '',
  syncEnabled: false,
  deviceId: 'ext_' + Math.random().toString(36).substring(2, 9),
};

// Load saved config
chrome.storage.local.get(['hubUrl', 'vaultId', 'password', 'syncEnabled', 'deviceId'], (res) => {
  currentConfig = { ...currentConfig, ...res };
  if (!res.deviceId) {
    chrome.storage.local.set({ deviceId: currentConfig.deviceId });
  }
  if (currentConfig.syncEnabled && currentConfig.password) {
    initWebSocket();
  }
});

function initWebSocket() {
  if (ws) {
    try { ws.close(); } catch(e) {}
  }

  try {
    ws = new WebSocket(currentConfig.hubUrl);
    
    ws.onopen = () => {
      console.log('[CookieNexus Ext] WS Connected');
      ws.send(JSON.stringify({
        type: 'CLIENT_HELLO',
        deviceId: currentConfig.deviceId,
        vaultId: currentConfig.vaultId,
      }));
    };

    ws.onmessage = async (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SYNC_BROADCAST' && msg.envelope) {
          await handleIncomingVault(msg.envelope);
        } else if (msg.type === 'PROBE_ALERT') {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'src/icons/icon48.png',
            title: 'CookieNexus: Session Alert',
            message: `Domain ${msg.alert.domain} is ${msg.alert.status}: ${msg.alert.reason}`,
          });
        }
      } catch (err) {
        console.error('[CookieNexus Ext] Error parsing message', err);
      }
    };

    ws.onclose = () => {
      console.log('[CookieNexus Ext] WS Disconnected. Reconnecting in 5s...');
      if (currentConfig.syncEnabled) {
        setTimeout(initWebSocket, 5000);
      }
    };
  } catch (err) {
    console.error('[CookieNexus Ext] Failed to establish WS', err);
  }
}

let isSyncingIncoming = false;

async function handleIncomingVault(envelope) {
  if (!currentConfig.password) return;
  isSyncingIncoming = true;
  try {
    const decryptedJson = await E2EECrypto.decrypt(envelope, currentConfig.password);
    const cookies = JSON.parse(decryptedJson);
    for (const c of cookies) {
      if (!c.isDeleted) {
        try {
          const cleanDomain = c.domain ? c.domain.replace(/^\./, '') : 'localhost';
          const url = (c.secure ? 'https://' : 'http://') + cleanDomain + (c.path || '/');
          const setDetails = {
            url,
            name: c.name,
            value: c.value,
            path: c.path || '/',
            secure: !!c.secure,
            httpOnly: !!c.httpOnly,
            expirationDate: c.expirationDate,
          };
          if (c.domain && c.domain.startsWith('.')) {
            setDetails.domain = c.domain;
          }
          await chrome.cookies.set(setDetails);
        } catch (setErr) {
          console.warn('[CookieNexus Ext] Skipping invalid cookie:', c.name, setErr);
        }
      }
    }
  } catch (err) {
    console.error('[CookieNexus Ext] Decryption of incoming vault failed:', err);
  } finally {
    setTimeout(() => {
      isSyncingIncoming = false;
    }, 500);
  }
}

// Listen to cookie changes in real-time
chrome.cookies.onChanged.addListener(async (changeInfo) => {
  if (isSyncingIncoming) {
    return; // Prevent echo/loop when applying remote changes
  }

  if (!currentConfig.syncEnabled || !currentConfig.password || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  // Throttle sync
  scheduleFullSync();
});

let syncTimer = null;
function scheduleFullSync() {
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const allCookies = await chrome.cookies.getAll({});
      const encrypted = await E2EECrypto.encrypt(JSON.stringify(allCookies), currentConfig.password);
      const envelope = {
        vaultId: currentConfig.vaultId,
        deviceId: currentConfig.deviceId,
        algorithm: 'AES-256-GCM',
        kdf: 'PBKDF2-SHA256',
        ...encrypted,
        updatedAt: Date.now(),
        vectorClock: { [currentConfig.deviceId]: Date.now() },
      };

      ws.send(JSON.stringify({
        type: 'SYNC_PUSH',
        envelope,
      }));
    } catch (e) {
      console.error('[CookieNexus Ext] Error syncing cookies', e);
    }
  }, 1000);
}

// Handle messages from popup UI
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'UPDATE_CONFIG') {
    currentConfig = { ...currentConfig, ...req.config };
    chrome.storage.local.set(currentConfig);
    if (currentConfig.syncEnabled && currentConfig.password) {
      initWebSocket();
    }
    sendResponse({ success: true });
  } else if (req.action === 'TRIGGER_SYNC') {
    scheduleFullSync();
    sendResponse({ success: true });
  }
  return true;
});
