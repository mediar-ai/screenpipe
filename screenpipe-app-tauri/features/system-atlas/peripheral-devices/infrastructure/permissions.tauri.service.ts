import { invoke } from "@tauri-apps/api/core";
import { PermissionsService } from "../interfaces/permissions.service.interface";
import { AvailablePeripheralDevices } from "../data-transfer-objects/available-devices";
import { OSPermissionsStatesPerDevice } from "../data-transfer-objects/permission-state-per-device";

class TauriPermissionsService implements PermissionsService {
    async requestPermission({ device }: {device: AvailablePeripheralDevices }): Promise<void> {
      return await invoke("request_permission", { permission: device });
    }
  
    async checkPermissions({ initialCheck } : { initialCheck: boolean }): Promise<OSPermissionsStatesPerDevice> {
      return invoke("do_permissions_check", { initialCheck });
    }
}

export default TauriPermissionsService