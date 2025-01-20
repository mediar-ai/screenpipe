import { Input } from "@/components/ui/input";
import { ControllerRenderProps } from "react-hook-form";

export default function FormStringField({
  field,
  placeholder
}: { 
  field: ControllerRenderProps<any, string> 
  placeholder?: string
}) {

    return (
      <div className="col-span-4 col-start-2 row-start-3 flex flex-col items-start">
        <Input
            {...field}
          placeholder={placeholder}
          className="mb-0"
        />
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
    )}