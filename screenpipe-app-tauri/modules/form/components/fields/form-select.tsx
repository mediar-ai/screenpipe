import { FormFieldRendererProps } from "../field-renderer";
import Select from "@/components/select";

export default function FormSelect({
    element,
    field,
    placeholder
  }: FormFieldRendererProps) { 
    return (
      <div className="col-span-4 col-start-2 row-start-3 flex flex-col items-start">
        <div className="col-span-4 col-start-2 row-start-2 flex w-[100%] flex-row items-end space-x-5">
          <Select
            className="w-[100%]"
            options={element.typeMeta.options}
            {...field}
          />
          {/* {isLast && showInternalButton && (
            <Button
              type="submit"
              data-dirty={form.formState.isDirty}
              className="mb-0 data-[dirty=false]:hidden "
            >
              Submit
            </Button>
          )} */}
        </div>
      </div>
    );
}