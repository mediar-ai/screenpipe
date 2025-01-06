import { pipe } from '@screenpipe/js';
import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function updatePipeConfig(settings: any) {
  try {
    const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
    const pipeConfigPath = path.join(screenpipeDir, 'pipes', 'auto-pay', 'pipe.json');
    const settingsPath = path.join(screenpipeDir, 'pipes', 'auto-pay', 'settings.json');

    console.log('0xHypr', 'updating pipe config at:', pipeConfigPath);

    let config: any = {};
    let persistedSettings: any = {};

    try {
      const content = await fs.readFile(pipeConfigPath, 'utf8');
      config = JSON.parse(content);
    } catch (err) {
      console.log('0xHypr', 'no existing config found, creating new one');
      config = {
        name: 'auto-pay-pipe',
        version: '0.1.0',
        fields: []
      };
    }

    try {
      const settingsContent = await fs.readFile(settingsPath, 'utf8');
      persistedSettings = JSON.parse(settingsContent);
    } catch (err) {
      console.log('0xHypr', 'no existing settings found, creating new one');
      persistedSettings = {};
    }

    // Merge new settings with persisted settings
    const updatedSettings = { ...persistedSettings, ...settings };
    await fs.writeFile(settingsPath, JSON.stringify(updatedSettings, null, 2));

    // Update pipe config if needed
    await fs.writeFile(pipeConfigPath, JSON.stringify(config, null, 2));
    
    console.log('0xHypr', 'updated pipe config successfully');
  } catch (err) {
    console.error('failed to update pipe config:', err);
    throw err;
  }
}

export async function GET() {
    console.log('0xHypr', 'shello');
  if (!pipe) {
    return NextResponse.json({ error: 'pipe not found' }, { status: 500 });
  }
  try {
    const settingsManager = pipe.settings;
    if (!settingsManager) {
      throw new Error('settingsManager not found');
    }

    // Load persisted settings if they exist
    const screenpipeDir = process.env.SCREENPIPE_DIR || process.cwd();
    const settingsPath = path.join(screenpipeDir, 'pipes', 'auto-pay', 'settings.json');

    console.log('0xHypr', { settingsPath })
    try {
    //   const settingsContent = await fs.readFile(settingsPath, 'utf8');
    //   const persistedSettings = JSON.parse(settingsContent);
    //   console.log('0xHypr', { persistedSettings })

      // Merge with current settings
      const rawSettings = await settingsManager.getAll();
      const namespaceSettings = await settingsManager.getNamespaceSettings('auto-pay');
      const customSettings = {
        wiseApiKey: namespaceSettings?.wiseApiKey || process.env.WISE_API_KEY,
        wiseProfileId: namespaceSettings?.wiseProfileId || process.env.WISE_PROFILE_ID,
        enableProduction: namespaceSettings?.enableProduction || process.env.NEXT_PUBLIC_USE_PRODUCTION === 'true',
      }
      console.log('0xHypr', { customSettings })

      console.log('0xHypr', { rawSettings })

      return NextResponse.json({
        ...rawSettings,
        customSettings: {
          ...rawSettings.customSettings,
          'auto-pay': {
            ...(rawSettings.customSettings?.['auto-pay'] || {}),
            ...customSettings,
            // ...persistedSettings,
          },
        },
      });
    } catch (err) {
      // If no persisted settings, return normal settings
      const rawSettings = await settingsManager.getAll();
      return NextResponse.json(rawSettings);
    }
  } catch (error) {
    console.error('failed to get settings:', error);
    return NextResponse.json({ error: 'failed to get settings' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const settingsManager = pipe.settings;
    if (!settingsManager) {
      throw new Error('settingsManager not found');
    }

    const body = await request.json();
    const { key, value, isPartialUpdate, reset, namespace } = body;

    // Handle auto-pay namespace updates
    if (namespace === 'auto-pay' && isPartialUpdate) {
      await updatePipeConfig(value);
    }

    if (reset) {
      if (namespace) {
        if (key) {
          await settingsManager.setCustomSetting(namespace, key, undefined);
        } else {
          await settingsManager.updateNamespaceSettings(namespace, {});
        }
      } else {
        if (key) {
          await settingsManager.resetKey(key);
        } else {
          await settingsManager.reset();
        }
      }
      return NextResponse.json({ success: true });
    }

    if (namespace) {
      if (isPartialUpdate) {
        const currentSettings = (await settingsManager.getNamespaceSettings(namespace)) || {};
        await settingsManager.updateNamespaceSettings(namespace, {
          ...currentSettings,
          ...value,
        });
      } else {
        await settingsManager.setCustomSetting(namespace, key, value);
      }
    } else if (isPartialUpdate) {
      const serializedSettings = JSON.parse(JSON.stringify(value));
      await settingsManager.update(serializedSettings);
    } else {
      const serializedValue = JSON.parse(JSON.stringify(value));
      await settingsManager.set(key, serializedValue);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('failed to update settings:', error);
    return NextResponse.json({ error: 'failed to update settings' }, { status: 500 });
  }
}
