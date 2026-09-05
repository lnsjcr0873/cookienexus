# CookieNexus: Intelligent Probing & Self-Healing Engine Specification

## 1. Overview & Architecture

Cookie sessions expire naturally due to Max-Age/Expires headers, server-side TTL invalidations, or security logouts. 

The CookieNexus **Probing & Healing Engine** operates as an asynchronous background worker that actively monitors session validity and triggers automated recovery pipelines.

```
+-----------------------------------------------------------------------------+
|                          Probing & Healing Lifecycle                        |
|                                                                             |
|  [ Registered Probe ]                                                       |
|           |                                                                 |
|           v                                                                 |
|  [ Scheduled Interval (e.g. 5m) ]                                           |
|           |                                                                 |
|           v                                                                 |
|  [ Execute HTTP Request with Cookie Header ]                                |
|           |                                                                 |
|           +---> [ Response Assertion ]                                      |
|                       |                                                     |
|                       +-- (Pass) ---> Status = HEALTHY (Record latency)     |
|                       |                                                     |
|                       +-- (Fail) ---> Status = EXPIRED / DEGRADED           |
|                                             |                               |
|                                             v                               |
|                                    [ Trigger Self-Healing ]                 |
|                                             |                               |
|                     +-----------------------+-----------------------+       |
|                     |                       |                       |       |
|                     v                       v                       v       |
|             [ API Token Refresh ]    [ Playwright Relogin ]  [ User Alert ] |
+-----------------------------------------------------------------------------+
```

---

## 2. Probe Definition Schema

```json
{
  "probeId": "probe_weibo_vip",
  "domain": "weibo.com",
  "vaultId": "vault_main_01",
  "schedule": "*/5 * * * *",
  "request": {
    "url": "https://weibo.com/ajax/profile/info",
    "method": "GET",
    "headers": {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    },
    "timeoutMs": 5000
  },
  "assertion": {
    "expectedStatus": 200,
    "jsonPath": "$.data.user.id",
    "mustExist": true,
    "denyKeywords": ["login", "passport", "verify"]
  },
  "healing": {
    "action": "webhook_or_relogin",
    "webhookUrl": "https://api.cookienexus.local/hooks/relogin",
    "alertChannels": ["telegram", "discord"]
  }
}
```

---

## 3. Healing Strategies

1. **Strategy 1: Silent Refresh Token Exchange**:
   If the session includes an `oauth_refresh_token` or `app_token`, the server requests the target identity provider's token endpoint to mint a new cookie set without user interaction.
2. **Strategy 2: Playwright Headless Flow**:
   Triggers a worker container with Playwright to execute a script-defined automated login flow (supporting 2FA retrieval via email/SMS webhooks).
3. **Strategy 3: Human-in-the-Loop Desktop Push**:
   Broadcasts a high-priority push notification to the user's browser extension. Clicking it launches the login window, and the extension captures the new cookies immediately on completion.
