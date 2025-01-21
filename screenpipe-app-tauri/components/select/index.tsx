import type { GroupBase, Props, SingleValue, MultiValue } from "react-select"
import ReactSelect from "react-select"
import * as React from "react"

export type SelectProps<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>
> = Props<Option, IsMulti, Group> & { variant?: "default" | "checkbox"; "data-testid"?: string };


const Select = <
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>
>({
  components,
  variant = "default",
  ...props
}: SelectProps<Option, IsMulti, Group>) => {
  const { menuPlacement = "auto", ...restProps } = props;

  return (
    <ReactSelect
      isSearchable
      {...restProps}
    />
  );
};

export default Select 