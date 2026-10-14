import type { PlannerState } from '../types';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const ITERATIONS = 310_000;

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) output[i] = binary.charCodeAt(i);
  return output;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptState(state: PlannerState, passphrase: string): Promise<Blob> {
  if (passphrase.length < 10) throw new Error('Use a passphrase with at least 10 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(JSON.stringify(state)));
  const envelope = {
    format: 'campus-os-encrypted-backup',
    version: 1,
    kdf: `PBKDF2-SHA-256-${ITERATIONS}`,
    cipher: 'AES-256-GCM',
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
    createdAt: new Date().toISOString(),
  };
  return new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
}

export async function decryptState(file: File, passphrase: string): Promise<PlannerState> {
  const envelope = JSON.parse(await file.text()) as Record<string, unknown>;
  if (envelope.format !== 'campus-os-encrypted-backup' || envelope.version !== 1) {
    throw new Error('This file is not a supported CampusOS encrypted backup.');
  }
  const salt = fromBase64(String(envelope.salt));
  const iv = fromBase64(String(envelope.iv));
  const ciphertext = fromBase64(String(envelope.ciphertext));
  const key = await deriveKey(passphrase, salt);
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  } catch {
    throw new Error('Could not decrypt the backup. Check the passphrase and file integrity.');
  }
  const parsed = JSON.parse(decoder.decode(plaintext)) as PlannerState;
  if (!parsed || !Array.isArray(parsed.courses) || !Array.isArray(parsed.tasks)) {
    throw new Error('The decrypted file does not contain valid planner data.');
  }
  return parsed;
}
