import { WindowEventEmitter } from "@/modules/event-management/emitter/infrastructure/event.emitter.window.service";
import { ScreenpipeSetupParams } from "../types/screenpipe-setup-params";
import TauriCliService from "../infrastructure/cli.tauri.service";

async function downloadModelsUseCase(params: ScreenpipeSetupParams) { 
        const eventEmitterService = new WindowEventEmitter()
        const cliService = new TauriCliService(eventEmitterService)
        await cliService.setup(params);
}

export default downloadModelsUseCase