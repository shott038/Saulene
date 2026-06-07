/**
 * @saulene/plugin/identity — keypair tests
 *
 * All IO uses temp dirs; the real ~/.saulene is never touched.
 */

import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  base58Encode,
  keyPath,
  loadKeypair,
  loadOrCreateKeypair,
  sign,
  verify,
} from "../src/identity/keypair.js";

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "saulene-identity-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

// ── base58Encode ─────────────────────────────────────────────────────────────

describe("base58Encode", () => {
  it("encodes known vectors", () => {
    expect(base58Encode(new Uint8Array([0]))).toBe("1");
    expect(base58Encode(new Uint8Array([0, 0]))).toBe("11");
    // 255 = 4×58 + 23 → "5Q" in base58 (index 4="5", index 23="Q")
    expect(base58Encode(new Uint8Array([255]))).toBe("5Q");
  });

  it("only uses the Solana/Bitcoin alphabet characters", () => {
    const VALID = /^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/;
    const encoded = base58Encode(new Uint8Array(32).fill(0xab));
    expect(encoded).toMatch(VALID);
  });
});

// ── loadKeypair ───────────────────────────────────────────────────────────────

describe("loadKeypair", () => {
  it("returns null when key.json does not exist", () => {
    expect(loadKeypair(root)).toBeNull();
  });

  it("throws on malformed JSON", () => {
    writeFileSync(keyPath(root), "not json", "utf8");
    expect(() => loadKeypair(root)).toThrow();
  });
});

// ── loadOrCreateKeypair ───────────────────────────────────────────────────────

describe("loadOrCreateKeypair", () => {
  it("creates key.json on first call", () => {
    expect(loadKeypair(root)).toBeNull();
    const kp = loadOrCreateKeypair(root);
    expect(kp.publicId).toBeTruthy();
    expect(kp.publicKeyDer).toHaveLength(44); // ed25519 SPKI DER
    expect(kp.privateKeyDer).toHaveLength(48); // ed25519 PKCS8 DER
    // File must now exist
    expect(() => readFileSync(keyPath(root), "utf8")).not.toThrow();
  });

  it("writes key.json with 0600 permissions", () => {
    loadOrCreateKeypair(root);
    const mode = statSync(keyPath(root)).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("is idempotent — second call returns the same publicId", () => {
    const first = loadOrCreateKeypair(root);
    const second = loadOrCreateKeypair(root);
    expect(second.publicId).toBe(first.publicId);
    expect(second.publicKeyDer.toString("base64")).toBe(first.publicKeyDer.toString("base64"));
  });

  it("publicId uses only base58 chars and is ~44 chars for a 32-byte key", () => {
    const kp = loadOrCreateKeypair(root);
    expect(kp.publicId).toMatch(/^[123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]+$/);
    expect(kp.publicId.length).toBeGreaterThanOrEqual(32);
    expect(kp.publicId.length).toBeLessThanOrEqual(50);
  });

  it("round-trips through loadKeypair", () => {
    const created = loadOrCreateKeypair(root);
    const loaded = loadKeypair(root);
    expect(loaded).not.toBeNull();
    expect(loaded?.publicId).toBe(created.publicId);
  });
});

// ── sign / verify ─────────────────────────────────────────────────────────────

describe("sign / verify", () => {
  it("round-trips: sign then verify returns true", () => {
    const kp = loadOrCreateKeypair(root);
    const message = "hello saulene";
    const sig = sign(kp.privateKeyDer, message);
    expect(sig).toHaveLength(64);
    expect(verify(kp.publicKeyDer, message, sig)).toBe(true);
  });

  it("verify returns false for a tampered message", () => {
    const kp = loadOrCreateKeypair(root);
    const sig = sign(kp.privateKeyDer, "original");
    expect(verify(kp.publicKeyDer, "tampered", sig)).toBe(false);
  });

  it("verify returns false for a tampered signature", () => {
    const kp = loadOrCreateKeypair(root);
    const sig = sign(kp.privateKeyDer, "original");
    const tampered = Buffer.from(sig);
    tampered[0] ^= 0xff;
    expect(verify(kp.publicKeyDer, "original", tampered)).toBe(false);
  });

  it("sign accepts Buffer messages", () => {
    const kp = loadOrCreateKeypair(root);
    const msg = Buffer.from([1, 2, 3, 4]);
    const sig = sign(kp.privateKeyDer, msg);
    expect(verify(kp.publicKeyDer, msg, sig)).toBe(true);
  });

  it("signatures from different keys don't cross-verify", () => {
    const kp1 = loadOrCreateKeypair(root);
    const root2 = mkdtempSync(join(tmpdir(), "saulene-identity-"));
    try {
      const kp2 = loadOrCreateKeypair(root2);
      const sig = sign(kp1.privateKeyDer, "hello");
      expect(verify(kp2.publicKeyDer, "hello", sig)).toBe(false);
    } finally {
      rmSync(root2, { recursive: true, force: true });
    }
  });
});
