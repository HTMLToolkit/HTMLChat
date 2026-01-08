// WebCrypto-based encrypt/decrypt helpers for sensitive values
async function getKeyFromPassphrase(passphrase, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      "raw",
      encoder.encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return window.crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: salt,
        iterations: 50000,
        hash: "SHA-256"
      },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }
  
  async function encryptData(plain, passphrase) {
    const encoder = new TextEncoder();
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await getKeyFromPassphrase(passphrase, salt);
    const ciphertext = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(plain)
    );
    // Return salt + iv + ciphertext as Base64
    const dataBuffer = new Uint8Array(salt.length + iv.length + ciphertext.byteLength);
    dataBuffer.set(salt, 0);
    dataBuffer.set(iv, salt.length);
    dataBuffer.set(new Uint8Array(ciphertext), salt.length + iv.length);
    return btoa(String.fromCharCode.apply(null, dataBuffer));
  }
  
  async function decryptData(data_b64, passphrase) {
    const raw = Uint8Array.from(atob(data_b64), c => c.charCodeAt(0));
    const salt = raw.slice(0, 16);
    const iv = raw.slice(16, 28);
    const ciphertext = raw.slice(28);
    const key = await getKeyFromPassphrase(passphrase, salt);
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    return new TextDecoder().decode(decrypted);
  }

  export { getKeyFromPassphrase, encryptData, decryptData };