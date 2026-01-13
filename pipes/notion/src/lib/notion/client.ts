import {
  WorkLog,
  Intelligence,
  NotionCredentials,
  DailyReport,
} from "@/lib/types";
import {
  validateCredentials,
  syncWorkLog,
  syncIntelligence,
  syncDailyReport,
} from "./notion";

export class NotionClient {
  private credentials: NotionCredentials;

  constructor(credentials: NotionCredentials) {
    this.credentials = credentials;
  }

  static async validate(credentials: NotionCredentials): Promise<boolean> {
    return await validateCredentials(credentials);
  }

  async createLog(logEntry: WorkLog): Promise<string> {
    return await syncWorkLog(this.credentials, logEntry);
  }

  async createDailyReport(report: DailyReport): Promise<string> {
    return await syncDailyReport(this.credentials, report);
  }

  async createIntelligence(intelligence: Intelligence): Promise<string> {
    return await syncIntelligence(this.credentials, intelligence);
  }
}
