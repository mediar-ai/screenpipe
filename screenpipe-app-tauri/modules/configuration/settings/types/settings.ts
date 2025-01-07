import { z } from 'zod';
import { AvailableAiProviders, EmbeddedLLMConfigSchema } from './ai';
import { VadSensitivity } from './local-models';
import { AvailableLanguages } from '@/lib/language';
import { UserSchema } from './user';
import { PipeSchema } from './pipes';
import { AvailableShortcuts } from './shortcuts';

const CoreSettings = z.object({
  isLoading: z.boolean(),
  devMode: z.boolean(),
  audioTranscriptionEngine: z.string(),
  ocrEngine: z.string(),
  port: z.number(),
  dataDir: z.string(),
  disableAudio: z.boolean(),
  fps: z.number(),
  vadSensitivity: z.nativeEnum(VadSensitivity),
  analyticsEnabled: z.boolean(),
  audioChunkDuration: z.number(),
  useChineseMirror: z.boolean(),
  enableFrameCache: z.boolean(),
  enableUiMonitoring: z.boolean(),
  platform: z.string(),
  disabledShortcuts: z.array(z.nativeEnum(AvailableShortcuts)),
  showScreenpipeShortcut: z.string(),
  startRecordingShortcut: z.string(),
  stopRecordingShortcut: z.string(),
  languages: z.array(z.nativeEnum(AvailableLanguages)),
  enableBeta: z.boolean(),
})

const UserSettings = z.object({ 
  userId: z.string(),
  isFirstTimeUser: z.boolean(),
  user: UserSchema,
})

const AiSettings = z.object({
  aiProviderType: z.nativeEnum(AvailableAiProviders),
  openaiApiKey: z.string(),
  deepgramApiKey: z.string(),
  aiModel: z.string(),
  withAi: z.boolean(),
  customPrompt: z.string(),
  aiUrl: z.string(),
  aiMaxContextChars: z.number(),
  embeddedLLM: EmbeddedLLMConfigSchema,
  usePiiRemoval: z.boolean(),
  restartInterval: z.number(),
})

const PeripheralDevicesSettings = z.object({
  monitorIds: z.array(z.string()),
  ignoredWindows: z.array(z.string()),
  includedWindows: z.array(z.string()),
  audioDevices: z.array(z.string()),
})

const PipeSettings = z.object({
  installedPipes: z.array(PipeSchema),
})

export const SettingsSchema = PipeSettings.merge(CoreSettings).merge(UserSettings).merge(AiSettings).merge(PeripheralDevicesSettings)

export type SettingsType = z.infer<typeof SettingsSchema>;