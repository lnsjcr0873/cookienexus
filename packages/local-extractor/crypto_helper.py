import base64
import subprocess
import json

def decrypt_aes_gcm(key: bytes, iv: bytes, ciphertext_with_tag: bytes) -> str:
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        aesgcm = AESGCM(key)
        decrypted = aesgcm.decrypt(iv, ciphertext_with_tag, None)
        return decrypted.decode('utf-8')
    except ImportError:
        # Fallback to Node.js subprocess
        key_b64 = base64.b64encode(key).decode('utf-8')
        iv_b64 = base64.b64encode(iv).decode('utf-8')
        # tag is last 16 bytes
        tag = ciphertext_with_tag[-16:]
        ct = ciphertext_with_tag[:-16]
        ct_b64 = base64.b64encode(ct).decode('utf-8')
        tag_b64 = base64.b64encode(tag).decode('utf-8')

        script = f"""
        const crypto = require('crypto');
        const key = Buffer.from('{key_b64}', 'base64');
        const iv = Buffer.from('{iv_b64}', 'base64');
        const tag = Buffer.from('{tag_b64}', 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);
        let dec = decipher.update('{ct_b64}', 'base64', 'utf8');
        dec += decipher.final('utf8');
        process.stdout.write(dec);
        """
        res = subprocess.run(['node', '-e', script], capture_output=True, text=True, check=True)
        return res.stdout
