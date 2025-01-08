import { Task } from "./Task";
import cron from "node-cron";

export class Scheduler {
  private tasks: Task[] = [];

  constructor() {}

  task(name: string): Task {
    const task = new Task(name);
    this.tasks.push(task);
    return task;
  }

  start() {
    this.tasks.forEach((task) => task.schedule());
  }

  async stop(): Promise<void> {
    cron.getTasks().forEach((task: any) => task.stop());

    this.tasks = [];
  }
}
