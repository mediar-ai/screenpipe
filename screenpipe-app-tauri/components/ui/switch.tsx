"use client"

import * as React from "react"
import * as SwitchPrimitives from "@radix-ui/react-switch"

import { cn } from "@/lib/utils"

const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitives.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitives.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitives.Root
    className={cn(
      // Screenpipe Brand: Geometric toggle, sharp corners, binary state
      "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center border border-border transition-all duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-foreground data-[state=checked]:border-foreground data-[state=unchecked]:bg-background",
      className
    )}
    {...props}
    ref={ref}
  >
    <SwitchPrimitives.Thumb
      className={cn(
        // Screenpipe Brand: Square thumb, no shadow
        "pointer-events-none block h-4 w-4 bg-foreground ring-0 transition-transform duration-150 data-[state=checked]:translate-x-5 data-[state=checked]:bg-background data-[state=unchecked]:translate-x-0.5"
      )}
    />
  </SwitchPrimitives.Root>
))
Switch.displayName = SwitchPrimitives.Root.displayName

export { Switch }
