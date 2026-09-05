# CookieNexus: Comprehensive Acceptance Test Matrix & Quality Verification

This document outlines every functional and non-functional acceptance test case for the CookieNexus platform, along with its verification procedure, expected output, and pass/fail criteria.

---

## 1. Acceptance Test Matrix

| Test ID | Module | Feature Under Test | Test Scenario / Procedure | Pass Criteria | Verification Method |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **TC-01** | Browser Ext | Immediate Edit & Persistence | Modify `session_token` value in popup UI; reload page | New cookie sent in HTTP Request headers immediately | Network tab inspection / Chrome DevTools protocol |
| **TC-02** | Browser Ext | Multi-Format Export/Import | Export 50 cookies to Netscape, cURL, JSON, and Playwright `storageState.json` | 100% roundtrip fidelity with zero data loss | Automated JSON schema validator & cURL dry-run |
| **TC-03** | E2EE Crypto | Zero-Knowledge Confidentiality | Sync encrypted cookie bundle to Hub; inspect Postgres/Redis database dump | 0 plaintext instances of cookies in database; all ciphertext is AES-GCM-256 | Database regex scan & entropy audit |
| **TC-04** | E2EE Crypto | Tamper Resistance | Modify 1 byte in ciphertext envelope payload and attempt decryption | Decryption raises Authentication Tag failure and rejects payload | Unit test with corrupted auth tag |
| **TC-05** | CRDT Sync | Concurrent Write Convergence | Node A writes `site.com:token=A` @ T1; Node B writes `site.com:token=B` @ T2 (T2 > T1) simultaneously | Both nodes converge to `site.com:token=B` without throwing conflict errors | Automated 2-node simulation test |
| **TC-06** | CRDT Sync | Offline Deletion Tombstone | Node A deletes `site.com:old` offline; Node B modifies `site.com:other` online; Node A reconnects | `site.com:old` remains deleted on both nodes; `site.com:other` preserved | Multi-node sync scenario test |
| **TC-07** | Probing Engine| Session Expiration Detection | Register probe for mock API; simulate 401 Unauthorized response | Probe status transitions to `EXPIRED` within 1 poll cycle; event emitted | Mock HTTP server assert test |
| **TC-08** | Probing Engine| Automated Self-Healing | Configure webhook auto-heal on expired session; trigger expiration | Webhook invoked with payload; updated cookie received and synced | Webhook listener assertion |
| **TC-09** | Native Extractor| Chrome/Edge/Firefox Extraction | Run `cookienexus-extract` on local machine | Extracts and formats valid `CookieRecord` JSON for specified domain | CLI execution & format validation |
| **TC-10** | Python SDK | Playwright Injection | Fetch session from CookieNexus and launch headless Playwright browser | Browser context is initialized with authenticated session | Automated Playwright script check |
| **TC-11** | TypeScript SDK| Axios Cookie Jar Integration | Inject CookieNexus session into Axios instance; send request | Request headers automatically populate `Cookie:` header | Node.js Axios mock request test |
| **TC-12** | Consent Engine| Script Blocking & GCM v2 | Load test page with Google Analytics tags; test Opt-in / Opt-out | 0 tracking requests fired before consent; scripts fire immediately upon consent | Headless Chrome request interceptor |
| **TC-13** | Security/RBAC | Audit Log Token Masking | Perform cookie sync with sensitive auth token; check server audit logs | Auth tokens masked as `xxxx****yyyy`; no plaintext token in stdout/logs | Log stream scanner |

---

## 2. Automated Test Execution Guide

All automated tests can be verified using the unified verification script:

```bash
# Python & Node Unified Test Suite
python scripts/verify_all.py
```
