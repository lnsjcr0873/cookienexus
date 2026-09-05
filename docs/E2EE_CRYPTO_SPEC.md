# CookieNexus: Zero-Knowledge Cryptographic Specification (E2EE)

## 1. Cryptographic Goals & Security Model

1. **Zero-Knowledge Principle**: The central server (Hub) acts purely as an encrypted blind relay and storage store. The server operator, database dumps, and network eavesdroppers cannot inspect or modify session credentials without detection.
2. **Confidentiality**: Protected via standard authenticated encryption: `AES-256-GCM`.
3. **Integrity & Authenticity**: 128-bit authentication tag verified on every decryption. Any tampering causes immediate rejection.
4. **Key Derivation (KDF)**:
   - Primary: `PBKDF2-SHA256` (100,000 iterations) for broad WebCrypto & standard library compatibility.
   - Enhanced: `Argon2id` (m=64MB, t=3, p=4) for native agents.

---

## 2. Key Derivation Function (KDF) Flow

```
[ User Master Password ] + [ Random 16-byte Salt ]
                         |
                         v
       [ PBKDF2-SHA256 (100,000 iterations) ]
                         |
                         v
               [ 256-bit Master Key ]
                         |
           +-------------+-------------+
           |                           |
           v                           v
  [ AES-256-GCM Encryption ]    [ Vault Verification Hash ]
  (Encrypts Cookie Payloads)    (SHA-256(Key + Salt) for auth check)
```

---

## 3. Encryption / Decryption Wire Format

When serializing an encrypted batch of cookies:

```
+-----------------------------------------------------------------------+
| Version (1 byte) | Salt (16 bytes) | IV (12 bytes) | Tag (16 bytes)  |
+-----------------------------------------------------------------------+
|                 Ciphertext (Variable Length JSON Array)               |
+-----------------------------------------------------------------------+
```

### JSON Serialization Representation
```json
{
  "version": 1,
  "kdf": "PBKDF2-SHA256",
  "iterations": 100000,
  "salt": "base64_salt_16_bytes",
  "iv": "base64_iv_12_bytes",
  "tag": "base64_tag_16_bytes",
  "ciphertext": "base64_ciphertext"
}
```

---

## 4. Web Crypto API Implementation Reference

```javascript
// Key Derivation
async function deriveKey(password, salt) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Encryption
async function encryptPayload(key, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv, tagLength: 128 },
    key,
    encoded
  );
  return { iv, ciphertextWithTag: new Uint8Array(cipherBuffer) };
}
```
