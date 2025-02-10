import { Button } from './ui/button'
import { toast, useToast } from './ui/use-toast'
import { Upload, Loader, Copy, X } from 'lucide-react'
import { readTextFile } from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { useState, useEffect } from 'react'
import { useCopyToClipboard } from '@/lib/hooks/use-copy-to-clipboard'
import { useSettings } from '@/lib/hooks/use-settings'
import { getVersion } from '@tauri-apps/api/app'
import { version as osVersion, platform as osPlatform } from '@tauri-apps/plugin-os'

interface LogFile {
  name: string
  path: string
  modified_at: number
}

const ShareLinkDisplay = ({
  shareLink,
  onCopy,
  onClose,
}: {
  shareLink: string
  onCopy: () => void
  onClose: () => void
}) => {
  return (
    <div className='flex items-center gap-2 bg-secondary/30 px-3 py-2 rounded-lg border border-secondary animate-in fade-in slide-in-from-top-4'>
      <div className='flex items-center gap-2 flex-1'>
        <div className='h-2 w-2 bg-green-500 rounded-full animate-pulse' />
        <span className='text-sm font-mono'>{shareLink}</span>
      </div>
      <div className='flex items-center gap-1.5'>
        <Button
          variant='ghost'
          size='icon'
          className='h-7 w-7 hover:bg-secondary/50 transition-colors'
          onClick={onCopy}
          title='Copy share link'
        >
          <Copy className='h-3.5 w-3.5' />
        </Button>
        <Button
          variant='ghost'
          size='icon'
          className='h-7 w-7 hover:bg-secondary/50 transition-colors text-muted-foreground'
          onClick={onClose}
          title='Dismiss'
        >
          <X className='h-3.5 w-3.5' />
        </Button>
      </div>
    </div>
  )
}

export const ShareLogsButton = () => {
  const { toast } = useToast()
  const { copyToClipboard } = useCopyToClipboard({ timeout: 3000 })
  const { settings } = useSettings()
  const [isSending, setIsSending] = useState(false)
  const [shareLink, setShareLink] = useState('')
  const [machineId, setMachineId] = useState('')

  useEffect(() => {
    const loadMachineId = async () => {
      let id = localStorage.getItem('machineId')
      if (!id) {
        id = crypto.randomUUID()
        localStorage.setItem('machineId', id)
      }
      setMachineId(id)
    }
    loadMachineId()
  }, [])

  const getLogFiles = async () => {
    try {
      const logFiles = await invoke('get_log_files')
      return logFiles as LogFile[]
    } catch (error) {
      console.error('failed to get log files:', error)
      return []
    }
  }

  const sendLogs = async () => {
    const logFiles = await getLogFiles()
    if (!logFiles.length) return

    setIsSending(true)
    try {
      const BASE_URL = 'https://screenpi.pe'
      const identifier = settings.user?.id || machineId
      const type = settings.user?.id ? 'user' : 'machine'

      // Get all log contents
      const logContents = await Promise.all(
        logFiles.map(async (file) => ({
          name: file.name,
          content: await readTextFile(file.path),
        }))
      )

      const consoleLog = localStorage.getItem('console_logs') || ''

      const signedRes = await fetch(`${BASE_URL}/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, type }),
      })

      const {
        data: { signedUrl, path },
      } = await signedRes.json()

      const combinedLogs =
        logContents
          .map((log) => `\n=== ${log.name} ===\n${log.content}`)
          .join('\n\n') +
        '\n\n=== Browser Console Logs ===\n' +
        consoleLog

      await fetch(signedUrl, {
        method: 'PUT',
        body: combinedLogs,
        headers: { 'Content-Type': 'text/plain' },
      })

      const os = osPlatform()
      const os_version = osVersion()
      const app_version = await getVersion()

      const confirmRes = await fetch(`${BASE_URL}/api/logs/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path,
          identifier,
          type,
          os,
          os_version,
          app_version,
        }),
      })

      const {
        data: { id },
      } = await confirmRes.json()
      setShareLink(`${BASE_URL}/logs/${id}`)
    } catch (err) {
      console.error('log sharing failed:', err)
      toast({
        title: 'sharing failed',
        description: 'could not upload logs',
        variant: 'destructive',
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className='flex flex-col gap-2'>
      {!shareLink ? (
        <Button
          variant='secondary'
          size='sm'
          onClick={sendLogs}
          disabled={isSending}
          className='gap-2 group relative'
        >
          {isSending ? (
            <>
              <Loader className='h-3.5 w-3.5 animate-spin' />
              <span>sharing...</span>
            </>
          ) : (
            <>
              <Upload className='h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5' />
              <span>share logs</span>
            </>
          )}
        </Button>
      ) : (
        <ShareLinkDisplay
          shareLink={shareLink}
          onCopy={() => copyToClipboard(shareLink)}
          onClose={() => setShareLink('')}
        />
      )}
    </div>
  )
} 