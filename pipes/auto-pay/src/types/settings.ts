export interface MercurySettings {
  mercuryApiKey?: string;
  mercuryAccountId?: string;
}

export interface AutoPaySettings {
  mercuryApiKey?: string;
  mercuryAccountId?: string;
  enableProduction?: boolean;
}

export interface CustomSettings {
  [key: string]: AutoPaySettings;
}

export interface Settings {
  openaiApiKey?: string;
  customSettings?: CustomSettings;
}

// Show onboarding dialog when no provider is configured
export interface UpdateSettingsParams {
  namespace: string;
  isPartialUpdate: boolean;
  value: Partial<AutoPaySettings>;
}
