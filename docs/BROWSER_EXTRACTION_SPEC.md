# CookieNexus: Browser Credential Extraction Specification

## 1. Cross-Platform Extraction Architecture

CookieNexus Native Extractor extracts local browser cookies directly from sqlite stores on Windows, macOS, and Linux without requiring browser extensions or remote debugging ports.

```
+-------------------------------------------------------------------------------+
|                            Native Extractor Core                              |
+-------------------------------------------------------------------------------+
       |                     |                          |
       v                     v                          v
[ Windows Subsystem ]   [ macOS Subsystem ]     [ Linux Subsystem ]
- Chrome 127+ App-Bound - macOS Keychain API    - SecretStorage / Keyring
- Windows DPAPI Key     - Safe Storage Key      - D-Bus Secret Service
- SQLite Copy & Unlock  - SQLite Unlock         - SQLite Unlock
```

---

## 2. Technical Solution for Chrome 127+ App-Bound Encryption (Windows)

### 2.1 The Challenge
In Chrome 127+ on Windows, Google introduced **App-Bound Encryption** to protect the AES master key stored in `Local State`. Keys with prefix `APPB` are protected via a privileged Windows Service (`elevation_service.exe`), preventing standard user processes from decrypting them via raw `CryptUnprotectData`.

### 2.2 CookieNexus Dual-Mode Resolver
1. **Mode A (Direct DPAPI / Pre-127 or Non-AppBound)**:
   - Reads `%LOCALAPPDATA%\Google\Chrome\User Data\Local State`.
   - Parses `os_crypt.encrypted_key`.
   - Strips 5-byte header (`DPAPI`), passes to `win32crypt.CryptUnprotectData` to obtain 32-byte AES key.
   - Decrypts `Cookies` SQLite database rows using `AES-256-GCM` (stripping 3-byte `v10` prefix, extracting 12-byte IV and 16-byte GCM Tag).

2. **Mode B (App-Bound Elevated Dispatcher / Active Injection Fallback)**:
   - Queries the local Chrome COM Elevation Service using signed IPC or elevated privilege token, or queries active browser sessions via the CookieNexus Extension Native Messaging Host.
   - Decrypts and normalizes into the Canonical `CookieRecord` schema.

---

## 3. Supported Browser Matrix

| Browser | OS Platforms | Storage Location | Cryptographic Backend |
| :--- | :--- | :--- | :--- |
| **Google Chrome** | Win / Mac / Linux | `User Data/Default/Network/Cookies` | App-Bound / DPAPI / Keychain / SecretService |
| **Microsoft Edge** | Win / Mac / Linux | `User Data/Default/Network/Cookies` | DPAPI / Keychain |
| **Mozilla Firefox** | Win / Mac / Linux | `Profiles/*.default-release/cookies.sqlite` | Plaintext SQLite / Moz NSS `key4.db` |
| **Brave Browser** | Win / Mac / Linux | `Brave-Browser/User Data/Default/Network/Cookies`| DPAPI / Keychain |
| **Apple Safari** | macOS | `~/Library/Cookies/Cookies.binarycookies` | BinaryCookies Parser |
