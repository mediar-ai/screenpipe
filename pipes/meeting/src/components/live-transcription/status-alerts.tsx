import { AlertTriangle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ServiceStatus } from './types'

interface StatusAlertsProps {
  serviceStatus: ServiceStatus
}

export function StatusAlerts({ serviceStatus }: StatusAlertsProps) {
  if (serviceStatus === 'no_subscription') {
    return (
      <Alert className="mb-4 border-red-500">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <AlertDescription className="text-red-500 font-medium">
          please subscribe to screenpipe cloud in settings.
        </AlertDescription>
      </Alert>
    )
  }

  if (serviceStatus === 'forbidden') {
    return (
      <Alert className="mb-4 border-red-500">
        <AlertTriangle className="h-4 w-4 text-red-500" />
        <AlertDescription className="text-red-500 font-medium">
          real-time transcription is disabled. please enable it in screenpipe settings.
        </AlertDescription>
      </Alert>
    )
  }

  return null
} 