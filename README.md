# CookieNexus (OmniCookie)

> **Enterprise-grade Zero-Knowledge Cookie & Session Management Platform**  
> *Seamlessly bridging Local Browser DevTools, E2EE Multi-Device Sync, Automated Cookie Pools, Native App-Bound Extraction, and Developer SDKs.*

[![Build & Test Status](https://img.shields.io/badge/tests-13%2F13%20passed-brightgreen.svg)](#)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Zero-Knowledge E2EE](https://img.shields.io/badge/Security-AES--256--GCM%20%2B%20Argon2id-orange.svg)](#)
[![Manifest V3 Ready](https://img.shields.io/badge/Chrome-Manifest%20V3-blueviolet.svg)](#)

---

## 1. Problem Statement & Motivation

Traditional cookie management tools in the open-source ecosystem suffer from severe architectural fragmentation:
- **Browser Extensions (Cookie-Editor, EditThisCookie)**: Great visual interfaces, but strictly local with no multi-device sync, automation hooks, or team collaboration.
- **Sync Services (CookieCloud)**: Lightweight self-hosting, but relies on naive "last-write-wins" on entire datasets, causing data clobbering across active devices.
- **Automation Pools (CookiesPool)**: Heavyweight, difficult to maintain across anti-bot/2FA challenges, and lacks client encryption.
- **Extraction Tools (browser-cookie3 / rookie-py)**: Facing security restrictions on modern OSes (e.g. Chrome 127+ Windows App-Bound Encryption).
- **Web Consent Tools (CookieConsent)**: Purely client-side with no centralized session observability.

**CookieNexus** unifies these disparate capabilities into a single, cohesive, production-grade architecture.

---

## 2. System Architecture

```
+-----------------------------------------------------------------------------------+
|                                Client Layer                                       |
|  +---------------------------+  +----------------------+  +---------------------+ |
|  | Web Extension (MV3)       |  | Native Extractor CLI |  | Web Consent Banner | |
|  | - Popup Visual Editor     |  | - DPAPI / App-Bound  |  | - Zero-Dep Vanilla  | |
|  | - Interceptor Rules       |  | - macOS Keychain     |  | - GCM v2 / Banner   | |
|  | - Client CRDT Engine      |  | - Linux SecretStore  |  | - Sandbox Blocker   | |
|  +---------------------------+  +----------------------+  +---------------------+ |
+----------------------------------------+------------------------------------------+
                                         | Client-Side AES-256-GCM & PBKDF2/Argon2
                                         v
+-----------------------------------------------------------------------------------+
|                            Zero-Knowledge Sync Layer                              |
|   - Real-time Bidirectional WebSocket (`/ws/sync`)                                |
|   - REST Envelope API (`/api/v1/vault/*`)                                         |
|   - CRDT Conflict-Free State Merging (LWW-Element-Set per domain/name/path)       |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                          CookieNexus Core Hub (Server)                            |
|  +---------------------------+  +----------------------+  +---------------------+ |
|  | Storage Adapters          |  | Probing & Self-Heal  |  | RBAC & Audit Engine | |
|  | - Memory / SQLite         |  | - Active HTTP Probe  |  | - Masked Log Stream | |
|  | - PostgreSQL / Redis      |  | - Auto-Heal Trigger  |  | - Domain Scoping    | |
|  +---------------------------+  +----------------------+  +---------------------+ |
+----------------------------------------+------------------------------------------+
                                         | E2EE Secret Decryption on Consumer Side
                                         v
+-----------------------------------------------------------------------------------+
|                        Developer & Automation Ecosystem                           |
|  +---------------------------+  +----------------------+  +---------------------+ |
|  | Python SDK (`cookienexus`)|  | Node.js / TS SDK     |  | DevOps & PT / NAS   | |
|  | - Requests / HTTPX        |  | - Axios / Fetch      |  | - Webhook dispatch  | |
|  | - Playwright session      |  | - Puppeteer context  |  | - Docker Compose    | |
|  +---------------------------+  +----------------------+  +---------------------+ |
+-----------------------------------------------------------------------------------+
```

---

## 3. Monorepo Structure

```
cookienexus/
├── packages/
│   ├── server/            # Central Hub (Fastify/Node.js + WebSockets + CRDT + Prober)
│   ├── extension/         # Cross-browser Manifest V3 Extension (Chrome, Edge, Firefox)
│   ├── sdk-python/        # Universal Python SDK (Requests, HTTPX, Playwright, Pool)
│   ├── sdk-ts/            # Universal TypeScript/Node.js SDK (Axios, Fetch, Playwright)
│   ├── local-extractor/   # Native Chromium/Firefox Decryption CLI (DPAPI & Keyring)
│   └── consent-banner/    # Zero-dependency Web Consent SDK (GDPR + Google Consent Mode v2)
├── docs/                  # In-depth Protocol & Architectural Specifications
├── scripts/               # Unified Automated Verification & Benchmark Suites
├── Dockerfile             # Production Hub Multi-Stage Containerfile
└── docker-compose.yml     # One-Click Self-Hosted Stack
```

---

## 4. Quickstart Guide

### 4.1 Running the Central Hub (Self-Hosted)

#### Option A: Via Docker Compose
```bash
docker compose up -d
```

#### Option B: Via Node.js
```bash
npm install
npm --workspace=@cookienexus/server run build
node packages/server/dist/index.js
```
The Hub server will start on `http://localhost:8765` with WebSocket sync enabled on `ws://localhost:8765/ws/sync`.

---

### 4.2 Using the Python SDK

```python
from cookienexus import CookieNexusClient, SessionManager, CookiePool
import requests

# 1. Initialize Client with Zero-Knowledge E2EE Credentials
client = CookieNexusClient(
    hub_url="http://localhost:8765",
    vault_id="my_production_vault",
    password="my_super_secure_master_password"
)

# 2. Inject Cookies into Requests / HTTPX
session = requests.Session()
sm = SessionManager(client)
sm.inject_requests(session, domain="github.com")

resp = session.get("https://github.com/user")
print(resp.status_code)

# 3. Direct Playwright Browser Context Injection
playwright_storage = client.get_playwright_storage_state(domain="github.com")
# browser.new_context(storage_state=playwright_storage)
```

---

### 4.3 Using the TypeScript / Node.js SDK

```typescript
import { CookieNexusClient, CookiePool } from '@cookienexus/sdk-ts';

const client = new CookieNexusClient({
  hubUrl: 'http://localhost:8765',
  vaultId: 'my_production_vault',
  password: 'my_super_secure_master_password',
});

// Fetch cookies as HTTP Header string
const header = await client.getCookieHeader('github.com');
console.log('Cookie Header:', header);

// Generate Playwright Storage State
const storageState = await client.getPlaywrightStorageState('github.com');
```

---

### 4.4 Local Native Extractor CLI

Extract cookies directly from local browsers without browser debugging flags:

```bash
# Extract Chrome cookies for github.com as JSON
python packages/local-extractor/extractor/cli.py --browser chrome --domain github.com

# Extract Edge cookies as Netscape format
python packages/local-extractor/extractor/cli.py --browser edge --format netscape --out cookies.txt
```

---

## 5. Acceptance Test Matrix & Verification

To run the complete automated test suite verifying all 13 core capabilities (E2EE crypto, CRDT sync, Probing, Masked Audit Logging, and SDKs):

```bash
python scripts/verify_all.py
```

### Verified Test Cases:
| Test ID | Module | Verification Scope | Status |
| :--- | :--- | :--- | :--- |
| **TC-01..05** | Server Core | CRDT LWW-Element-Set, Vector Clocks, Prober Mock | **PASSED** |
| **TC-03** | E2EE Crypto | Client AES-256-GCM + PBKDF2 Zero-Knowledge verification | **PASSED** |
| **TC-03-B** | Security | Server-side Database Zero-Plaintext Audit | **PASSED** |
| **TC-10** | Python SDK | Crypto roundtrip, Playwright export, Pool rotation | **PASSED** |
| **TC-11** | TypeScript SDK| Header generation, StorageState, Multi-account pool | **PASSED** |
| **TC-13** | RBAC/Audit | Dynamic Sensitive Token Masking in Log Streams | **PASSED** |

---

## 6. Detailed Specifications in `/docs`

For deep technical dives, refer to:
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) - System Component Model & Data Flow
- [`docs/E2EE_CRYPTO_SPEC.md`](docs/E2EE_CRYPTO_SPEC.md) - Cryptographic Protocol & WebCrypto Specifications
- [`docs/CRDT_SYNC_SPEC.md`](docs/CRDT_SYNC_SPEC.md) - Conflict-Free Replication & Deterministic Convergence
- [`docs/PROBE_AND_HEALING_SPEC.md`](docs/PROBE_AND_HEALING_SPEC.md) - Health Check Scheduler & Recovery Pipelines
- [`docs/BROWSER_EXTRACTION_SPEC.md`](docs/BROWSER_EXTRACTION_SPEC.md) - Windows App-Bound Encryption & SQLite Readers
- [`docs/COMPLIANCE_AND_GDPR_SPEC.md`](docs/COMPLIANCE_AND_GDPR_SPEC.md) - Web Consent & Google Consent Mode v2 Engine
- [`docs/ACCEPTANCE_TEST_MATRIX.md`](docs/ACCEPTANCE_TEST_MATRIX.md) - Test Cases & Quality Acceptance Criteria

---

## 7. License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.
