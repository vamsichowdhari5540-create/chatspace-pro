/**
 * ============================================================
 * ChatSpace Pro — End-to-End Encryption Utility
 * ============================================================
 * Copyright (c) 2026 Venkata Vamsi. All Rights Reserved.
 *
 * Uses Web Crypto API (built into all modern browsers).
 * - RSA-OAEP 2048-bit for key exchange (encrypting AES keys)
 * - AES-GCM 256-bit for actual message content (fast, symmetric)
 *
 * HOW IT WORKS:
 * 1. Each user generates an RSA keypair on first login.
 *    Public key -> sent to server (safe to share).
 *    Private key -> stored ONLY in browser (IndexedDB), never sent anywhere.
 *
 * 2. For DMs: sender generates a random AES key, encrypts the message
 *    with it, then encrypts that AES key twice -- once with the
 *    recipient's RSA public key, once with the sender's own RSA public
 *    key (so the sender can decrypt their own sent messages later).
 *
 * 3. For Groups/Channels: a shared AES key exists per group. It is
 *    encrypted individually for every member's RSA public key and
 *    stored in `group_keys`. Messages are encrypted once with the
 *    shared AES key (fast), and each member decrypts using their own
 *    decrypted copy of that shared key.
 *
 * The server and database only ever store ciphertext + encrypted keys.
 * Nobody with database access (including the admin) can read messages.
 * ============================================================
 */

// ── IndexedDB storage for private key (never leaves this browser) ──
const DB_NAME = 'chatspace_keystore';
const STORE_NAME = 'keys';

function openKeyDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key, value) {
  const db = await openKeyDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openKeyDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Base64 helpers (Web Crypto works with ArrayBuffers, DB needs strings) ──
function abToBase64(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}
function base64ToAb(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

// ── 1. RSA KEYPAIR GENERATION (run once per user, on first login) ──
export async function generateUserKeypair() {
  const keyPair = await window.crypto.subtle.generateKey(
    { name: 'RSA-OAEP', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['encrypt', 'decrypt']
  );
  const publicKeyRaw = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
  const privateKeyRaw = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  return {
    publicKeyB64: abToBase64(publicKeyRaw),   // send this to server
    privateKeyB64: abToBase64(privateKeyRaw), // keep this in browser ONLY
  };
}

// ── 2. STORE / RETRIEVE PRIVATE KEY LOCALLY ──
export async function savePrivateKey(userId, privateKeyB64) {
  await idbSet(`privkey_${userId}`, privateKeyB64);
}

export async function getPrivateKey(userId) {
  const b64 = await idbGet(`privkey_${userId}`);
  if (!b64) return null;
  return window.crypto.subtle.importKey(
    'pkcs8', base64ToAb(b64), { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['decrypt']
  );
}

export async function importPublicKey(publicKeyB64) {
  return window.crypto.subtle.importKey(
    'spki', base64ToAb(publicKeyB64), { name: 'RSA-OAEP', hash: 'SHA-256' }, true, ['encrypt']
  );
}

// ── 3. AES KEY GENERATION (one per message-for-DMs, one per group for channels/groups) ──
export async function generateAesKey() {
  return window.crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

async function exportAesKey(aesKey) {
  const raw = await window.crypto.subtle.exportKey('raw', aesKey);
  return abToBase64(raw);
}

async function importAesKey(aesKeyB64) {
  return window.crypto.subtle.importKey('raw', base64ToAb(aesKeyB64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
}

// ── 4. ENCRYPT AN AES KEY WITH SOMEONE'S RSA PUBLIC KEY (key exchange) ──
export async function encryptAesKeyForUser(aesKey, recipientPublicKeyB64) {
  const recipientPublicKey = await importPublicKey(recipientPublicKeyB64);
  const aesKeyB64 = await exportAesKey(aesKey);
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' }, recipientPublicKey, new TextEncoder().encode(aesKeyB64)
  );
  return abToBase64(encrypted);
}

// ── 5. DECRYPT AN AES KEY USING MY OWN RSA PRIVATE KEY ──
export async function decryptAesKeyWithMyKey(encryptedAesKeyB64, myPrivateKey) {
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' }, myPrivateKey, base64ToAb(encryptedAesKeyB64)
  );
  const aesKeyB64 = new TextDecoder().decode(decrypted);
  return importAesKey(aesKeyB64);
}

// ── 6. ENCRYPT / DECRYPT MESSAGE TEXT WITH AN AES KEY ──
export async function encryptMessage(plaintext, aesKey) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plaintext);
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, encoded);
  return { ciphertext: abToBase64(ciphertext), iv: abToBase64(iv) };
}

export async function decryptMessage(ciphertextB64, ivB64, aesKey) {
  try {
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: base64ToAb(ivB64) }, aesKey, base64ToAb(ciphertextB64)
    );
    return new TextDecoder().decode(decrypted);
  } catch (e) {
    console.error('Decryption failed:', e);
    return '🔒 [Unable to decrypt]';
  }
}

// ── 7. HIGH-LEVEL: ENCRYPT A DM (handles both recipient + sender-self copies) ──
export async function encryptDirectMessage(plaintext, recipientPublicKeyB64, senderPublicKeyB64) {
  const aesKey = await generateAesKey();
  const { ciphertext, iv } = await encryptMessage(plaintext, aesKey);
  const encryptedKeyForRecipient = await encryptAesKeyForUser(aesKey, recipientPublicKeyB64);
  const encryptedKeyForSender = await encryptAesKeyForUser(aesKey, senderPublicKeyB64);
  return { ciphertext, iv, encryptedKeyForRecipient, encryptedKeyForSender };
}

// ── 8. HIGH-LEVEL: DECRYPT A DM (works for either sender or recipient) ──
export async function decryptDirectMessage(ciphertext, iv, encryptedKeyForMe, myPrivateKey) {
  const aesKey = await decryptAesKeyWithMyKey(encryptedKeyForMe, myPrivateKey);
  return decryptMessage(ciphertext, iv, aesKey);
}

// ── 9. HIGH-LEVEL: ENCRYPT FOR A GROUP/CHANNEL (shared AES key, many recipients) ──
export async function encryptGroupMessage(plaintext, groupAesKey) {
  return encryptMessage(plaintext, groupAesKey); // returns { ciphertext, iv }
}

export async function decryptGroupMessage(ciphertext, iv, groupAesKey) {
  return decryptMessage(ciphertext, iv, groupAesKey);
}

// ── 10. CREATE A NEW GROUP KEY AND ENCRYPT IT FOR ALL MEMBERS (call when group is created, or key is rotated) ──
export async function createGroupKeyForMembers(memberPublicKeys) {
  // memberPublicKeys: [{ userId, publicKeyB64 }, ...]
  const groupAesKey = await generateAesKey();
  const encryptedKeys = await Promise.all(
    memberPublicKeys.map(async (m) => ({
      userId: m.userId,
      encryptedKey: await encryptAesKeyForUser(groupAesKey, m.publicKeyB64),
    }))
  );
  return { groupAesKey, encryptedKeys }; // encryptedKeys -> save to group_keys table
}

// ── 11. LOAD A GROUP'S AES KEY (decrypt my copy of it) ──
export async function loadGroupKey(myEncryptedGroupKey, myPrivateKey) {
  return decryptAesKeyWithMyKey(myEncryptedGroupKey, myPrivateKey);
}

// ── Cache decrypted group AES keys in-memory per session (avoid re-decrypting on every message) ──
const groupKeyCache = new Map();

export async function getOrLoadGroupKey(groupId, myEncryptedGroupKey, myPrivateKey) {
  if (groupKeyCache.has(groupId)) return groupKeyCache.get(groupId);
  const key = await loadGroupKey(myEncryptedGroupKey, myPrivateKey);
  groupKeyCache.set(groupId, key);
  return key;
}

export function clearGroupKeyCache(groupId) {
  if (groupId) groupKeyCache.delete(groupId);
  else groupKeyCache.clear();
}

// ── Cache decrypted DM AES keys per message too (so re-renders don't re-decrypt) ──
const dmKeyCache = new Map(); // messageId -> AES CryptoKey

export async function getOrLoadDmMessageKey(messageId, encryptedKeyForMe, myPrivateKey) {
  if (dmKeyCache.has(messageId)) return dmKeyCache.get(messageId);
  const key = await decryptAesKeyWithMyKey(encryptedKeyForMe, myPrivateKey);
  dmKeyCache.set(messageId, key);
  return key;
}
