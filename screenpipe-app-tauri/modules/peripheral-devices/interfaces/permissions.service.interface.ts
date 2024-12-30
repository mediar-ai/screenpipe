import { AvailablePeripheralDevicesEnum } from "../types/available-devices";
import { OSPermissionsStatesPerDevice } from "../types/permission-state-per-device";

export interface PermissionsService {
    requestPermission({ device }: {device: AvailablePeripheralDevicesEnum }): Promise<void>;
    checkPermissions({ initialCheck } : { initialCheck: boolean }): Promise<OSPermissionsStatesPerDevice>;
}