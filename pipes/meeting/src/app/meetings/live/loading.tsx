import { Loader2 } from "lucide-react"

export default function Loading() {
  return (
    <div className="h-full w-full flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="ml-2 text-muted-foreground">loading meeting...</span>
    </div>
  )
} 