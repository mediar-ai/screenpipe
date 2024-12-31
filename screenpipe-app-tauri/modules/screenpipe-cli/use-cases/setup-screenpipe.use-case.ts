import TauriCliService from "../infrastructure/cli.tauri.service";
import { ScreenpipeSetupParams } from "../types/screenpipe-setup-params";

async function requestAccessUseCase(params: ScreenpipeSetupParams) {
        const permissionsService = new TauriCliService()
        await permissionsService.setup(params);
}

export default requestAccessUseCase