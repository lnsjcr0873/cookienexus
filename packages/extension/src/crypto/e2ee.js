/**
 * Client-Side WebCrypto E2EE implementation for CookieNexus Extension
 */

export class E2EECrypto {
  static async deriveKey(password, saltUint8) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    );

    return crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: saltUint8,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  static async encrypt(plaintext, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);

    const encoded = new TextEncoder().encode(plaintext);
    const cipherBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      encoded
    );

    const cipherArray = new Uint8Array(cipherBuffer);
    // In WebCrypto AES-GCM, the last 16 bytes are the auth tag
    const ciphertext = cipherArray.slice(0, cipherArray.length - 16);
    const tag = cipherArray.slice(cipherArray.length - 16);

    return {
      salt: this.toBase64(salt),
      iv: this.toBase64(iv),
      ciphertext: this.toBase64(ciphertext),
      tag: this.toBase64(tag),
    };
  }

  static async decrypt(payload, password) {
    if (!payload || !payload.salt || !payload.iv || !payload.ciphertext || !payload.tag) {
      throw new Error('Malformed vault payload: missing ciphertext, salt, iv, or tag');
    }
    const salt = this.fromBase64(payload.salt);
    const iv = this.fromBase64(payload.iv);
    const ciphertext = this.fromBase64(payload.ciphertext);
    const tag = this.fromBase64(payload.tag);

    const key = await this.deriveKey(password, salt);

    // Combine ciphertext and tag for WebCrypto decrypt
    const combined = new Uint8Array(ciphertext.length + tag.length);
    combined.set(ciphertext, 0);
    combined.set(tag, ciphertext.length);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv, tagLength: 128 },
      key,
      combined
    );

    return new TextDecoder().decode(decryptedBuffer);
  }

  static toBase64(uint8) {
    if (!uint8 || uint8.length === 0) return '';
    const CHUNK_SIZE = 0x8000; // 32KB chunking
    let binary = '';
    for (let i = 0; i < uint8.length; i += CHUNK_SIZE) {
      const chunk = uint8.subarray(i, i + CHUNK_SIZE);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  static fromBase64(base64) {
    const clean = (base64 || '').trim();
    if (!clean) return new Uint8Array(0);
    const binary = atob(clean);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
}
