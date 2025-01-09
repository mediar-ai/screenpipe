import { WindowEventEmitter } from "@/modules/event-management/emitter/infrastructure/event.emitter.window.service";
import TauriCliService from "../infrastructure/cli.tauri.service";

async function updateScreenpipeUseCase() { 
        const eventEmitterService = new WindowEventEmitter()
        const cliService = new TauriCliService(eventEmitterService)
        await cliService.update();
}

export default updateScreenpipeUseCase 