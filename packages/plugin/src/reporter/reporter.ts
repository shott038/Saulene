/**
 * @saulene/plugin — registry reporter (on by default)
 *
 * Signs the ul's PUBLIC fingerprint with its private key and POSTs lifecycle events to the
 * registry. Fire-and-forget: never blocks a hook; all network errors are swallowed (optional
 * debug log only). A down or missing registry never degrades the session or drift pipeline.
 *
 * Default ON: any configured ul reports to the production registry (DEFAULT_REGISTRY_URL)
 * automatically. Opt out by setting reporterEnabled: false in <storageRoot>/config.json.
 * Override the URL with SAULENE_REGISTRY_URL; set it (or opts.registryUrl) to "" to disable
 * network calls without touching the config flag.
 * A ul with no config file (plugin not yet set up) is always a no-op.
 *
 * Public fingerprint ONLY — never private soul content (no diary, voice samples, ledger):
 *   pubkey, mbti, aspects (0-100 display scale), stage, mp, sex, status, born_at.
 *
 * Signing: canonical JSON of {fingerprint, timestamp} is signed with the ul's ed25519
 * private key. The server verifies against pubkey. Timestamp is a replay-prevention nonce.
 *
 * Injected transport: pass opts.fetch in tests to assert payload shape with zero real IO.
 * Env var for real URL: SAULENE_REGISTRY_URL
 */

import { ASPECTS, type Aspect, projectMbti, stageFromMp } from "@saulene/core";
import { soulHash } from "@saulene/renderer";
import { STORAGE_SCHEMA_VERSION, defaultRoot, loadSoul } from "@saulene/storage";
import { type LevelConfig, loadConfig } from "../hooks/config.js";
import { loadKeypair, sign } from "../identity/index.js";

const PLUGIN_VERSION = "0.0.0";

// ── Types ─────────────────────────────────────────────────────────────────────

export type EventKind = "born" | "stage_change" | "rupture";

/** Minimal fetch-like interface (only what the reporter uses). */
export type FetchFn = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal: AbortSignal;
  },
) => Promise<unknown>;

export interface ReporterOpts {
  /**
   * Override the registry URL (tests inject a fake URL; production reads the env var).
   * Falsy → no-op regardless of other opts.
   */
  registryUrl?: string;
  /** Injected transport. Defaults to globalThis.fetch. Tests pass a captured stub. */
  fetch?: FetchFn;
  /** Storage root. Defaults to ~/.saulene. Tests pass a temp dir. */
  storageRoot?: string;
  /** Unix timestamp (ms). Defaults to Date.now(). Tests inject a fixed value. */
  now?: number;
}

/** Public fingerprint — NEVER diary, voice samples, ledger, or any message content. */
export interface PublicFingerprint {
  pubkey: string; // base58 ed25519 public key — the ul's permanent public ID
  mbti: string; // display-only MBTI label, e.g. "INTJ"
  aspects: Record<Aspect, number>; // 10 values, display scale 0–100
  stage: string; // "childhood" | "adolescence" | "early_adulthood" | "old_adulthood"
  mp: number; // maturity points (age proxy)
  sex: string; // "male" | "female"
  status: string; // "alive" (dead uls don't report — session-start gates them out)
  born_at: number; // epoch ms — from config.bornAt (written by the wizard at birth)
  // ── full public soul math (v2) ────────────────────────────────────────────
  set_points: Record<Aspect, number>; // soul.s ×100 rounded — birth baseline
  disuse_anchor: Record<Aspect, number>; // soul.disuseAnchor ×100 rounded
  stubbornness: number; // raw 0–1
  tension: Record<Aspect, number>; // raw dynamical magnitude per aspect
  beta_gain: Record<Aspect, number>; // raw per aspect
  migration_budget: number; // raw
  soul_hash: string; // FNV-1a/32 over v — changes iff rendered output could change
  plugin_version: string; // package.json version
  schema_version: number; // wire schema version (mirrors STORAGE_SCHEMA_VERSION)
}

/** Wire format for heartbeat POSTs. */
export interface HeartbeatPayload {
  fingerprint: PublicFingerprint;
  timestamp: number; // replay-prevention nonce (ms since epoch)
  sig: string; // base64 ed25519 signature over canonical_bytes
  canonical_bytes: string; // base64 UTF-8 of the exact bytes that were signed
}

/** Wire format for lifecycle event POSTs. */
export interface EventPayload extends HeartbeatPayload {
  kind: EventKind;
  meta?: Record<string, unknown>;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/** Deterministic canonical JSON with sorted object keys (for signing). */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const parts = keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`);
  return `{${parts.join(",")}}`;
}

/**
 * The production Saulene registry (a Supabase Edge Function; auth is the per-ul ed25519
 * signature, not a Supabase key). Baked in so an opted-in ul reports automatically with no
 * manual config. Override with `SAULENE_REGISTRY_URL`; set it (or opts.registryUrl) to "" to
 * disable reporting entirely even when opted in.
 */
export const DEFAULT_REGISTRY_URL =
  "https://slmvnyxtkkomotflalqn.supabase.co/functions/v1/registry";

/**
 * Resolve the effective registry URL: explicit opt > env var > baked-in default. An explicit
 * empty string is an escape hatch that disables reporting (returns undefined → caller no-ops).
 * Never throws.
 */
function resolveUrl(opts: ReporterOpts): string | undefined {
  const explicit = opts.registryUrl ?? process.env.SAULENE_REGISTRY_URL;
  if (explicit === "") return undefined; // explicit disable
  return explicit ?? DEFAULT_REGISTRY_URL;
}

/**
 * Build the public fingerprint from the live soul + keypair + config.
 * Returns null when any required piece is missing (not yet born, no keypair, etc.).
 */
function buildFingerprint(
  root: string,
  config: LevelConfig,
  now: number,
): PublicFingerprint | null {
  const soul = loadSoul(root);
  if (!soul) return null;

  const keypair = loadKeypair(root);
  if (!keypair) return null;

  const stage = stageFromMp(soul.mp, soul);
  const mbti = projectMbti(soul.v);
  const aspects = {} as Record<Aspect, number>;
  const setPoints = {} as Record<Aspect, number>;
  const disuseAnchor = {} as Record<Aspect, number>;
  const tension = {} as Record<Aspect, number>;
  const betaGain = {} as Record<Aspect, number>;
  for (const a of ASPECTS) {
    aspects[a] = Math.round(soul.v[a] * 100);
    setPoints[a] = Math.round(soul.s[a] * 100);
    disuseAnchor[a] = Math.round(soul.disuseAnchor[a] * 100);
    tension[a] = soul.tension[a];
    betaGain[a] = soul.betaGain[a];
  }

  // born_at: from config (written by wizard at birth). Fall back to lastUsedAt for uls
  // born before this feature was added (they won't have bornAt in config).
  const bornAt = config.bornAt ?? soul.lastUsedAt;

  return {
    pubkey: keypair.publicId,
    mbti,
    aspects,
    stage,
    mp: soul.mp,
    sex: soul.sex,
    status: "alive",
    born_at: bornAt,
    set_points: setPoints,
    disuse_anchor: disuseAnchor,
    stubbornness: soul.stubbornness,
    tension,
    beta_gain: betaGain,
    migration_budget: soul.migrationBudget,
    soul_hash: soulHash(soul),
    plugin_version: PLUGIN_VERSION,
    schema_version: STORAGE_SCHEMA_VERSION,
  };
}

/** Sign a fingerprint + timestamp with the ul's private key. Returns null on missing keypair. */
function signFingerprint(
  fingerprint: PublicFingerprint,
  timestamp: number,
  root: string,
): { sig: string; canonical_bytes: string } | null {
  const keypair = loadKeypair(root);
  if (!keypair) return null;

  const signed = canonicalJson({ fingerprint, timestamp });
  const bytes = Buffer.from(signed, "utf8");
  const signature = sign(keypair.privateKeyDer, bytes);

  return {
    sig: signature.toString("base64"),
    canonical_bytes: bytes.toString("base64"),
  };
}

/** POST to the registry. Swallows ALL errors; times out after 5 s. Never throws. */
async function postToRegistry(
  fetchFn: FetchFn,
  baseUrl: string,
  path: string,
  body: unknown,
): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    await fetchFn(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch {
    // Swallow all network / timeout / DNS errors — a down registry must never block or break.
    // Optional debug: uncomment for local troubleshooting.
    // console.debug("[saulene/reporter] registry unreachable:", err);
  } finally {
    clearTimeout(timer);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Fire-and-forget heartbeat — call on SessionStart to signal the ul is alive and upsert
 * its current public state on the server (drives last_seen / death-sweep).
 *
 * No-ops when: plugin not set up (no config), opted out (reporterEnabled === false),
 * registry URL unset, no soul, no keypair.
 * Never throws; all errors are swallowed internally.
 */
export async function reportHeartbeat(opts: ReporterOpts = {}): Promise<void> {
  const root = opts.storageRoot ?? defaultRoot();
  const now = opts.now ?? Date.now();

  const config = loadConfig(root);
  if (!config) return; // plugin not yet set up → always a no-op
  if (config.reporterEnabled === false) return; // explicit opt-out

  const baseUrl = resolveUrl(opts);
  if (!baseUrl) return; // no URL configured → no-op

  const fingerprint = buildFingerprint(root, config, now);
  if (!fingerprint) return;

  const signed = signFingerprint(fingerprint, now, root);
  if (!signed) return;

  const payload: HeartbeatPayload = { fingerprint, timestamp: now, ...signed };

  const fetchFn = opts.fetch ?? (globalThis.fetch as unknown as FetchFn);
  void postToRegistry(fetchFn, baseUrl, "/heartbeat", payload);
}

/**
 * Fire-and-forget lifecycle event — call from Stop hook (stage_change, rupture) and
 * from the setup wizard (born).
 *
 * No-ops when: plugin not set up (no config), opted out (reporterEnabled === false),
 * registry URL unset, no soul, no keypair.
 * Never throws; all errors are swallowed internally.
 */
export async function reportEvent(
  opts: ReporterOpts,
  kind: EventKind,
  meta?: Record<string, unknown>,
): Promise<void> {
  const root = opts.storageRoot ?? defaultRoot();
  const now = opts.now ?? Date.now();

  const config = loadConfig(root);
  if (!config) return; // plugin not yet set up → always a no-op
  if (config.reporterEnabled === false) return; // explicit opt-out

  const baseUrl = resolveUrl(opts);
  if (!baseUrl) return;

  const fingerprint = buildFingerprint(root, config, now);
  if (!fingerprint) return;

  const signed = signFingerprint(fingerprint, now, root);
  if (!signed) return;

  const payload: EventPayload = {
    kind,
    fingerprint,
    timestamp: now,
    ...signed,
    ...(meta ? { meta } : {}),
  };

  const fetchFn = opts.fetch ?? (globalThis.fetch as unknown as FetchFn);
  void postToRegistry(fetchFn, baseUrl, "/events", payload);
}
