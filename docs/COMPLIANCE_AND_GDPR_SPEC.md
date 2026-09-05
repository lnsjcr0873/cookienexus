# CookieNexus: Web Privacy & Cookie Consent Specification

## 1. Compliance Architecture

CookieNexus includes a standalone, zero-dependency Web Consent SDK (`cookie-consent.js`) designed to comply with GDPR, CCPA, and ePrivacy directives while supporting **Google Consent Mode v2**.

---

## 2. Consent Categories & Default States

| Category ID | Name | Default State (GDPR Opt-in) | Default State (CCPA Opt-out) | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `necessary` | Strictly Necessary | `granted` (Immutable) | `granted` (Immutable) | Authentication, Security, Session State |
| `analytics` | Analytics & Stats | `denied` | `granted` | Traffic analysis, Performance metrics |
| `marketing` | Marketing & Ads | `denied` | `granted` | Targeted advertisements, Social trackers |
| `functional` | Functional & Prefs| `denied` | `granted` | Language, Theme, User customizations |

---

## 3. Script Sandbox & Execution Blocking

Third-party scripts are prevented from executing until consent is given using the declarative MIME-type rewrite technique:

```html
<!-- Blocked until 'analytics' is consented -->
<script type="text/plain" data-cookie-category="analytics" src="https://www.googletagmanager.com/gtag/js?id=G-XXXXX"></script>

<!-- Blocked inline script until 'marketing' is consented -->
<script type="text/plain" data-cookie-category="marketing">
  fbq('track', 'PageView');
</script>
```

When consent is granted, the engine dynamically activates scripts:
```javascript
function activateScripts(category) {
  const scripts = document.querySelectorAll(`script[type="text/plain"][data-cookie-category="${category}"]`);
  scripts.forEach(oldScript => {
    const newScript = document.createElement('script');
    Array.from(oldScript.attributes).forEach(attr => {
      if (attr.name !== 'type' && attr.name !== 'data-cookie-category') {
        newScript.setAttribute(attr.name, attr.value);
      }
    });
    newScript.type = 'text/javascript';
    newScript.innerHTML = oldScript.innerHTML;
    oldScript.parentNode.replaceChild(newScript, oldScript);
  });
}
```

---

## 4. Google Consent Mode v2 Integration

```javascript
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}

// Set Default Consent (Denied before user choice)
gtag('consent', 'default', {
  'ad_storage': 'denied',
  'analytics_storage': 'denied',
  'ad_user_data': 'denied',
  'ad_personalization': 'denied',
  'wait_for_update': 500
});

// Update on user acceptance
function onUserConsent(grantedCategories) {
  gtag('consent', 'update', {
    'ad_storage': grantedCategories.includes('marketing') ? 'granted' : 'denied',
    'analytics_storage': grantedCategories.includes('analytics') ? 'granted' : 'denied',
    'ad_user_data': grantedCategories.includes('marketing') ? 'granted' : 'denied',
    'ad_personalization': grantedCategories.includes('marketing') ? 'granted' : 'denied'
  });
}
```
