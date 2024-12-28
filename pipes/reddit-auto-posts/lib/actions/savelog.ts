"use server";
import fs from "node:fs";
import process from "node:process";
import { DailyLog } from "@/lib/types";

export default async function saveDailyLog(logEntry: DailyLog): Promise<void> {
  console.log("creating logs dir");
  const logsDir = `${process.env.PIPE_DIR}/logs` || `${process.cwd()}/logs`;
  console.log("logs dir:", logsDir);
  console.log("saving log entry:", logEntry);
  console.log("logs dir:", logsDir);
  const timestamp = new Date()
    .toISOString()
    .replace(/:/g, "-")
    .replace(/\..+/, "");
  const filename = `${timestamp}-${logEntry.category.replace("/", "-")}.json`;
  console.log("filename:", filename);
  fs.writeFileSync(`${logsDir}/${filename}`, JSON.stringify(logEntry, null, 2));
}
