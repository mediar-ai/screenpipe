import { Label } from "@/components/ui/label";
import Spinner from "@/components/ui/spinner";
import React, { FC, ReactElement, ReactNode } from "react";

export type InfoBannerData = {
    title: string,
    description: string,
    icon: FC,
}

export function InstructionsBanner({
    isPending,
    title,
    description,
    icon,
} : InfoBannerData & {isPending: boolean}) {
    const Icon = icon
    return (
        <div className="w-full bg-blue-100 h-[80px] rounded-[10px] flex justify-between items-center p-4">
            <div className="flex items-center justify-center space-x-3">
                {isPending 
                    ? (
                        <div
                            className="w-[40px] h-[40px] p-[8px]"
                        >
                            <Spinner/>
                        </div>
                    ) 
                    : <Icon/>
                }
                <div>
                    <Label>
                        {title}
                    </Label>
                    <p className="text-[0.8rem] text-muted-foreground">
                        {description}
                    </p>
                </div>
            </div>
            {/* {
                infoPerState[sidecarStatus].button && 
                infoPerState[sidecarStatus].button()
            } */}
        </div>
    )
}