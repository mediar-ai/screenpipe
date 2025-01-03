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
  denied: "denied",
} as const

export type PermissionStateEnum = (typeof PermissionState)[keyof typeof PermissionState];

export const PermissionStateWithUIRelatedStates = {
  ...PermissionState,
  /**
   * @description The user skipped granting permissions during onboarding flow.
   */
  skipped: 'skipped',
  /**
   * @description User triggered action to grant or check permission and its not done yet.
   */
  pending: 'pending'
} as const

export type PermissionStateWithUIRelatedStatesEnum = (typeof PermissionStateWithUIRelatedStates)[keyof typeof PermissionStateWithUIRelatedStates];