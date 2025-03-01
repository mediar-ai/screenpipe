import {
  WorkLog,
  Intelligence,
  NotionCredentials,
} from "@/lib/types";
import {
  validateCredentials,
  syncWorkLog,
  syncIntelligence,
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

  async createIntelligence(intelligence: Intelligence): Promise<string> {
    return await syncIntelligence(this.credentials, intelligence);
  }
}
