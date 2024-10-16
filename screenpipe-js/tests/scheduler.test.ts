import { assertEquals } from "jsr:@std/assert";
import { assertSpyCall, spy } from "jsr:@std/testing/mock";
import { pipe } from "../main.ts";

Deno.test("Scheduler - task execution", async () => {
  const scheduler = pipe.scheduler;
  const mockTask = spy(() => Promise.resolve());

  scheduler.task("testTask").every("1 minute").do(mockTask);

  // Mock the Date object to control time
  const originalDate = Date;
  const mockDate = new Date("2023-01-01T00:00:00Z");
  // @ts-ignore: Overriding Date for testing purposes
  Date = class extends Date {
    constructor() {
      super();
      return mockDate;
    }
    static override now() {
      return mockDate.getTime();
    }
  };

  // Start the scheduler
  const schedulerPromise = scheduler.start();

  // Advance time by 1 minute and wait a bit longer
  await new Promise((resolve) => setTimeout(resolve, 100));
  mockDate.setMinutes(mockDate.getMinutes() + 1);
  await new Promise((resolve) => setTimeout(resolve, 100)); // Add this line

  // Stop the scheduler after a longer delay
  setTimeout(() => {
    scheduler.stop();
  }, 500); // Increase this delay

  await schedulerPromise;

  // Restore the original Date object
  Date = originalDate;

  // Assert that the task was called
  assertSpyCall(mockTask, 0);
});

Deno.test("Scheduler - multiple tasks", async () => {
  const scheduler = pipe.scheduler;
  const mockTask1 = spy(() => Promise.resolve());
  const mockTask2 = spy(() => Promise.resolve());

  scheduler.task("task1").every("1 minute").do(mockTask1);

  scheduler.task("task2").every("2 minutes").do(mockTask2);

  // Mock the Date object
  const originalDate = Date;
  const mockDate = new Date("2023-01-01T00:00:00Z");
  // @ts-ignore: Overriding Date for testing purposes
  Date = class extends Date {
    constructor() {
      super();
      return mockDate;
    }
    static override now() {
      return mockDate.getTime();
    }
  };

  // Start the scheduler
  const schedulerPromise = scheduler.start();

  // Advance time by 2 minutes and wait a bit longer
  await new Promise((resolve) => setTimeout(resolve, 100));
  mockDate.setMinutes(mockDate.getMinutes() + 2);
  await new Promise((resolve) => setTimeout(resolve, 100)); // Add this line

  // Stop the scheduler after a longer delay
  setTimeout(() => {
    scheduler.stop();
  }, 500); // Increase this delay

  await schedulerPromise;

  // Restore the original Date object
  Date = originalDate;

  // Assert that tasks were called at least the expected number of times
  assertEquals(mockTask1.calls.length >= 2, true);
  assertEquals(mockTask2.calls.length >= 1, true);
});

// deno test screenpipe-js/tests/scheduler.test.ts
