import { AvailablePeripheralDevices } from "../data-transfer-objects/available-devices";
import { OSPermissionsStatesPerDevice } from "../data-transfer-objects/permission-state-per-device";

export interface PermissionsService {
    requestPermission({ device }: {device: AvailablePeripheralDevices }): Promise<void>;
    checkPermissions({ initialCheck } : { initialCheck: boolean }): Promise<OSPermissionsStatesPerDevice>;
}