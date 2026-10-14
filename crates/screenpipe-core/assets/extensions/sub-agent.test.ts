// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import { expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

function harness() {
  const children: any[] = [];
  const calls: { command: string; args: string[]; options: any }[] = [];
  const hooks = new Map<string, Function>();
  const signals = new Map<string, Function>();
  const killed: number[] = [];
  const fakeRequire = Object.assign((name: string) => {
    if (name === "child_process") return {
      spawn(command: string, args: string[], options: any) {
        calls.push({ command, args, options });
        const child = Object.assign(new EventEmitter(), {
          pid: children.length + 1,
          stdout: new EventEmitter(),
          stderr: new EventEmitter(),
          kill() {},
        });
        children.push(child);
        return child;
      },
    };
    if (name === "fs") return { existsSync: () => false };
    if (name === "path") return { join: (...parts: string[]) => parts.join("/") };
    throw new Error(`Unexpected module: ${name}`);
  }, { resolve: () => "fixture/pi-main.js" });
  const source = readFileSync(new URL("./sub-agent.ts", import.meta.url), "utf8");
  // The installed extension mixes CommonJS registration with an ESM default
  // export. Evaluate its CommonJS entry in an isolated process/require context;
  // no real exit handlers, child processes, or credentials enter this test.
  const code = new Bun.Transpiler({ loader: "ts" }).transformSync(
    source.replace(/^export default createSubAgentExtension;\r?$/m, ""),
  );
  const module = { exports: undefined as any };
  runInNewContext(code, {
    module,
    require: fakeRequire,
    process: {
      env: {}, pid: 100, cwd: () => "fixture",
      on: (event: string, handler: Function) => signals.set(event, handler),
      kill: (pid: number) => killed.push(pid), exit() {},
    },
    setTimeout, clearTimeout,
  });
  module.exports({ on: (event: string, handler: Function) => hooks.set(event, handler) });
  return {
    calls, children, killed,
    run: () => hooks.get("tool_call")!({ tool: "bash", input: { command: 'sub-agent run "fixture prompt"' } }),
    exit: () => signals.get("exit")!(),
  };
}

test("background sub-agent hides its window and returns piped stdout", async () => {
  const h = harness();
  const pending = h.run();
  h.children[0].stdout.emit("data", Buffer.from(" useful output\n"));
  h.children[0].emit("close", 0);
  const result = await pending;
  expect(h.calls[0].command).toBe("bun");
  expect(h.calls[0].options).toMatchObject({ windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  expect(result.content[0].text).toStartWith("useful output\n");
  expect(result.isError).toBeUndefined();
  h.exit();
  expect(h.killed).toEqual([]);
});

test("sub-agent retains stderr and launch failures and removes finished children", async () => {
  const h = harness();
  const pending = h.run();
  h.children[0].stderr.emit("data", Buffer.from("fixture failure"));
  h.children[0].emit("close", 7);
  const result = await pending;
  expect(result.isError).toBe(true);
  expect(result.content[0].text).toContain("Sub-agent exited with code 7: fixture failure");
  const failed = h.run();
  h.children[1].emit("error", new Error("spawn ENOENT"));
  const launchResult = await failed;
  expect(launchResult.isError).toBe(true);
  expect(launchResult.content[0].text).toContain("spawn ENOENT");
  h.exit();
  expect(h.killed).toEqual([]);
});
