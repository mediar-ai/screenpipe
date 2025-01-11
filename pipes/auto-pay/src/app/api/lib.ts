import { pipe } from "@screenpipe/js";

export const getAutoPaySettings = async () => {
    const settingsManager = pipe.settings;
    const namespaceSettings = await settingsManager?.getNamespaceSettings(
      'auto-pay'
    );
    


    return {
        wiseApiKey: namespaceSettings?.wiseApiKey || process.env.WISE_API_KEY,
        wiseProfileId: namespaceSettings?.wiseProfileId || process.env.WISE_PROFILE_ID,
        mercuryApiKey: namespaceSettings?.mercuryApiKey || process.env.MERCURY_API_KEY,
        mercuryAccountId: namespaceSettings?.mercuryAccountId || process.env.MERCURY_ACCOUNT_ID,
        enableProduction: namespaceSettings?.enableProduction || process.env.ENABLE_PRODUCTION,
    };
}