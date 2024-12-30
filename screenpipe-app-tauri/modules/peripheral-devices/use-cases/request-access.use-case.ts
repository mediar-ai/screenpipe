import TauriPermissionsService from '../infrastructure/permissions.tauri.service';
import { AvailablePeripheralDevicesEnum } from '../types/available-devices';
import { OSPermissionsStatesPerDevice } from '../types/permission-state-per-device';

async function requestAccessUseCase(
    device: AvailablePeripheralDevicesEnum
):  Promise<OSPermissionsStatesPerDevice> {
        const permissionsService = new TauriPermissionsService()

        await permissionsService.requestPermission({device});
        return permissionsService.checkPermissions({initialCheck: false});
}

export default requestAccessUseCase