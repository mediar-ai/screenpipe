"use server";
import fs from "node:fs";
import process from "node:process";
import { DailyLog } from "@/lib/types";

export default async function saveDailyLog(logEntry: DailyLog): Promise<void> {
  console.log("creating logs dir");
  const logsDir = `${process.env.PIPE_DIR}/logs` || `${process.cwd()}/logs`;
  console.log("saving log entry:", logEntry);
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "");
  const filename = `${timestamp}-${logEntry.category.replace("/", "-")}.json`;
  try {
    fs.writeFileSync(`${logsDir}/${filename}`, JSON.stringify(logEntry, null, 2));
  } catch (error) {
    throw new Error(`Failed to write log file ${error}`);
  }
}
