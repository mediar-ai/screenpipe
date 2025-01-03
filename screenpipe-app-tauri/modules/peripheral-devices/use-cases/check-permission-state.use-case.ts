import TauriPermissionsService from '../infrastructure/permissions.tauri.service';
import { OSPermissionsStatesPerDevice } from '../types/permission-state-per-device';

async function checkPermissionStateUseCase():  Promise<OSPermissionsStatesPerDevice> {
        const permissionsService = new TauriPermissionsService()
        return permissionsService.checkPermissions({initialCheck: false});
}

export default checkPermissionStateUseCase