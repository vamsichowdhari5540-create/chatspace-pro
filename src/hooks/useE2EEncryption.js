/**
 * ============================================================
 * ChatSpace Pro — useE2EEncryption Hook
 * ============================================================
 * Copyright (c) 2026 Venkata Vamsi. All Rights Reserved.
 *
 * INTEGRATION GUIDE (see E2E_INTEGRATION_GUIDE.md for exact diffs):
 *
 * 1. Import this hook in Chat.js:
 *      import { useE2EEncryption } from '../hooks/useE2EEncryption';
 *
 * 2. Call it once near the top of the Chat component:
 *      const e2e = useE2EEncryption(user, axios, API);
 *
 * 3. Wherever messages are fetched (loadMessages) or received via socket,
 *    pass them through e2e.decryptIncoming(messages, context) BEFORE
 *    calling setMessages(). This populates msg.text with the decrypted
 *    plaintext, so renderMessage() and everything downstream needs ZERO
 *    changes — it just sees plaintext like always.
 *
 * 4. In sendMessage(), before posting to the server, call
 *    e2e.encryptOutgoing(text, context) to get { ciphertext, iv, ...keys }
 *    and send THAT instead of { text }.
 *
 * 5. On group creation, call e2e.createGroupKeys(memberPublicKeys) and
 *    pass the result's `encryptedKeys` as `memberKeys` in the POST /groups call.
 *
 * `context` shape: { type: 'dm'|'group'|'channel', peerId, groupId, channelName }
 * ============================================================
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  generateUserKeypair, savePrivateKey, getPrivateKey,
  encryptDirectMessage, decryptDirectMessage,
  encryptGroupMessage, decryptGroupMessage,
  createGroupKeyForMembers, getOrLoadGroupKey, clearGroupKeyCache,
  getOrLoadDmMessageKey,
} from '../utils/crypto';

export function useE2EEncryption(user, axios, API) {
  const [ready, setReady] = useState(false);
  const [encryptionEnabled, setEncryptionEnabled] = useState(true); // master on/off toggle, user-facing setting
  const myPrivateKeyRef = useRef(null);
  const myPublicKeyRef = useRef(null);
  const publicKeyCacheRef = useRef(new Map()); // userId -> publicKeyB64, avoids refetching

  // ── ON LOGIN: ensure this user has a keypair. Generate one if missing. ──
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    (async () => {
      try {
        // Try to load an existing private key from this browser's IndexedDB first
        let privKey = await getPrivateKey(user.id);

        if (!privKey) {
          // No local key — either first login ever, or a new browser/device.
          // Generate a fresh keypair. NOTE: if the user already has messages
          // encrypted under an OLD keypair from another device, those become
          // undecryptable on this device — this is expected E2E behavior
          // (same limitation real apps like Signal have without explicit
          // device-linking flows, which is out of scope here).
          const { publicKeyB64, privateKeyB64 } = await generateUserKeypair();
          await savePrivateKey(user.id, privateKeyB64);
          await axios.post(`${API}/auth/save-public-key`, { publicKey: publicKeyB64 });
          myPublicKeyRef.current = publicKeyB64;
          privKey = await getPrivateKey(user.id);
          console.log('🔐 New E2E keypair generated for this device');
        } else {
          // Already have a private key locally — fetch our own public key for caching
          if (!myPublicKeyRef.current) {
            const r = await axios.get(`${API}/auth/public-key/${user.id}`);
            myPublicKeyRef.current = r.data.publicKey;
          }
        }

        if (!cancelled) {
          myPrivateKeyRef.current = privKey;
          setReady(true);
        }
      } catch (err) {
        console.error('E2E key setup failed:', err);
        // Fail open: encryption setup failing should not block the chat app
        // from working — fall back to unencrypted mode rather than locking
        // the user out entirely.
        setEncryptionEnabled(false);
        setReady(true);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, axios, API]);

  // ── Fetch + cache another user's public key ──
  const getPublicKeyFor = useCallback(async (userId) => {
    if (publicKeyCacheRef.current.has(userId)) return publicKeyCacheRef.current.get(userId);
    try {
      const r = await axios.get(`${API}/auth/public-key/${userId}`);
      if (r.data.publicKey) publicKeyCacheRef.current.set(userId, r.data.publicKey);
      return r.data.publicKey;
    } catch {
      return null;
    }
  }, [axios, API]);

  // ── ENCRYPT a message before sending (DM or Group) ──
  const encryptOutgoing = useCallback(async (text, context) => {
    if (!encryptionEnabled || !ready) return { text }; // fallback: send plaintext as before

    try {
      if (context.type === 'dm') {
        const recipientPublicKey = await getPublicKeyFor(context.peerId);
        if (!recipientPublicKey || !myPublicKeyRef.current) {
          console.warn('🔓 Recipient has no public key yet — sending unencrypted');
          return { text };
        }
        const { ciphertext, iv, encryptedKeyForRecipient, encryptedKeyForSender } =
          await encryptDirectMessage(text, recipientPublicKey, myPublicKeyRef.current);
        return {
          ciphertext, iv,
          encrypted_key_recipient: encryptedKeyForRecipient,
          encrypted_key_sender: encryptedKeyForSender,
        };
      }

      if (context.type === 'group') {
        const myEncryptedGroupKey = context.myEncryptedGroupKey;
        if (!myEncryptedGroupKey) {
          console.warn('🔓 No group key available — sending unencrypted');
          return { text };
        }
        const groupKey = await getOrLoadGroupKey(context.groupId, myEncryptedGroupKey, myPrivateKeyRef.current);
        const { ciphertext, iv } = await encryptGroupMessage(text, groupKey);
        return { ciphertext, iv };
      }

      if (context.type === 'channel') {
        const myEncryptedChannelKey = context.myEncryptedChannelKey;
        if (!myEncryptedChannelKey) {
          console.warn('🔓 No channel key available — sending unencrypted');
          return { text };
        }
        const channelKey = await getOrLoadGroupKey(`channel_${context.channelName}`, myEncryptedChannelKey, myPrivateKeyRef.current);
        const { ciphertext, iv } = await encryptGroupMessage(text, channelKey);
        return { ciphertext, iv };
      }

      return { text };
    } catch (err) {
      console.error('Encryption failed, falling back to plaintext:', err);
      return { text };
    }
  }, [encryptionEnabled, ready, getPublicKeyFor]);

  // Decrypt a batch of incoming messages (call before setMessages).
  // IMPORTANT: this used to run every message through Promise.all() at once.
  // RSA-OAEP decryption (used to unwrap each message's AES key) is CPU-heavy —
  // doing ~100 of them back-to-back on the single JS thread blocks EVERYTHING
  // else, including the message input box, for a noticeable moment right after
  // switching conversations. Processing in small chunks with a yield (via
  // setTimeout(0)) between each chunk lets the browser interleave this work
  // with user input, so typing stays responsive even while older messages are
  // still decrypting in the background.
  const decryptIncoming = useCallback(async (msgs, context) => {
    if (!ready || !Array.isArray(msgs)) return msgs;

    const CHUNK_SIZE = 8;
    const results = new Array(msgs.length);

    const decryptOne = async (msg) => {
      if (!msg.is_encrypted || !msg.ciphertext) return msg; // already plaintext / legacy message
      try {
        if (context.type === 'dm') {
          const isSender = msg.from_user_id === user.id;
          const myEncryptedKey = isSender ? msg.encrypted_key_sender : msg.encrypted_key_recipient;
          if (!myEncryptedKey) return { ...msg, text: '🔒 [Encrypted — key unavailable]' };
          const aesKey = await getOrLoadDmMessageKey(msg.id, myEncryptedKey, myPrivateKeyRef.current);
          const plaintext = await decryptGroupMessage(msg.ciphertext, msg.iv, aesKey);
          return { ...msg, text: plaintext };
        }
        if (context.type === 'group') {
          const groupKey = await getOrLoadGroupKey(context.groupId, context.myEncryptedGroupKey, myPrivateKeyRef.current);
          const plaintext = await decryptGroupMessage(msg.ciphertext, msg.iv, groupKey);
          return { ...msg, text: plaintext };
        }
        if (context.type === 'channel') {
          const channelKey = await getOrLoadGroupKey(`channel_${context.channelName}`, context.myEncryptedChannelKey, myPrivateKeyRef.current);
          const plaintext = await decryptGroupMessage(msg.ciphertext, msg.iv, channelKey);
          return { ...msg, text: plaintext };
        }
        return msg;
      } catch (err) {
        console.error('Decryption failed for message', msg.id, err);
        return { ...msg, text: '🔒 [Unable to decrypt]' };
      }
    };

    for (let i = 0; i < msgs.length; i += CHUNK_SIZE) {
      const chunk = msgs.slice(i, i + CHUNK_SIZE);
      const chunkResults = await Promise.all(chunk.map(decryptOne));
      chunkResults.forEach((r, j) => { results[i + j] = r; });
      // Yield back to the browser so keystrokes/clicks get a chance to process
      // before we start the next chunk — this is what keeps typing responsive.
      if (i + CHUNK_SIZE < msgs.length) await new Promise(res => setTimeout(res, 0));
    }

    return results;
  }, [ready, user?.id]);

  // ── Create a brand-new group's shared key, encrypted for each initial member ──
  const createGroupKeys = useCallback(async (memberPublicKeys) => {
    // memberPublicKeys: [{ userId, publicKeyB64 }]
    return createGroupKeyForMembers(memberPublicKeys);
  }, []);

  return {
    ready,
    encryptionEnabled,
    setEncryptionEnabled,
    encryptOutgoing,
    decryptIncoming,
    createGroupKeys,
    getPublicKeyFor,
    myPublicKey: myPublicKeyRef.current,
    clearGroupKeyCache,
  };
}