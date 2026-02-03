import os from "os";
import fs from "fs";
import path from "path";

export class Credentials {
  private static configDir = path.join(os.homedir(), ".screenpipe");
  private static configFile = path.join(this.configDir, "config-developer.json");

  static getApiKey(): string | null {
    try {
      if (!fs.existsSync(this.configFile)) {
        return null;
      }
      const config = JSON.parse(fs.readFileSync(this.configFile, "utf-8"));
      return config.apiKey || null;
    } catch (error) {
      return null;
    }
  }

  static setApiKey(apiKey: string, developerId: string): void {
    // Create .screenpipe directory if it doesn't exist
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir);
    }

    // Save API key to config file
    fs.writeFileSync(
      this.configFile,
      JSON.stringify(
        {
          apiKey,
          developerId,
        },
        null,
        2
      )
    );
  }

  static clearCredentials(): void {
    if (fs.existsSync(this.configFile)) {
      fs.unlinkSync(this.configFile);
    }
  }
}
