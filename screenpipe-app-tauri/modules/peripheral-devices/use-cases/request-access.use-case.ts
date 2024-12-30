import { AvailablePeripheralDevices } from '../data-transfer-objects/available-devices';
import { OSPermissionsStatesPerDevice } from '../data-transfer-objects/permission-state-per-device';
import TauriPermissionsService from '../infrastructure/permissions.tauri.service';

async function requestAccessUseCase(
    device: AvailablePeripheralDevices
):  Promise<OSPermissionsStatesPerDevice> {
        const permissionsService = new TauriPermissionsService()

        await permissionsService.requestPermission({device});
        return permissionsService.checkPermissions({initialCheck: false});
}

export default requestAccessUseCase