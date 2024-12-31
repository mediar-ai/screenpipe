import { WindowEventEmitter } from "@/modules/event-management/emitter/infrastructure/event.emitter.window.service";
import { ScreenpipeSetupParams } from "../types/screenpipe-setup-params";
import TauriCliService from "../infrastructure/cli.tauri.service";

async function requestAccessUseCase(params: ScreenpipeSetupParams) {
        const eventEmitterService = new WindowEventEmitter()
        const permissionsService = new TauriCliService(eventEmitterService)
        await permissionsService.setup(params);
}

export default requestAccessUseCase