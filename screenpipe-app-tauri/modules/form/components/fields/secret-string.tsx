import { ControllerRenderProps } from "react-hook-form";
import { useState } from "react";
import { EyeIcon, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function FormSecretStringField({
  field
}: { 
  field: ControllerRenderProps<any, string> 
}) {
    const [visibility, setVisibility] = useState(false)
    return (
      <div className="col-span-4 col-start-2 row-start-3 flex flex-row items-end space-x-2">
        <Input
          type={visibility ? "text" : "password"}
          className="mb-0"
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          {...field}
        />
        <Button
          type="button"
          onClick={() => setVisibility(!visibility)}
          size={"icon"}
          variant={'ghost'}
          className="border"
        >
          { visibility 
            ? <EyeIcon className="text-black" strokeWidth={1.5}/>
            : <EyeOff className="text-black" strokeWidth={1.5}/>
          }
        </Button>
        {/* {isLast && showInternalButton && (
          <Button
            type="submit"
            data-dirty={form.formState.isDirty}
            className="mb-1 data-[dirty=false]:hidden "
            // loading={isLoading}
          >
            Submit
          </Button>
        )} */}
      </div>
    );
}