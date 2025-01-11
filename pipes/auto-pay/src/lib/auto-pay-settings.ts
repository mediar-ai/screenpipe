import type { Settings } from '@/types/settings';
import type { PaymentMethod } from '@/types/payment';

interface ConfigurationStatus {
  isAnyConfigured: boolean;
  availableMethods: PaymentMethod[];
  mercury: {
    isConfigured: boolean;
    missing: string[];
  };
  wise: {
    isConfigured: boolean;
    missing: string[];
  };
}

export function getConfigurationStatus(settings?: Settings): ConfigurationStatus {
  const autoPaySettings = settings?.customSettings?.['auto-pay'];
  const mercuryMissing: string[] = [];
  const wiseMissing: string[] = [];

  // Check Mercury configuration
  if (!autoPaySettings?.mercuryApiKey) mercuryMissing.push('API Key');
  if (!autoPaySettings?.mercuryAccountId) mercuryMissing.push('Account ID');


  const mercuryConfigured = mercuryMissing.length === 0;
  const wiseConfigured = wiseMissing.length === 0;

  const availableMethods: PaymentMethod[] = [];
  if (mercuryConfigured) availableMethods.push('mercury');
  if (wiseConfigured) availableMethods.push('wise');

  return {
    isAnyConfigured: mercuryConfigured || wiseConfigured,
    availableMethods,
    mercury: {
      isConfigured: mercuryConfigured,
      missing: mercuryMissing,
    },
    wise: {
      isConfigured: wiseConfigured,
      missing: wiseMissing,
    },
  };
}

