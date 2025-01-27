import type { GroupBase, Props, SingleValue, MultiValue } from "react-select"
import CreatableSelect from 'react-select/creatable';
import SelectReact, { StylesConfig } from 'react-select';
import * as React from "react"

export type SelectProps<
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>
> = Props<Option, IsMulti, Group> & { isCreateable?: boolean };


const Select = <
  Option,
  IsMulti extends boolean = false,
  Group extends GroupBase<Option> = GroupBase<Option>
>({
  components,
  isCreateable,
  ...props
}: SelectProps<Option, IsMulti, Group>) => {
  const { menuPlacement = "auto", ...restProps } = props;

  const Comp = isCreateable ? CreatableSelect : SelectReact
  return (
    <Comp
      isClearable
      isSearchable
      {...restProps}
      styles={{
        'control': (css) => {
          console.log({css})
          return {
            ...css,
            backgroundColor: 'hsl(0, 0%, 100%)',
            borderStyle: 'hidden',
          }
        }
      }}
    />
  );
};

export default Select 