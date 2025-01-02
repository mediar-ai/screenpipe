"use client"

import * as React from "react"
import * as HoverCardPrimitive from "@radix-ui/react-hover-card"

import { cn } from "@/lib/utils"
import { ReactNode } from 'react';

const HoverCard = HoverCardPrimitive.Root

const HoverCardTrigger = HoverCardPrimitive.Trigger

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof HoverCardPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content>
>(({ className, align = "center", sideOffset = 4, ...props }, ref) => (
  <HoverCardPrimitive.Content
    ref={ref}
    align={align}
    sideOffset={sideOffset}
    className={cn(
      "z-50 w-64 rounded-md border bg-popover text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
      className
    )}
    {...props}
  />
))
HoverCardContent.displayName = HoverCardPrimitive.Content.displayName

const HoverCardInfo = ({
  children,
  title,
  description,
  footer
} : {
  children: ReactNode,
  title: string,
  description: string,
  footer: string
}) => {
  return (
    <HoverCard>
          <HoverCardTrigger className="hover:cursor-pointer">
            {children}
          </HoverCardTrigger>
          <HoverCardPrimitive.HoverCardPortal>  
            <HoverCardContent>
                <div className="bg-input/50 px-4 pt-3 pb-2 h-auto text-[12px] text-nowrap truncate">
                    {title}
                </div>
                <div className="text-[10px] px-4 pt-2 pb-3">
                    {description}
                </div>
                <p className="px-4 pb-3  text-[8px]">
                    {footer}
                </p>
            </HoverCardContent>
          </HoverCardPrimitive.HoverCardPortal>
      </HoverCard>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent, HoverCardInfo }