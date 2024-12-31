import { Command } from "@tauri-apps/plugin-shell";
import { ScreenpipeSetupParams } from "../types/screenpipe-setup-params";
import { ScreenpipeCliService } from "../interfaces/cli.service.interface";

class TauriCliService implements ScreenpipeCliService {
    async setup({enableBeta = false}: ScreenpipeSetupParams) {
          const command = Command.sidecar("screenpipe", getSetupParams(enableBeta));
    
          const timeoutPromise = timeout(900000, "setup timed out");
          const outputPromise = new Promise<string>((resolve, reject) => {
            command.on("close", (data) => {
              if (data.code !== 0) {
                reject(new Error(`command failed with code ${data.code}`));
              }
            });
            command.on("error", (error) => reject(new Error(error)));
            
            command.stdout.on("data", (line) => {
              window.dispatchEvent(new CustomEvent('command-update', { detail: line }));
              if (line.includes("screenpipe setup complete")) {
                resolve("ok");
              }
            });
          });
    
          try {
            await command.spawn();
            await Promise.race([outputPromise, timeoutPromise]);
          } catch (error) {
            console.error("error or timeout:", error);
          }
      };
}

export default TauriCliService