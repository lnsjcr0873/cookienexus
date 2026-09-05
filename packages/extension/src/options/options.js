let rules = [
  { domain: '*.internal.net', cookieName: 'session_token', sameSite: 'None', secure: true },
  { domain: 'localhost', cookieName: 'auth_jwt', sameSite: 'Lax', secure: false }
];

function init() {
  chrome.storage.local.get(['interceptorRules', 'whitelistDomains'], (res) => {
    if (res.interceptorRules) {
      rules = res.interceptorRules;
    }
    if (res.whitelistDomains) {
      document.getElementById('whitelist-input').value = res.whitelistDomains.join('\n');
    }
    renderRules();
  });

  document.getElementById('add-rule-btn').addEventListener('click', () => {
    collectCurrentRules();
    rules.push({ domain: '', cookieName: '', sameSite: 'None', secure: true });
    renderRules();
  });

  document.getElementById('save-options-btn').addEventListener('click', saveOptions);
}

function collectCurrentRules() {
  const tbody = document.getElementById('rules-body');
  if (!tbody) return;
  const rows = tbody.querySelectorAll('tr');
  if (rows.length === 0) return;
  const updated = [];
  rows.forEach(row => {
    const domain = row.querySelector('.rule-domain')?.value.trim() || '';
    const cookieName = row.querySelector('.rule-name')?.value.trim() || '';
    const sameSite = row.querySelector('.rule-samesite')?.value || 'None';
    const secure = !!row.querySelector('.rule-secure')?.checked;
    updated.push({ domain, cookieName, sameSite, secure });
  });
  rules = updated;
}

function renderRules() {
  const tbody = document.getElementById('rules-body');
  tbody.innerHTML = '';

  rules.forEach((r, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><input type="text" class="rule-domain" value="${escapeHtml(r.domain)}" placeholder="*.example.com"></td>
      <td><input type="text" class="rule-name" value="${escapeHtml(r.cookieName)}" placeholder="cookie_name"></td>
      <td>
        <select class="rule-samesite">
          <option value="None" ${r.sameSite === 'None' ? 'selected' : ''}>None</option>
          <option value="Lax" ${r.sameSite === 'Lax' ? 'selected' : ''}>Lax</option>
          <option value="Strict" ${r.sameSite === 'Strict' ? 'selected' : ''}>Strict</option>
        </select>
      </td>
      <td><input type="checkbox" class="rule-secure" ${r.secure ? 'checked' : ''}></td>
      <td><button class="btn btn-danger btn-del" data-idx="${idx}">Delete</button></td>
    `;

    tr.querySelector('.btn-del').addEventListener('click', (e) => {
      collectCurrentRules();
      rules.splice(idx, 1);
      renderRules();
    });

    tbody.appendChild(tr);
  });
}

function saveOptions() {
  const tbody = document.getElementById('rules-body');
  const rows = tbody.querySelectorAll('tr');
  const updatedRules = [];

  rows.forEach(row => {
    const domain = row.querySelector('.rule-domain')?.value.trim() || '';
    const cookieName = row.querySelector('.rule-name')?.value.trim() || '';
    const sameSite = row.querySelector('.rule-samesite')?.value || 'None';
    const secure = !!row.querySelector('.rule-secure')?.checked;

    if (domain) {
      updatedRules.push({ domain, cookieName, sameSite, secure });
    }
  });

  const whitelistText = document.getElementById('whitelist-input')?.value || '';
  const whitelistDomains = whitelistText.split('\n').map(s => s.trim()).filter(Boolean);

  chrome.storage.local.set({
    interceptorRules: updatedRules,
    whitelistDomains: whitelistDomains
  }, () => {
    const status = document.getElementById('save-status');
    status.textContent = 'Settings successfully saved!';
    setTimeout(() => { status.textContent = ''; }, 3000);
  });
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

document.addEventListener('DOMContentLoaded', init);
