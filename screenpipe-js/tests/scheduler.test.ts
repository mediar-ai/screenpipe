import {
  assertSpyCall,
  assertSpyCallArgs,
  assertSpyCalls,
  type MethodSpy,
  spy,
} from "jsr:@std/testing/mock";
import { pipe } from "../main.ts";
import { afterEach, beforeEach, describe, it } from "jsr:@std/testing/bdd";
// @ts-types="npm:@types/node-cron"
import cron from "npm:node-cron";
import { retry } from "jsr:@std/async/retry";
import { assertGreaterOrEqual, assertLessOrEqual } from "jsr:@std/assert@^1.0.6";

describe("Scheduler", () => {
  let cronSpy: MethodSpy<
    typeof cron,
    Parameters<typeof cron.schedule>,
    ReturnType<typeof cron.schedule>
  >;

  beforeEach(async () => {
    cronSpy = await spy(cron, "schedule");
  });

  afterEach(() => {
    cronSpy.restore();
    pipe.scheduler.stop();
  });

  it("Scheduler - task execution", async () => {
    const scheduler = pipe.scheduler;
    const mockTask = spy(() => Promise.resolve());

    scheduler.task("testTask").every("1 second").do(mockTask);

    // Validate the cron job was not scheduled yet
    assertSpyCalls(cronSpy, 0);

    // Register the routes on node-cron
    scheduler.start();

    // Validate the cron jobs were scheduled
    assertSpyCall(cronSpy, 0);
    assertSpyCallArgs(cronSpy, 0, ["*/1 * * * * *", mockTask, {
      name: "testTask",
    }]);

    // retry until the task runs
    await retry(() => {
      assertSpyCalls(mockTask, 1);
    }, {
      maxAttempts: 10,
      maxTimeout: 1000,
      minTimeout: 200,
    });
  });

  it("multiple tasks", async () => {
    const scheduler = pipe.scheduler;
    const mockTask1 = spy(() => Promise.resolve());
    const mockTask2 = spy(() => Promise.resolve());

    scheduler.task("task1").every("1 second").do(mockTask1);

    scheduler.task("task2").every("2 seconds").do(mockTask2);

    // Validate the cron jobs were not scheduled yet
    assertSpyCalls(cronSpy, 0);

    // Register the routes on node-cron
    scheduler.start();

    // Validate the cron jobs were scheduled
    assertSpyCalls(cronSpy, 2);
    assertSpyCallArgs(cronSpy, 0, ["*/1 * * * * *", mockTask1, {
      name: "task1",
    }]);
    assertSpyCallArgs(cronSpy, 1, ["*/2 * * * * *", mockTask2, {
      name: "task2",
    }]);

    // IMPORTANT: The assertions as below are not deterministic, thus we need to retry
    // Retrying is an optimized way of `await setTimeout(xTime)` until the condition is met
    // Avoid checking literal values, e.g., mockTask1.calls.length === 1 && mockTask2.calls.length === 0
    // Instead, use `assertGreaterOrEqual` or `assertLessOrEqual` to make the test more resilient
    // and avoid flakiness

    // retry until the first task runs
    // and ensure the second was not called yet
    await retry(() => {
      // 1 sec job was called at least once
      assertGreaterOrEqual(mockTask1.calls.length, 1);
      // 2 sec job was called half the times of the 1 sec job (or less)  
      assertLessOrEqual(mockTask2.calls.length, Math.ceil(mockTask1.calls.length / 2));
    }, {
      maxAttempts: 10,
      maxTimeout: 1000,
      minTimeout: 100,
    });

    // retry a bunch of times until the second task is called
    await retry(() => {
      // 2 sec job was called at least once
      assertGreaterOrEqual(mockTask2.calls.length, 1);
      // 1 sec job was called at least twice the times of the 2 sec job
      assertGreaterOrEqual(mockTask1.calls.length, mockTask2.calls.length * 2);
    }, {
      maxAttempts: 10,
      maxTimeout: 1000,
      minTimeout: 100,
    });
  });
});
