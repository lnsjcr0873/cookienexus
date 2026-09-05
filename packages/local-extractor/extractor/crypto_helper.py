import base64
import subprocess
import json

def decrypt_aes_gcm(key: bytes, iv: bytes, ciphertext_with_tag: bytes) -> str:
    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
        aesgcm = AESGCM(key)
        decrypted = aesgcm.decrypt(iv, ciphertext_with_tag, None)
        return decrypted.decode('utf-8', errors='replace')
    except ImportError:
        # Fallback to Node.js subprocess using JSON via stdin for security & robustness
        key_b64 = base64.b64encode(key).decode('utf-8')
        iv_b64 = base64.b64encode(iv).decode('utf-8')
        tag = ciphertext_with_tag[-16:]
        ct = ciphertext_with_tag[:-16]
        ct_b64 = base64.b64encode(ct).decode('utf-8')
        tag_b64 = base64.b64encode(tag).decode('utf-8')

        input_data = json.dumps({
            "key": key_b64,
            "iv": iv_b64,
            "tag": tag_b64,
            "ciphertext": ct_b64
        })

        script = """
        const crypto = require('crypto');
        let raw = '';
        process.stdin.on('data', c => raw += c);
        process.stdin.on('end', () => {
          try {
            const data = JSON.parse(raw);
            const key = Buffer.from(data.key, 'base64');
            const iv = Buffer.from(data.iv, 'base64');
            const tag = Buffer.from(data.tag, 'base64');
            const ct = Buffer.from(data.ciphertext, 'base64');
            const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
            decipher.setAuthTag(tag);
            const decryptedBuf = Buffer.concat([decipher.update(ct), decipher.final()]);
            process.stdout.write(decryptedBuf.toString('utf8'));
          } catch (err) {
            process.exit(1);
          }
        });
        """
        res = subprocess.run(['node', '-e', script], input=input_data, capture_output=True, text=True, encoding='utf-8', check=True)
        return res.stdout

def decrypt_aes_cbc(key: bytes, iv: bytes, ciphertext: bytes) -> str:
    try:
        from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
        from cryptography.hazmat.primitives import padding
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv))
        decryptor = cipher.decryptor()
        decrypted_padded = decryptor.update(ciphertext) + decryptor.finalize()
        unpadder = padding.PKCS7(128).unpadder()
        decrypted = unpadder.update(decrypted_padded) + unpadder.finalize()
        return decrypted.decode('utf-8', errors='replace')
    except Exception:
        try:
            key_b64 = base64.b64encode(key).decode('utf-8')
            iv_b64 = base64.b64encode(iv).decode('utf-8')
            ct_b64 = base64.b64encode(ciphertext).decode('utf-8')
            input_data = json.dumps({"key": key_b64, "iv": iv_b64, "ciphertext": ct_b64})
            script = """
            const crypto = require('crypto');
            let raw = '';
            process.stdin.on('data', c => raw += c);
            process.stdin.on('end', () => {
              try {
                const data = JSON.parse(raw);
                const key = Buffer.from(data.key, 'base64');
                const iv = Buffer.from(data.iv, 'base64');
                const ct = Buffer.from(data.ciphertext, 'base64');
                const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
                const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
                process.stdout.write(dec.toString('utf8'));
              } catch(e) { process.exit(1); }
            });
            """
            res = subprocess.run(['node', '-e', script], input=input_data, capture_output=True, text=True, encoding='utf-8', check=True)
            return res.stdout
        except Exception:
            return "[DECRYPT_FAILED]"
