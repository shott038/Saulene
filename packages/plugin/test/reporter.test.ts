/**
 * @saulene/plugin/reporter — tests
 *
 * Covers: payload shape (right fields, no private content), signing (signature verifiable
 * against pubkey), opt-in gating (fetch never called when reporterEnabled is false),
 * no-op when registry URL is unset, and graceful failure (fetch throws → no exception).
 *
 * Injected transport: all tests use a captured stub for fetch — zero real network IO.
 * Real home directory (~/.saulene) is NEVER touched.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Soul, seedFromEntropy } from "@saulene/core";
import { saveSoul } from "@saulene/storage";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveConfig } from "../src/hooks/config.js";
import { loadOrCreateKeypair, verify } from "../src/identity/index.js";
import {
  DEFAULT_REGISTRY_URL,
  type EventPayload,
  type FetchFn,
  type HeartbeatPayload,
  reportEvent,
  reportHeartbeat,
} from "../src/reporter/reporter.js";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const ENTROPY = new Uint8Array(32).fill(42);
const NOW = 1_720_000_000_000;
const REGISTRY_URL = "https://fake-registry.test";

const mintSoul = (): Soul => ({ ...seedFromEntropy(ENTROPY, NOW), lastUsedAt: NOW });

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "saulene-reporter-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Seed a full ready-to-report state: soul + keypair + opted-in config. */
function seedState(reporterEnabled = true): void {
  const soul = mintSoul();
  saveSoul(root, soul);
  loadOrCreateKeypair(root); // generate keypair
  saveConfig(root, { level: "global", reporterEnabled, bornAt: NOW });
}

/** Build a fetch stub that captures the last call's body. */
function makeFetchStub(): {
  calls: Array<{ url: string; body: unknown }>;
  fetch: FetchFn;
} {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetch: FetchFn = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return undefined;
  };
  return { calls, fetch };
}

// ── Heartbeat payload shape ───────────────────────────────────────────────────

describe("reportHeartbeat — payload shape", () => {
  it("POSTs to /heartbeat with correct fingerprint fields", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${REGISTRY_URL}/heartbeat`);

    const payload = calls[0]?.body as HeartbeatPayload;
    const fp = payload.fingerprint;

    // Required public fields present
    expect(typeof fp.pubkey).toBe("string");
    expect(fp.pubkey.length).toBeGreaterThan(0);
    expect(typeof fp.mbti).toBe("string");
    expect(fp.mbti).toMatch(/^[EI][SN][TF][JP]$/);
    expect(typeof fp.stage).toBe("string");
    expect(["childhood", "adolescence", "early_adulthood", "old_adulthood"]).toContain(fp.stage);
    expect(typeof fp.mp).toBe("number");
    expect(["male", "female"]).toContain(fp.sex);
    expect(fp.status).toBe("alive");
    expect(typeof fp.born_at).toBe("number");

    // All 10 aspects present, display scale 0-100
    const ASPECTS = [
      "openness",
      "intellect",
      "industriousness",
      "orderliness",
      "enthusiasm",
      "assertiveness",
      "compassion",
      "politeness",
      "withdrawal",
      "volatility",
    ] as const;
    for (const a of ASPECTS) {
      expect(typeof fp.aspects[a]).toBe("number");
      expect(fp.aspects[a]).toBeGreaterThanOrEqual(0);
      expect(fp.aspects[a]).toBeLessThanOrEqual(100);
    }

    // Timestamp + signing fields
    expect(payload.timestamp).toBe(NOW);
    expect(typeof payload.sig).toBe("string");
    expect(typeof payload.canonical_bytes).toBe("string");
  });

  it("fingerprint contains no private fields (diary / ledger / voice / raw floats)", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    const payload = calls[0]?.body as HeartbeatPayload;
    const fp = payload.fingerprint as Record<string, unknown>;

    // No private content
    expect(fp.diary).toBeUndefined();
    expect(fp.voice).toBeUndefined();
    expect(fp.ledger).toBeUndefined();
    expect(fp.a).toBeUndefined(); // leaky accumulators
    expect(fp.s).toBeUndefined(); // raw s vector (sent as set_points, not s)
    expect(fp.v).toBeUndefined(); // raw v vector (sent as aspects, not v)
    expect(fp.privateKey).toBeUndefined();
    expect(fp.privateKeyDer).toBeUndefined();
  });
});

// ── Rich fingerprint fields (v2 public soul math) ────────────────────────────

describe("reportHeartbeat — rich fingerprint fields", () => {
  const ASPECTS = [
    "openness",
    "intellect",
    "industriousness",
    "orderliness",
    "enthusiasm",
    "assertiveness",
    "compassion",
    "politeness",
    "withdrawal",
    "volatility",
  ] as const;

  it("includes set_points per-aspect ×100 rounded", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    const fp = (calls[0]?.body as HeartbeatPayload).fingerprint;
    expect(typeof fp.set_points).toBe("object");
    for (const a of ASPECTS) {
      expect(typeof fp.set_points[a]).toBe("number");
      expect(fp.set_points[a]).toBeGreaterThanOrEqual(0);
      expect(fp.set_points[a]).toBeLessThanOrEqual(100);
      expect(Number.isInteger(fp.set_points[a])).toBe(true);
    }
  });

  it("includes disuse_anchor per-aspect ×100 rounded", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    const fp = (calls[0]?.body as HeartbeatPayload).fingerprint;
    expect(typeof fp.disuse_anchor).toBe("object");
    for (const a of ASPECTS) {
      expect(typeof fp.disuse_anchor[a]).toBe("number");
      expect(fp.disuse_anchor[a]).toBeGreaterThanOrEqual(0);
      expect(fp.disuse_anchor[a]).toBeLessThanOrEqual(100);
    }
  });

  it("includes stubbornness as a raw 0-1 number", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    const fp = (calls[0]?.body as HeartbeatPayload).fingerprint;
    expect(typeof fp.stubbornness).toBe("number");
    expect(fp.stubbornness).toBeGreaterThanOrEqual(0);
    expect(fp.stubbornness).toBeLessThanOrEqual(1);
  });

  it("includes tension per-aspect as raw finite numbers", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    const fp = (calls[0]?.body as HeartbeatPayload).fingerprint;
    expect(typeof fp.tension).toBe("object");
    for (const a of ASPECTS) {
      expect(typeof fp.tension[a]).toBe("number");
      expect(Number.isFinite(fp.tension[a])).toBe(true);
    }
  });

  it("includes beta_gain per-aspect as raw finite numbers", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    const fp = (calls[0]?.body as HeartbeatPayload).fingerprint;
    expect(typeof fp.beta_gain).toBe("object");
    for (const a of ASPECTS) {
      expect(typeof fp.beta_gain[a]).toBe("number");
      expect(Number.isFinite(fp.beta_gain[a])).toBe(true);
    }
  });

  it("includes migration_budget as a raw finite number", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    const fp = (calls[0]?.body as HeartbeatPayload).fingerprint;
    expect(typeof fp.migration_budget).toBe("number");
    expect(Number.isFinite(fp.migration_budget)).toBe(true);
  });

  it("includes soul_hash as a non-empty hex string", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    const fp = (calls[0]?.body as HeartbeatPayload).fingerprint;
    expect(typeof fp.soul_hash).toBe("string");
    expect(fp.soul_hash.length).toBeGreaterThan(0);
    expect(fp.soul_hash).toMatch(/^[0-9a-f]+$/);
  });

  it("includes plugin_version as a semver-shaped string", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    const fp = (calls[0]?.body as HeartbeatPayload).fingerprint;
    expect(typeof fp.plugin_version).toBe("string");
    expect(fp.plugin_version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("includes schema_version as a positive integer", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    const fp = (calls[0]?.body as HeartbeatPayload).fingerprint;
    expect(typeof fp.schema_version).toBe("number");
    expect(Number.isInteger(fp.schema_version)).toBe(true);
    expect(fp.schema_version).toBeGreaterThan(0);
  });
});

// ── Signing ───────────────────────────────────────────────────────────────────

describe("reportHeartbeat — signing", () => {
  it("signature is valid against the keypair public key", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    const payload = calls[0]?.body as HeartbeatPayload;
    const { sig, canonical_bytes } = payload;

    const keypair = loadOrCreateKeypair(root);
    const signedBytes = Buffer.from(canonical_bytes, "base64");
    const sigBytes = Buffer.from(sig, "base64");

    expect(verify(keypair.publicKeyDer, signedBytes, sigBytes)).toBe(true);
  });

  it("wrong signature does not verify", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });

    const payload = calls[0]?.body as HeartbeatPayload;
    const { canonical_bytes } = payload;

    const keypair = loadOrCreateKeypair(root);
    const signedBytes = Buffer.from(canonical_bytes, "base64");
    const badSig = Buffer.alloc(64, 0); // all-zero → invalid

    expect(verify(keypair.publicKeyDer, signedBytes, badSig)).toBe(false);
  });
});

// ── Default-on gating ─────────────────────────────────────────────────────────

describe("default-on gating", () => {
  it("does not call fetch when reporterEnabled is false (explicit opt-out)", async () => {
    seedState(false); // reporterEnabled = false
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });
    expect(calls).toHaveLength(0);
  });

  it("does not call fetch when config is absent (plugin not set up)", async () => {
    // No config.json — plugin not set up; always a no-op regardless of default-on
    const soul = mintSoul();
    saveSoul(root, soul);
    loadOrCreateKeypair(root);

    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });
    expect(calls).toHaveLength(0);
  });

  it("DOES call fetch when reporterEnabled is absent from config (default on)", async () => {
    // Config exists but no reporterEnabled key → default-on semantics
    const soul = mintSoul();
    saveSoul(root, soul);
    loadOrCreateKeypair(root);
    writeFileSync(join(root, "config.json"), JSON.stringify({ level: "global" }), "utf8");

    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });
    expect(calls).toHaveLength(1);
  });
});

// ── Registry URL resolution (default + explicit disable) ───────────────────────

describe("registry URL resolution", () => {
  it("falls back to DEFAULT_REGISTRY_URL when none provided and env var is absent", async () => {
    seedState();
    const saved = process.env.SAULENE_REGISTRY_URL;
    // biome-ignore lint/performance/noDelete: env removal requires delete in Node.js
    delete process.env.SAULENE_REGISTRY_URL;

    const { calls, fetch } = makeFetchStub();
    try {
      await reportHeartbeat({ storageRoot: root, now: NOW, fetch }); // no registryUrl → default
      expect(calls).toHaveLength(1);
      expect(calls[0]?.url).toBe(`${DEFAULT_REGISTRY_URL}/heartbeat`);
    } finally {
      if (saved !== undefined) process.env.SAULENE_REGISTRY_URL = saved;
    }
  });

  it("does not call fetch when registryUrl is an empty string (explicit disable)", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: "", fetch });
    expect(calls).toHaveLength(0);
  });
});

// ── Graceful failure ──────────────────────────────────────────────────────────

describe("graceful failure", () => {
  it("does not throw when fetch throws a network error", async () => {
    seedState();
    const throwingFetch: FetchFn = async () => {
      throw new Error("ECONNREFUSED");
    };
    // Must not throw
    await expect(
      reportHeartbeat({
        storageRoot: root,
        now: NOW,
        registryUrl: REGISTRY_URL,
        fetch: throwingFetch,
      }),
    ).resolves.toBeUndefined();
  });

  it("does not throw when no soul exists (not yet born)", async () => {
    // Config but no soul
    saveConfig(root, { level: "global", reporterEnabled: true, bornAt: NOW });
    const { calls, fetch } = makeFetchStub();
    await expect(
      reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch }),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });

  it("does not throw when no keypair exists", async () => {
    // Soul but no keypair
    saveSoul(root, mintSoul());
    saveConfig(root, { level: "global", reporterEnabled: true, bornAt: NOW });
    const { calls, fetch } = makeFetchStub();
    await expect(
      reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch }),
    ).resolves.toBeUndefined();
    expect(calls).toHaveLength(0);
  });
});

// ── reportEvent ───────────────────────────────────────────────────────────────

describe("reportEvent", () => {
  it("POSTs to /events with the correct kind", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportEvent({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch }, "born");

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(`${REGISTRY_URL}/events`);
    const payload = calls[0]?.body as EventPayload;
    expect(payload.kind).toBe("born");
  });

  it("includes meta in the payload when provided", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportEvent(
      { storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch },
      "stage_change",
      { from: "childhood", to: "adolescence" },
    );
    const payload = calls[0]?.body as EventPayload;
    expect(payload.meta).toEqual({ from: "childhood", to: "adolescence" });
  });

  it("event payload signature is valid", async () => {
    seedState();
    const { calls, fetch } = makeFetchStub();
    await reportEvent(
      { storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch },
      "rupture",
      {
        aspect: "volatility",
      },
    );
    const payload = calls[0]?.body as EventPayload;
    const keypair = loadOrCreateKeypair(root);
    const signedBytes = Buffer.from(payload.canonical_bytes, "base64");
    const sigBytes = Buffer.from(payload.sig, "base64");
    expect(verify(keypair.publicKeyDer, signedBytes, sigBytes)).toBe(true);
  });

  it("is a no-op when opted out (reporterEnabled: false)", async () => {
    seedState(false);
    const { calls, fetch } = makeFetchStub();
    await reportEvent({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch }, "born");
    expect(calls).toHaveLength(0);
  });

  it("does not throw when fetch throws", async () => {
    seedState();
    const throwingFetch: FetchFn = async () => {
      throw new Error("network error");
    };
    await expect(
      reportEvent(
        { storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch: throwingFetch },
        "born",
      ),
    ).resolves.toBeUndefined();
  });
});

// ── born_at in fingerprint ────────────────────────────────────────────────────

describe("born_at in fingerprint", () => {
  it("uses bornAt from config when present", async () => {
    const BORN_AT = NOW - 1_000_000; // soul was born earlier
    saveSoul(root, mintSoul());
    loadOrCreateKeypair(root);
    saveConfig(root, { level: "global", reporterEnabled: true, bornAt: BORN_AT });

    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });
    const payload = calls[0]?.body as HeartbeatPayload;
    expect(payload.fingerprint.born_at).toBe(BORN_AT);
  });

  it("falls back to soul.lastUsedAt when bornAt is absent from config", async () => {
    saveSoul(root, mintSoul()); // soul.lastUsedAt = NOW
    loadOrCreateKeypair(root);
    saveConfig(root, { level: "global", reporterEnabled: true }); // no bornAt

    const { calls, fetch } = makeFetchStub();
    await reportHeartbeat({ storageRoot: root, now: NOW, registryUrl: REGISTRY_URL, fetch });
    const payload = calls[0]?.body as HeartbeatPayload;
    expect(payload.fingerprint.born_at).toBe(NOW); // falls back to soul.lastUsedAt
  });
});
