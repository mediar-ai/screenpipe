import { describe, expect, test, mock, beforeEach, afterEach } from "bun:test";
import { pipe } from "../main";
import cron from "node-cron";

describe("Scheduler", () => {
  let cronSpy: any;
  let scheduledTasks: { expression: string; handler: () => Promise<void>; options: any }[] = [];

  beforeEach(() => {
    scheduledTasks = [];
    cronSpy = mock((expression: string, handler: () => Promise<void>, options: any) => {
      scheduledTasks.push({ expression, handler, options });
      return {
        stop: () => {},
      };
    });
    // @ts-ignore
    cron.schedule = cronSpy;
  });

  afterEach(() => {
    mock.restore();
    pipe.scheduler.stop();
    scheduledTasks = [];
  });

  test("Scheduler - task execution", async () => {
    const scheduler = pipe.scheduler;
    const mockTask = mock(() => Promise.resolve());

    scheduler.task("testTask").every("1 second").do(mockTask);
    scheduler.start();

    expect(cronSpy).toHaveBeenCalledTimes(1);
    expect(cronSpy).toHaveBeenCalledWith("*/1 * * * * *", mockTask, {
      name: "testTask",
    });

    // Execute the scheduled task handler
    await scheduledTasks[0].handler();
    expect(mockTask).toHaveBeenCalled();
  });

  test("multiple tasks", async () => {
    const scheduler = pipe.scheduler;
    const mockTask1 = mock(() => Promise.resolve());
    const mockTask2 = mock(() => Promise.resolve());

    scheduler.task("task1").every("1 second").do(mockTask1);
    scheduler.task("task2").every("2 seconds").do(mockTask2);
    scheduler.start();

    expect(cronSpy).toHaveBeenCalledTimes(2);
    expect(cronSpy).toHaveBeenNthCalledWith(1, "*/1 * * * * *", mockTask1, {
      name: "task1",
    });
    expect(cronSpy).toHaveBeenNthCalledWith(2, "*/2 * * * * *", mockTask2, {
      name: "task2",
    });

    // Execute both task handlers
    await scheduledTasks[0].handler();
    await scheduledTasks[1].handler();

    expect(mockTask1).toHaveBeenCalled();
    expect(mockTask2).toHaveBeenCalled();
  });
});
