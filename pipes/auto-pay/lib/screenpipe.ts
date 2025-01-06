import { pipe } from '@screenpipe/js';
import type { Settings } from '@screenpipe/js';

export const getScreenpipeSettings = async (): Promise<Settings> => {
  const settings = await pipe.settings.getAll();
  const customSettings = await pipe.settings.getNamespaceSettings('auto-pay');
  console.log({ settings, customSettings });
  return settings;
};
