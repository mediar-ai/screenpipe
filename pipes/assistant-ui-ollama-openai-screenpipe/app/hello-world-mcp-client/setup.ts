import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load environment variables
export async function setupEnvironment() {
  // First try loading from .env file
  dotenv.config();

  // Check if API key is set
  if (!process.env.ANTHROPIC_API_KEY) {
    // Try to load from config file
    const configDir = path.join(process.env.HOME || "", ".screenpipe");
    const configPath = path.join(configDir, "config.json");

    if (fs.existsSync(configPath)) {
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        if (config.anthropicApiKey) {
          process.env.ANTHROPIC_API_KEY = config.anthropicApiKey;
        }
      } catch (error) {
        console.error("error loading config:", error);
      }
    }

    // If still not set, show error
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error(
        "missing ANTHROPIC_API_KEY - please set in .env file or config.json"
      );
      process.exit(1);
    }
  }

  // make request to localhost:3030, if the API is not running tell user to run screenpipe CLI first
  const fn = async () => {
    const response = await fetch("http://localhost:3030/health");
    const data = await response.json();

    if (response.status !== 200) {
      console.error(
        "Screenpipe API is not running - please run screenpipe CLI first"
      );
      process.exit(1);
    }
  };
  await fn();
}
