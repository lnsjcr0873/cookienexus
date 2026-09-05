# CookieNexus: System Architecture & Protocol Specification (v1.0.0)

## 1. Architectural Overview

CookieNexus is designed as an end-to-end, zero-knowledge session and cookie orchestration platform. It unifies browser-level user interaction, cloud-based cryptographic synchronization, intelligent session probing, native credential extraction, and developer SDK consumption.

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
+----------------------------------------+------------------------------------------+
```

---

## 2. Core Protocol Definitions

### 2.1 Cookie Record Schema (Canonical Format)

Every Cookie managed within CookieNexus follows the Canonical Cookie Schema:

```typescript
export interface CookieRecord {
  // Identity Keys (Compound Primary Key: domain + name + path)
  domain: string;
  name: string;
  path: string;

  // Values
  value: string;

  // Security Flags
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'Strict' | 'Lax' | 'None' | 'unspecified';
  hostOnly?: boolean;

  // Lifecycle
  expirationDate?: number; // Unix timestamp in seconds (undefined = Session)
  session: boolean;

  // CRDT Metadata
  updatedAt: number;       // Milliseconds since epoch
  nodeId: string;          // Generating Device UUID
  version: number;         // Incremental Lamport clock
  isDeleted?: boolean;     // Tombstone flag for CRDT deletions
}
```

### 2.2 Storage & Vault Envelope (Zero-Knowledge)

When stored on the server or transmitted over the network, raw cookie values are never exposed. All records are wrapped in a cryptographic envelope:

```typescript
export interface EncryptedVaultEnvelope {
  vaultId: string;           // Workspace or User Vault UUID
  deviceId: string;          // Source Device ID
  algorithm: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256' | 'Argon2id';
  salt: string;              // Base64-encoded 16-byte salt
  iv: string;                // Base64-encoded 12-byte initialization vector
  ciphertext: string;        // Base64-encoded AES-GCM ciphertext
  tag: string;               // Base64-encoded 16-byte authentication tag
  vectorClock: Record<string, number>; // CRDT Vector Clock mapping { [nodeId]: counter }
  updatedAt: number;
}
```

---

## 3. Communication Channels

1. **REST APIs (`/api/v1`)**:
   - `POST /api/v1/auth/login` - Authenticate client & exchange JWT token.
   - `POST /api/v1/vault/sync` - Push/pull encrypted CRDT state batch.
   - `GET /api/v1/vault/:vaultId` - Retrieve latest encrypted envelope.
   - `POST /api/v1/probes/register` - Register a heartbeat probe for a domain/account.
   - `GET /api/v1/probes/status` - Query session health status.

2. **WebSocket Channel (`/ws/sync`)**:
   - Bi-directional push/pull event bus.
   - Events:
     - `CLIENT_HELLO` - Device handshake and vector clock exchange.
     - `SYNC_DELTA` - Real-time push of incremental CRDT changes.
     - `PROBE_ALERT` - Instant notification of expired or refreshed sessions.
     - `HEARTBEAT` - Keepalive ping/pong every 30 seconds.

---

## 4. Key Non-Functional Requirements (NFRs)

| Dimension | Target Specification | Enforcement Mechanism |
| :--- | :--- | :--- |
| **Confidentiality** | Server zero-knowledge | Client-side AES-256-GCM; server database stores zero plaintext tokens |
| **Sync Latency** | P95 < 200ms across active nodes | WebSocket delta sync + event-driven CRDT state reducer |
| **Conflict Resilience** | 0% data drop on concurrent writes | LWW-Element-Set with deterministic UUID tie-breaker |
| **Local Extractor Speed** | < 200ms for full browser dump | Direct native SQLite read with memory-mapped DPAPI / App-Bound decryption |
| **Ext Memory Footprint** | Idle RAM < 25MB | Manifest V3 Background Service Worker lifecycle management |
