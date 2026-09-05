import { CookieFormats } from '../utils/formats.js';

let currentCookies = [];
let activeTabUrl = '';

// Tab switching
document.querySelectorAll('.tab-buttons button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-buttons button').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    const targetId = btn.id.replace('-btn', '');
    document.getElementById(targetId)?.classList.add('active');
  });
});

async function init() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
      activeTabUrl = tab.url;
      const urlObj = new URL(tab.url);
      document.getElementById('current-domain-text').textContent = `Domain: ${urlObj.hostname}`;
      await loadCookies(urlObj.hostname);
    } else {
      document.getElementById('current-domain-text').textContent = 'Domain: (No active web page)';
      document.getElementById('cookie-list-container').innerHTML = '<div style="color: #64748b; text-align: center; margin-top: 20px;">Open a website to view and manage its cookies.</div>';
    }
  } catch (e) {
    document.getElementById('current-domain-text').textContent = 'Domain: (Unknown)';
  }

  // Load sync config
  chrome.storage.local.get(['hubUrl', 'vaultId', 'password', 'syncEnabled'], (res) => {
    if (res.hubUrl) document.getElementById('hub-url').value = res.hubUrl;
    if (res.vaultId) document.getElementById('vault-id').value = res.vaultId;
    if (res.password) document.getElementById('master-password').value = res.password;
    if (res.syncEnabled !== undefined) document.getElementById('sync-toggle').checked = res.syncEnabled;
  });

  // Attach Add Cookie Handler
  document.getElementById('add-cookie-btn')?.addEventListener('click', () => {
    if (!activeTabUrl) {
      alert('Please navigate to a valid web page first.');
      return;
    }
    const urlObj = new URL(activeTabUrl);
    const name = prompt('Enter Cookie Name:');
    if (!name || !name.trim()) return;
    const value = prompt(`Enter Cookie Value for "${name}":`, '');
    if (value === null) return;

    updateCookie({
      name: name.trim(),
      value: value.trim(),
      domain: urlObj.hostname,
      path: '/',
      secure: urlObj.protocol === 'https:',
      httpOnly: false,
      sameSite: 'Lax',
    });
  });
}

async function loadCookies(domain) {
  try {
    currentCookies = await chrome.cookies.getAll({ domain });
    renderCookieList(currentCookies);
  } catch (err) {
    console.error('Failed to load cookies', err);
  }
}

function renderCookieList(cookies) {
  const container = document.getElementById('cookie-list-container');
  container.innerHTML = '';

  if (cookies.length === 0) {
    container.innerHTML = '<div style="color: #64748b; text-align: center; margin-top: 20px;">No cookies found for this domain.</div>';
    return;
  }

  cookies.forEach(c => {
    const card = document.createElement('div');
    card.className = 'cookie-card';
    card.innerHTML = `
      <div class="cookie-header">
        <span class="cookie-name">${escapeHtml(c.name)}</span>
        <div class="cookie-badges">
          ${c.httpOnly ? '<span>HttpOnly</span>' : ''}
          ${c.secure ? '<span>Secure</span>' : ''}
          <span>${c.sameSite || 'Lax'}</span>
        </div>
      </div>
      <div class="cookie-value">${escapeHtml(c.value)}</div>
      <div class="cookie-actions">
        <button class="btn btn-secondary btn-sm edit-btn" data-name="${escapeHtml(c.name)}">Edit</button>
        <button class="btn btn-danger btn-sm del-btn" data-name="${escapeHtml(c.name)}">Delete</button>
      </div>
    `;

    card.querySelector('.del-btn').addEventListener('click', async () => {
      await deleteCookie(c);
      if (activeTabUrl) {
        await loadCookies(new URL(activeTabUrl).hostname);
      }
    });

    card.querySelector('.edit-btn').addEventListener('click', async () => {
      const newVal = prompt(`Edit value for ${c.name}:`, c.value);
      if (newVal !== null) {
        c.value = newVal;
        await updateCookie(c);
      }
    });

    container.appendChild(card);
  });
}

async function updateCookie(c) {
  const protocol = c.secure ? 'https://' : 'http://';
  const rawDomain = c.domain || (activeTabUrl ? new URL(activeTabUrl).hostname : 'localhost');
  const cleanDomain = rawDomain.startsWith('.') ? rawDomain.substring(1) : rawDomain;
  const safePath = (c.path && c.path.startsWith('/')) ? c.path : '/' + (c.path || '');

  let sameSite = undefined;
  if (c.sameSite) {
    const s = String(c.sameSite).toLowerCase();
    if (s === 'none' || s === 'no_restriction') {
      sameSite = 'no_restriction';
    } else if (s === 'strict') {
      sameSite = 'strict';
    } else if (s === 'lax') {
      sameSite = 'lax';
    } else {
      sameSite = 'unspecified';
    }
  }

  let isSecure = !!c.secure;
  if (sameSite === 'no_restriction') {
    isSecure = true;
  }

  const url = `${isSecure ? 'https://' : 'http://'}${cleanDomain}${safePath}`;
  
  const setDetails = {
    url,
    name: c.name,
    value: c.value || '',
    path: safePath,
    secure: isSecure,
    httpOnly: !!c.httpOnly,
  };

  if (sameSite) {
    setDetails.sameSite = sameSite;
  }

  if (c.expirationDate && Number(c.expirationDate) > 0 && !isNaN(Number(c.expirationDate))) {
    setDetails.expirationDate = Number(c.expirationDate);
  }

  if (rawDomain.startsWith('.')) {
    setDetails.domain = rawDomain;
  }
  if (c.storeId) {
    setDetails.storeId = c.storeId;
  }

  try {
    await chrome.cookies.set(setDetails);
  } catch (err) {
    console.error('Failed to set cookie:', err);
  }

  if (activeTabUrl) {
    await loadCookies(new URL(activeTabUrl).hostname);
  }
}

async function deleteCookie(c) {
  const protocol = c.secure ? 'https://' : 'http://';
  const rawDomain = c.domain || (activeTabUrl ? new URL(activeTabUrl).hostname : 'localhost');
  const cleanDomain = rawDomain.startsWith('.') ? rawDomain.substring(1) : rawDomain;
  const safePath = (c.path && c.path.startsWith('/')) ? c.path : '/' + (c.path || '');
  const url = `${protocol}${cleanDomain}${safePath}`;
  const details = { url, name: c.name };
  if (c.storeId) details.storeId = c.storeId;
  try {
    await chrome.cookies.remove(details);
  } catch (err) {
    console.error('Failed to remove cookie:', err);
  }
}

// Search / Filter
document.getElementById('search-input').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const filtered = currentCookies.filter(c => c.name.toLowerCase().includes(query) || c.value.toLowerCase().includes(query));
  renderCookieList(filtered);
});

// Refresh
document.getElementById('refresh-btn').addEventListener('click', async () => {
  if (activeTabUrl) await loadCookies(new URL(activeTabUrl).hostname);
});

// Save Sync Settings
document.getElementById('save-sync-btn').addEventListener('click', () => {
  const hubUrl = document.getElementById('hub-url').value;
  const vaultId = document.getElementById('vault-id').value;
  const password = document.getElementById('master-password').value;
  const syncEnabled = document.getElementById('sync-toggle').checked;

  chrome.runtime.sendMessage({
    action: 'UPDATE_CONFIG',
    config: { hubUrl, vaultId, password, syncEnabled }
  }, (res) => {
    const status = document.getElementById('sync-status');
    status.style.color = '#4ade80';
    status.textContent = 'Configuration saved and WebSocket initialized!';
  });
});

// Manual Sync
document.getElementById('manual-sync-btn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'TRIGGER_SYNC' }, () => {
    const status = document.getElementById('sync-status');
    status.style.color = '#38bdf8';
    status.textContent = 'Sync pushed to Hub!';
  });
});

// Export Formats
document.getElementById('exp-json').addEventListener('click', () => {
  document.getElementById('export-textarea').value = CookieFormats.toJSON(currentCookies);
});

document.getElementById('exp-netscape').addEventListener('click', () => {
  document.getElementById('export-textarea').value = CookieFormats.toNetscape(currentCookies);
});

document.getElementById('exp-header').addEventListener('click', () => {
  document.getElementById('export-textarea').value = CookieFormats.toHeader(currentCookies);
});

document.getElementById('exp-playwright')?.addEventListener('click', () => {
  document.getElementById('export-textarea').value = CookieFormats.toPlaywright(currentCookies);
});

document.getElementById('exp-curl')?.addEventListener('click', () => {
  document.getElementById('export-textarea').value = CookieFormats.toCurl(currentCookies, activeTabUrl || 'https://example.com');
});

// Copy Export
document.getElementById('copy-export-btn').addEventListener('click', () => {
  const txt = document.getElementById('export-textarea');
  txt.select();
  navigator.clipboard.writeText(txt.value);
  alert('Copied to clipboard!');
});

// Import Action
document.getElementById('import-btn').addEventListener('click', async () => {
  const raw = document.getElementById('export-textarea').value.trim();
  if (!raw) return alert('Paste cookie data to import');

  const defaultDomain = activeTabUrl ? new URL(activeTabUrl).hostname : 'localhost';
  try {
    const imported = CookieFormats.parseAny(raw, defaultDomain);
    if (!imported || imported.length === 0) {
      return alert('No valid cookies found in provided text.');
    }

    for (const c of imported) {
      await updateCookie(c);
    }
    alert(`Successfully imported ${imported.length} cookies!`);
    if (activeTabUrl) await loadCookies(new URL(activeTabUrl).hostname);
  } catch (err) {
    alert('Import failed: ' + err.message);
  }
});

function escapeHtml(str) {
  return (str || '').replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

document.addEventListener('DOMContentLoaded', init);
