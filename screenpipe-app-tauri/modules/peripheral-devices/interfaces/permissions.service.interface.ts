import { AvailablePeripheralDevicesEnum } from "../types/available-devices";
import { OSPermissionsStatesPerDevice } from "../types/permission-state-per-device";

type RequestPermissionParams = { 
    /**
     * @description: string that represents one of the available peripheral devices.
     */
    device: AvailablePeripheralDevicesEnum 
}

/**
 * @description A service to manage peripheral device permissions.
 */
export interface PermissionsService {
    /**
     * @description requests permission for a specific peripheral device.
     * @returns {Promise<void>} a promise that resolves once request permission call to os has been made.
    */
    requestPermission({ device }: RequestPermissionParams): Promise<void>;
    checkPermissions({ initialCheck } : { initialCheck: boolean }): Promise<OSPermissionsStatesPerDevice>;
}
