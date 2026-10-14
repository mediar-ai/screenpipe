// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com

import { afterEach, expect, mock, test } from "bun:test";
import { EventEmitter } from "node:events";

const originalSubagent = process.env.SCREENPIPE_SUBAGENT;

afterEach(() => {
  mock.restore();
  if (originalSubagent === undefined) delete process.env.SCREENPIPE_SUBAGENT;
  else process.env.SCREENPIPE_SUBAGENT = originalSubagent;
});

function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    pid: number;
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: ReturnType<typeof mock>;
  };
  child.pid = 4242;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = mock(() => true);
  return child;
}

test("sub-agent hides Bun while preserving piped output and errors", async () => {
  delete process.env.SCREENPIPE_SUBAGENT;
  const child = fakeChild();
  let options: Record<string, unknown> | undefined;
  const spawn = mock((_command: string, _args: string[], value: Record<string, unknown>) => {
    options = value;
    return child;
  });
  (globalThis as any).module = { exports: {} };
  const { spawnSubAgent } = await import(`./sub-agent.ts?test=${Date.now()}`);
  const pending = spawnSubAgent("inspect safely", spawn, "pi-main.js");
  expect(options).toMatchObject({
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  child.stdout.emit("data", Buffer.from("useful output\n"));
  child.emit("close", 0);
  expect(await pending).toBe("useful output");

  const failedChild = fakeChild();
  spawn.mockImplementation(() => failedChild as any);
  const failed = spawnSubAgent("fail safely", spawn, "pi-main.js");
  failedChild.stderr.emit("data", Buffer.from("private implementation failed"));
  failedChild.emit("close", 7);
  await expect(failed).rejects.toThrow("Sub-agent exited with code 7: private implementation failed");
});
