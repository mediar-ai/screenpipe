import { ButtonHTMLAttributes } from "react"
import Spinner from "./spinner"
import { Button } from "./button"

export function ButtonWithLoadingState({
    isLoading,
    className,
    handleClick,
    label,
    disabled,
    type
  } : {
    label: string,
    handleClick?: () => void
    isLoading?: boolean,
    className?: string,
    disabled?:boolean,
    type?: ButtonHTMLAttributes<HTMLButtonElement>['type']
  }) {
    return (
      <Button onClick={handleClick} className={className} disabled={disabled} type={type}> 
        <div className="flex items-end">
          <p className="leading-none">
            {!isLoading ? label : "loading..."}
          </p>
          {isLoading ?
          <div className="max-w-[15px] w-[15px] h-[15px] ml-4">
            <Spinner/>
          </div> : null}
        </div>
     </Button>
    )
  }