import TauriPermissionsService from '../infrastructure/permissions.tauri.service';
import { AvailablePeripheralDevicesEnum } from '../types/available-devices';

async function requestAccessUseCase(device: AvailablePeripheralDevicesEnum) {
        const permissionsService = new TauriPermissionsService()
        await permissionsService.requestPermission({device});
}

export default requestAccessUseCase