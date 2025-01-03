import { Command } from "@tauri-apps/plugin-shell";
import { ScreenpipeSetupParams } from "../types/screenpipe-setup-params";
import { ScreenpipeCliService } from "../interfaces/cli.service.interface";
import { EventEmitter } from "@/modules/event-management/emitter/interfaces/event-emitter.service.interface";
import { invoke } from "@tauri-apps/api/core";
import { getSetupParams, timeout } from "../utils/cli.service.utils";

class TauriCliService implements ScreenpipeCliService {
    constructor(
        private readonly eventEmitterService: EventEmitter,
    ) {}
    
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
          this.eventEmitterService.emit('command-update', line)
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

    async spawn(): Promise<void> {
      try {
        await invoke("spawn_screenpipe");
        console.log("Command executed successfully");
      } catch (error) {
        console.error("Command failed:", error);
      }
    }
}

export default TauriCliService