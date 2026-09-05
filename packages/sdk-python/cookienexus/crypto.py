import base64
import hashlib
import hmac
import os
import json
from typing import Dict, Any, List

def pbkdf2_sha256(password: str, salt: bytes, iterations: int = 100000, key_length: int = 32) -> bytes:
    """Derives a key using standard library hashlib.pbkdf2_hmac."""
    return hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, iterations, dklen=key_length)

class CryptoEngine:
    @staticmethod
    def decrypt_vault(payload: Dict[str, Any], password: str) -> List[Dict[str, Any]]:
        """
        Decrypts an AES-256-GCM vault payload.
        Uses `cryptography` library if installed, otherwise uses secure Node.js stdin worker fallback.
        """
        salt = base64.b64decode(payload['salt'])
        iv = base64.b64decode(payload['iv'])
        ciphertext = base64.b64decode(payload['ciphertext'])
        tag = base64.b64decode(payload['tag'])
        key = pbkdf2_sha256(password, salt)

        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            aesgcm = AESGCM(key)
            decrypted_bytes = aesgcm.decrypt(iv, ciphertext + tag, None)
            return json.loads(decrypted_bytes.decode('utf-8'))
        except ImportError:
            return CryptoEngine._decrypt_via_node_fallback(payload, password)

    @staticmethod
    def encrypt_vault(cookies: List[Dict[str, Any]], password: str, vault_id: str, device_id: str = "py_sdk") -> Dict[str, Any]:
        salt = os.urandom(16)
        iv = os.urandom(12)
        key = pbkdf2_sha256(password, salt)
        raw_json = json.dumps(cookies).encode('utf-8')

        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            aesgcm = AESGCM(key)
            encrypted_data = aesgcm.encrypt(iv, raw_json, None)
            ciphertext = encrypted_data[:-16]
            tag = encrypted_data[-16:]

            return {
                "vaultId": vault_id,
                "deviceId": device_id,
                "algorithm": "AES-256-GCM",
                "kdf": "PBKDF2-SHA256",
                "salt": base64.b64encode(salt).decode('utf-8'),
                "iv": base64.b64encode(iv).decode('utf-8'),
                "ciphertext": base64.b64encode(ciphertext).decode('utf-8'),
                "tag": base64.b64encode(tag).decode('utf-8'),
                "vectorClock": {device_id: 1},
                "updatedAt": 0
            }
        except ImportError:
            return CryptoEngine._encrypt_via_node_fallback(cookies, password, vault_id, device_id)

    @staticmethod
    def _decrypt_via_node_fallback(payload: Dict[str, Any], password: str) -> List[Dict[str, Any]]:
        import subprocess
        input_data = json.dumps({
            "salt": payload["salt"],
            "iv": payload["iv"],
            "tag": payload["tag"],
            "ciphertext": payload["ciphertext"],
            "password": password
        })
        script = """
        const crypto = require('crypto');
        let raw = '';
        process.stdin.on('data', c => raw += c);
        process.stdin.on('end', () => {
          try {
            const data = JSON.parse(raw);
            const salt = Buffer.from(data.salt, 'base64');
            const iv = Buffer.from(data.iv, 'base64');
            const tag = Buffer.from(data.tag, 'base64');
            const ct = Buffer.from(data.ciphertext, 'base64');
            const key = crypto.pbkdf2Sync(data.password, salt, 100000, 32, 'sha256');
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            const decryptedBuf = Buffer.concat([decipher.update(ct), decipher.final()]);
            process.stdout.write(decryptedBuf.toString('utf8'));
          } catch (e) {
            process.exit(1);
          }
        });
        """
        result = subprocess.run(['node', '-e', script], input=input_data, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)

    @staticmethod
    def _encrypt_via_node_fallback(cookies: List[Dict[str, Any]], password: str, vault_id: str, device_id: str) -> Dict[str, Any]:
        import subprocess
        input_data = json.dumps({
            "cookies": cookies,
            "password": password,
            "vaultId": vault_id,
            "deviceId": device_id
        })
        script = """
        const crypto = require('crypto');
        let raw = '';
        process.stdin.on('data', c => raw += c);
        process.stdin.on('end', () => {
          try {
            const data = JSON.parse(raw);
            const salt = crypto.randomBytes(16);
            const iv = crypto.randomBytes(12);
            const key = crypto.pbkdf2Sync(data.password, salt, 100000, 32, 'sha256');
            const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
            const ctBuf = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(data.cookies), 'utf8')), cipher.final()]);
            const ct = ctBuf.toString('base64');
            const tag = cipher.getAuthTag();
            const out = {
              vaultId: data.vaultId,
              deviceId: data.deviceId,
              algorithm: 'AES-256-GCM',
              kdf: 'PBKDF2-SHA256',
              salt: salt.toString('base64'),
              iv: iv.toString('base64'),
              ciphertext: ct,
              tag: tag.toString('base64'),
              vectorClock: { [data.deviceId]: 1 },
              updatedAt: Date.now()
            };
            process.stdout.write(JSON.stringify(out));
          } catch (e) {
            process.exit(1);
          }
        });
        """
        result = subprocess.run(['node', '-e', script], input=input_data, capture_output=True, text=True, check=True)
        return json.loads(result.stdout)
