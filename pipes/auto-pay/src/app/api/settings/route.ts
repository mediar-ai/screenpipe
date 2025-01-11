import { pipe } from '@screenpipe/js';
import { NextResponse } from 'next/server';
import path from 'path';
import type { Settings } from '@/types/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  if (!pipe) {
    return NextResponse.json({ error: 'pipe not found' }, { status: 500 });
  }

  try {
    const settingsManager = pipe.settings;
    if (!settingsManager) {
      throw new Error('settingsManager not found');
    }

    // Load all settings
    const settings = await settingsManager.getAll();

    // openaiApiKey: value.openaiApiKey || process.env.OPENAI_API_KEY,
    console.log('settings', settings);
    console.log('process.env.OPENAI_API_KEY', process.env.OPENAI_API_KEY);
    return NextResponse.json({
      ...settings,
      openaiApiKey: settings.openaiApiKey || process.env.OPENAI_API_KEY,
    });
  } catch (error) {
    console.error('Failed to get settings:', error);
    return NextResponse.json(
      { error: 'Failed to get settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  if (!pipe) {
    return NextResponse.json({ error: 'pipe not found' }, { status: 500 });
  }

  try {
    const settingsManager = pipe.settings;
    if (!settingsManager) {
      throw new Error('settingsManager not found');
    }

    const params = (await request.json()) as UpdateSettingsParams;
    const { namespace, value, isPartialUpdate } = params;

    if (isPartialUpdate) {
      // Get current namespace settings
      const currentSettings =
        (await settingsManager.getNamespaceSettings(namespace)) || {};

      // Update with new values
      await settingsManager.updateNamespaceSettings(namespace, {
        ...currentSettings,
        ...value,
      });
    } else {
      // Replace entire namespace settings
      await settingsManager.updateNamespaceSettings(namespace, value);
    }

    // Return updated settings
    const settings = await settingsManager.getAll();
    return NextResponse.json(settings);
  } catch (error) {
    console.error('Failed to update settings:', error);
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    );
  }
}
