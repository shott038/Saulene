/**
 * @saulene/plugin — ed25519 identity keypair
 *
 * Every ul gets a permanent cryptographic identity at birth: an ed25519 keypair whose
 * public key is its public ID. ed25519 is deliberate — it's Solana's curve, so this same
 * key becomes the Solana wallet with zero rework.
 *
 * Storage: <root>/key.json (0600). Separate from soul.json — the soul is a replayable
 * personality seed; this is identity. Never co-located, never overwritten once created.
 *
 * IO boundary: all real FS calls live here. Pure sign/verify exported for future reporter.
 */

import { sign as cryptoSign, verify as cryptoVerify, generateKeyPairSync } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

// Solana/Bitcoin base58 alphabet (no 0, O, I, l).
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Encode raw bytes as base58. */
export function base58Encode(bytes: Uint8Array): string {
  let leading = 0;
  for (const b of bytes) {
    if (b !== 0) break;
    leading++;
  }
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let result = "";
  while (n > 0n) {
    result = (BASE58_ALPHABET[Number(n % 58n)] ?? "") + result;
    n /= 58n;
  }
  return (BASE58_ALPHABET[0] ?? "1").repeat(leading) + result;
}

export interface KeyPair {
  /** base58 raw 32-byte ed25519 public key — the ul's permanent public ID (Solana-compatible). */
  publicId: string;
  /** SPKI DER-encoded public key (44 bytes). Pass to `verify`. */
  publicKeyDer: Buffer;
  /** PKCS8 DER-encoded private key (48 bytes). Pass to `sign`. Never leaves disk. */
  privateKeyDer: Buffer;
}

/** `<root>/key.json` — separate from soul.json, 0600. */
export const keyPath = (root: string): string => join(root, "key.json");

function parseKeyFile(raw: string, path: string): KeyPair {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`key.json at ${path} is not valid JSON`);
  }
  if (typeof json !== "object" || json === null)
    throw new Error(`key.json at ${path} is malformed`);
  const { publicKeyDer: pubB64, privateKeyDer: privB64 } = json as Record<string, unknown>;
  if (typeof pubB64 !== "string" || typeof privB64 !== "string")
    throw new Error(`key.json at ${path} is missing required fields`);
  const publicKeyDer = Buffer.from(pubB64, "base64");
  const privateKeyDer = Buffer.from(privB64, "base64");
  return { publicId: base58Encode(publicKeyDer.slice(12)), publicKeyDer, privateKeyDer };
}

/**
 * Load the keypair from disk. Returns null if no key.json yet (not yet born, or
 * born before this feature). Throws on malformed file.
 */
export function loadKeypair(root: string): KeyPair | null {
  let raw: string;
  try {
    raw = readFileSync(keyPath(root), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
  return parseKeyFile(raw, keyPath(root));
}

/**
 * Idempotent load-or-create. If key.json already exists, returns it unchanged — a ul's
 * identity is permanent. Otherwise generates a fresh ed25519 keypair and writes it at
 * 0600 (private key never readable by other users).
 */
export function loadOrCreateKeypair(root: string): KeyPair {
  const existing = loadKeypair(root);
  if (existing) return existing;

  const { publicKey, privateKey } = generateKeyPairSync("ed25519", {
    publicKeyEncoding: { type: "spki", format: "der" },
    privateKeyEncoding: { type: "pkcs8", format: "der" },
  });

  const publicKeyDer = Buffer.isBuffer(publicKey)
    ? publicKey
    : Buffer.from(publicKey as unknown as ArrayBuffer);
  const privateKeyDer = Buffer.isBuffer(privateKey)
    ? privateKey
    : Buffer.from(privateKey as unknown as ArrayBuffer);
  const publicId = base58Encode(publicKeyDer.slice(12));

  const path = keyPath(root);
  mkdirSync(dirname(path), { recursive: true });
  const content = `${JSON.stringify(
    {
      publicKeyDer: publicKeyDer.toString("base64"),
      privateKeyDer: privateKeyDer.toString("base64"),
    },
    null,
    2,
  )}\n`;
  writeFileSync(path, content, { encoding: "utf8", mode: 0o600 });

  return { publicId, publicKeyDer, privateKeyDer };
}

/**
 * Sign a message with the ul's private key. Returns the 64-byte ed25519 signature.
 * Used by the future reporter + `/ul claim` flow to sign a server challenge.
 */
export function sign(privateKeyDer: Buffer, message: Buffer | string): Buffer {
  const msg = typeof message === "string" ? Buffer.from(message, "utf8") : message;
  return Buffer.from(cryptoSign(null, msg, { key: privateKeyDer, format: "der", type: "pkcs8" }));
}

/**
 * Verify an ed25519 signature. Returns true if valid.
 */
export function verify(publicKeyDer: Buffer, message: Buffer | string, signature: Buffer): boolean {
  const msg = typeof message === "string" ? Buffer.from(message, "utf8") : message;
  return cryptoVerify(null, msg, { key: publicKeyDer, format: "der", type: "spki" }, signature);
}
