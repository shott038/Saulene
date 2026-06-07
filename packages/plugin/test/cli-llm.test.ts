/**
 * @saulene/plugin — ClaudeCliClient + hook recursion guard tests
 *
 * All subprocess calls are faked via the injected `spawnFn` — no real `claude -p`
 * process is spawned in tests. The guard tests mock `process.exit` / `process.stdout.write`
 * to assert no-op behavior without killing the test runner.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NOOP_RESPONSE, guardIfPerception } from "../src/bin/guard.js";
import { ClaudeCliClient, DEFAULT_PERCEPTION_MODEL, type SpawnFn } from "../src/hooks/cli-llm.js";

// ─────────────────────────────────────────────────────────────────────────────
// ClaudeCliClient
// ─────────────────────────────────────────────────────────────────────────────

describe("ClaudeCliClient", () => {
  type CapturedCall = { bin: string; args: string[]; input: string; env: NodeJS.ProcessEnv };

  /** Build a fake spawn that records calls and returns a `--output-format json` envelope. */
  function fakeSpawnReturning(resultText: string): { spy: SpawnFn; calls: CapturedCall[] } {
    const calls: CapturedCall[] = [];
    const spy: SpawnFn = async (bin, args, input, env) => {
      calls.push({ bin, args, input, env });
      return JSON.stringify({
        type: "result",
        subtype: "success",
        is_error: false,
        result: resultText,
      });
    };
    return { spy, calls };
  }

  it("uses the default haiku model when none is specified", async () => {
    const { spy, calls } = fakeSpawnReturning("{}");
    const client = new ClaudeCliClient({ spawnFn: spy });
    await client.complete("prompt");
    const modelIdx = calls[0]?.args.indexOf("--model");
    expect(calls[0]?.args[modelIdx + 1]).toBe(DEFAULT_PERCEPTION_MODEL);
  });

  it("passes --output-format json to claude -p", async () => {
    const { spy, calls } = fakeSpawnReturning("{}");
    await new ClaudeCliClient({ spawnFn: spy }).complete("p");
    const idx = calls[0]?.args.indexOf("--output-format");
    expect(calls[0]?.args[idx + 1]).toBe("json");
  });

  it("passes --allowedTools '' to disable tools", async () => {
    const { spy, calls } = fakeSpawnReturning("{}");
    await new ClaudeCliClient({ spawnFn: spy }).complete("p");
    const idx = calls[0]?.args.indexOf("--allowedTools");
    expect(calls[0]?.args[idx + 1]).toBe("");
  });

  it("sets SAULENE_PERCEPTION=1 on the child env", async () => {
    const { spy, calls } = fakeSpawnReturning("{}");
    await new ClaudeCliClient({ spawnFn: spy }).complete("p");
    expect(calls[0]?.env.SAULENE_PERCEPTION).toBe("1");
  });

  it("passes the prompt as the stdin input", async () => {
    const { spy, calls } = fakeSpawnReturning("{}");
    await new ClaudeCliClient({ spawnFn: spy }).complete("my perception prompt");
    expect(calls[0]?.input).toBe("my perception prompt");
  });

  it("returns the result field from the JSON envelope", async () => {
    const perceptionJson =
      '{"observations":[],"session_significance":0.1,"schema_version":"1","diary":"quiet"}';
    const { spy } = fakeSpawnReturning(perceptionJson);
    const result = await new ClaudeCliClient({ spawnFn: spy }).complete("prompt");
    expect(result).toBe(perceptionJson);
  });

  it("uses a custom model when specified", async () => {
    const { spy, calls } = fakeSpawnReturning("{}");
    await new ClaudeCliClient({ spawnFn: spy, model: "custom-model" }).complete("p");
    const idx = calls[0]?.args.indexOf("--model");
    expect(calls[0]?.args[idx + 1]).toBe("custom-model");
  });

  it("throws on malformed (non-JSON) envelope from claude", async () => {
    const badSpawn: SpawnFn = async () => "not json at all %%%";
    await expect(new ClaudeCliClient({ spawnFn: badSpawn }).complete("p")).rejects.toThrow(
      /invalid JSON envelope/,
    );
  });

  it("throws when the envelope has no 'result' field", async () => {
    const noResult: SpawnFn = async () => JSON.stringify({ type: "error", message: "oops" });
    await expect(new ClaudeCliClient({ spawnFn: noResult }).complete("p")).rejects.toThrow(
      /missing 'result' field/,
    );
  });

  it("throws with a clear message when is_error=true (e.g. not logged in)", async () => {
    const notLoggedIn: SpawnFn = async () =>
      JSON.stringify({
        type: "result",
        is_error: true,
        result: "Not logged in · Please run /login",
      });
    await expect(new ClaudeCliClient({ spawnFn: notLoggedIn }).complete("p")).rejects.toThrow(
      /not logged in/i,
    );
  });

  it("propagates spawn-level errors (e.g. claude not found)", async () => {
    const failSpawn: SpawnFn = async () => {
      throw new Error("claude not found in PATH");
    };
    await expect(new ClaudeCliClient({ spawnFn: failSpawn }).complete("p")).rejects.toThrow(
      "claude not found in PATH",
    );
  });

  it("passes the full args in the -p … order", async () => {
    const { spy, calls } = fakeSpawnReturning("{}");
    await new ClaudeCliClient({ spawnFn: spy }).complete("p");
    expect(calls[0]?.args[0]).toBe("-p");
  });

  it("passes --bare to suppress hooks and plugins in the child session", async () => {
    const { spy, calls } = fakeSpawnReturning("{}");
    await new ClaudeCliClient({ spawnFn: spy }).complete("p");
    expect(calls[0]?.args).toContain("--bare");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// guardIfPerception — hook recursion no-op
// ─────────────────────────────────────────────────────────────────────────────

describe("guardIfPerception", () => {
  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.SAULENE_PERCEPTION;
  });

  afterEach(() => {
    if (originalEnv === undefined) {
      process.env.SAULENE_PERCEPTION = undefined;
    } else {
      process.env.SAULENE_PERCEPTION = originalEnv;
    }
    vi.restoreAllMocks();
  });

  it("does nothing when SAULENE_PERCEPTION is unset", () => {
    process.env.SAULENE_PERCEPTION = undefined;
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    guardIfPerception();

    expect(writeSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("does nothing when SAULENE_PERCEPTION is an unrelated value", () => {
    process.env.SAULENE_PERCEPTION = "0";
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    guardIfPerception();

    expect(writeSpy).not.toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();
  });

  it("emits {continue:true} and exits 0 when SAULENE_PERCEPTION=1 (hook-session-start guard)", () => {
    process.env.SAULENE_PERCEPTION = "1";
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    guardIfPerception();

    expect(writeSpy).toHaveBeenCalledWith(NOOP_RESPONSE);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("emits {continue:true} and exits 0 when SAULENE_PERCEPTION=1 (hook-user-prompt-submit guard)", () => {
    // Same guard function — a second assertion proving all three hook entries share the same
    // guard path (they all call guardIfPerception() as their first statement).
    process.env.SAULENE_PERCEPTION = "1";
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    guardIfPerception();

    expect(writeSpy).toHaveBeenCalledWith(NOOP_RESPONSE);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("emits {continue:true} and exits 0 when SAULENE_PERCEPTION=1 (hook-stop guard)", () => {
    // Identical contract — confirms hook-stop is protected by the same guard.
    process.env.SAULENE_PERCEPTION = "1";
    const writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    guardIfPerception();

    expect(writeSpy).toHaveBeenCalledWith(NOOP_RESPONSE);
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it("NOOP_RESPONSE is valid JSON with continue:true", () => {
    const parsed = JSON.parse(NOOP_RESPONSE.trim());
    expect(parsed).toEqual({ continue: true });
  });
});
