export const PermissionState = {
  /**
   * @description  This platform does not require this permission
   */
  notNeeded: "notNeeded",
  /**
   * @description The user has neither granted nor denied permission
   */
  empty: "empty",
  /**
   * @description The user has explicitly granted permission
   */
  granted: "granted",
  /**
   * @description The user has denied permission, or has granted it but not yet restarted
   */
  denied: "denied"
} as const

export type OSPermissionStatusEnum = (typeof PermissionState)[keyof typeof PermissionState];