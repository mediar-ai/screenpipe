"use strict";
// src/components/multi-select.tsx
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __rest = (this && this.__rest) || function (s, e) {
    var t = {};
    for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p) && e.indexOf(p) < 0)
        t[p] = s[p];
    if (s != null && typeof Object.getOwnPropertySymbols === "function")
        for (var i = 0, p = Object.getOwnPropertySymbols(s); i < p.length; i++) {
            if (e.indexOf(p[i]) < 0 && Object.prototype.propertyIsEnumerable.call(s, p[i]))
                t[p[i]] = s[p[i]];
        }
    return t;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MultiSelect = void 0;
const React = __importStar(require("react"));
const class_variance_authority_1 = require("class-variance-authority");
const lucide_react_1 = require("lucide-react");
const utils_1 = require("@/lib/utils");
const separator_1 = require("@/components/ui/separator");
const button_1 = require("@/components/ui/button");
const badge_1 = require("@/components/ui/badge");
const popover_1 = require("@/components/ui/popover");
const command_1 = require("@/components/ui/command");
/**
 * Variants for the multi-select component to handle different styles.
 * Uses class-variance-authority (cva) to define different styles based on "variant" prop.
 */
const multiSelectVariants = (0, class_variance_authority_1.cva)("m-1 transition ease-in-out delay-150 hover:-translate-y-1 hover:scale-110 duration-300", {
    variants: {
        variant: {
            default: "border-foreground/10 text-foreground bg-card hover:bg-card/80",
            secondary: "border-foreground/10 bg-secondary text-secondary-foreground hover:bg-secondary/80",
            destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
            inverted: "inverted",
        },
    },
    defaultVariants: {
        variant: "default",
    },
});
exports.MultiSelect = React.forwardRef((_a, ref) => {
    var { options, onValueChange, variant, defaultValue = [], placeholder = "Select options", animation = 0, maxCount = 3, modalPopover = false, asChild = false, className, allowCustomValues = false, validateCustomValue = () => true } = _a, props = __rest(_a, ["options", "onValueChange", "variant", "defaultValue", "placeholder", "animation", "maxCount", "modalPopover", "asChild", "className", "allowCustomValues", "validateCustomValue"]);
    const [selectedValues, setSelectedValues] = React.useState(defaultValue);
    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [isAnimating, setIsAnimating] = React.useState(false);
    const [inputValue, setInputValue] = React.useState("");
    // Add state to track custom values
    const [customOptions, setCustomOptions] = React.useState([]);
    // Combine regular and custom options for rendering
    const allOptions = [...options, ...customOptions];
    const addCustomValue = (value) => {
        if (value &&
            validateCustomValue(value) &&
            !selectedValues.includes(value) &&
            !allOptions.some((opt) => opt.value === value)) {
            const newSelectedValues = [...selectedValues, value];
            setSelectedValues(newSelectedValues);
            onValueChange(newSelectedValues);
            setInputValue("");
        }
    };
    const handleInputKeyDown = (event) => {
        if (event.key === "Enter") {
            if (allowCustomValues) {
                addCustomValue(inputValue);
            }
            setIsPopoverOpen(true);
        }
        else if (event.key === "Backspace" && !event.currentTarget.value) {
            const newSelectedValues = [...selectedValues];
            newSelectedValues.pop();
            setSelectedValues(newSelectedValues);
            onValueChange(newSelectedValues);
        }
    };
    const toggleOption = (option) => {
        const newSelectedValues = selectedValues.includes(option)
            ? selectedValues.filter((value) => value !== option)
            : [...selectedValues, option];
        setSelectedValues(newSelectedValues);
        onValueChange(newSelectedValues);
    };
    const handleClear = () => {
        setSelectedValues([]);
        onValueChange([]);
    };
    const handleTogglePopover = () => {
        setIsPopoverOpen((prev) => !prev);
    };
    const clearExtraOptions = () => {
        const newSelectedValues = selectedValues.slice(0, maxCount);
        setSelectedValues(newSelectedValues);
        onValueChange(newSelectedValues);
    };
    const toggleAll = () => {
        if (selectedValues.length === options.length) {
            handleClear();
        }
        else {
            const allValues = options.map((option) => option.value);
            setSelectedValues(allValues);
            onValueChange(allValues);
        }
    };
    // Add handler for input changes
    const handleInputChange = (value) => {
        setInputValue(value);
    };
    // Add custom filtering logic
    const filterOptions = (value) => {
        return allOptions.filter((option) => {
            const searchTerm = value.toLowerCase().trim();
            const label = option.label.toLowerCase();
            const optionValue = option.value.toLowerCase();
            // Only return exact matches or substrings
            return label.includes(searchTerm) || optionValue.includes(searchTerm);
        });
    };
    return (<popover_1.Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen} modal={modalPopover}>
        <popover_1.PopoverTrigger asChild>
          <button_1.Button ref={ref} {...props} onClick={handleTogglePopover} className={(0, utils_1.cn)("flex w-full p-1 rounded-md border min-h-10 h-auto items-center justify-between bg-inherit hover:bg-inherit [&_svg]:pointer-events-auto", className)}>
            {selectedValues.length > 0 ? (<div className="flex justify-between items-center w-full">
                <div className="flex flex-wrap items-center">
                  {selectedValues.slice(0, maxCount).map((value) => {
                const option = options.find((o) => o.value === value);
                const IconComponent = option === null || option === void 0 ? void 0 : option.icon;
                return (<badge_1.Badge key={value} className={(0, utils_1.cn)(isAnimating ? "animate-bounce" : "", multiSelectVariants({ variant }))} style={{ animationDuration: `${animation}s` }}>
                        {IconComponent && (<IconComponent className="h-4 w-4 mr-2"/>)}
                        {option === null || option === void 0 ? void 0 : option.label}
                        <lucide_react_1.XCircle className="ml-2 h-4 w-4 cursor-pointer" onClick={(event) => {
                        event.stopPropagation();
                        toggleOption(value);
                    }}/>
                      </badge_1.Badge>);
            })}
                  {selectedValues.length > maxCount && (<badge_1.Badge className={(0, utils_1.cn)("bg-transparent text-foreground border-foreground/1 hover:bg-transparent", isAnimating ? "animate-bounce" : "", multiSelectVariants({ variant }))} style={{ animationDuration: `${animation}s` }}>
                      {`+ ${selectedValues.length - maxCount} more`}
                      <lucide_react_1.XCircle className="ml-2 h-4 w-4 cursor-pointer" onClick={(event) => {
                    event.stopPropagation();
                    clearExtraOptions();
                }}/>
                    </badge_1.Badge>)}
                </div>
                <div className="flex items-center justify-between">
                  <lucide_react_1.XIcon className="h-4 mx-2 cursor-pointer text-muted-foreground" onClick={(event) => {
                event.stopPropagation();
                handleClear();
            }}/>
                  <separator_1.Separator orientation="vertical" className="flex min-h-6 h-full"/>
                  <lucide_react_1.ChevronDown className="h-4 mx-2 cursor-pointer text-muted-foreground"/>
                </div>
              </div>) : (<div className="flex items-center justify-between w-full mx-auto">
                <span className="text-sm text-muted-foreground mx-3">
                  {placeholder}
                </span>
                <lucide_react_1.ChevronDown className="h-4 cursor-pointer text-muted-foreground mx-2"/>
              </div>)}
          </button_1.Button>
        </popover_1.PopoverTrigger>
        <popover_1.PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start" onEscapeKeyDown={() => setIsPopoverOpen(false)}>
          <command_1.Command className="w-full" filter={(value, search) => {
            if (!search)
                return 1;
            return filterOptions(search).some((opt) => opt.value === value)
                ? 1
                : 0;
        }}>
            <command_1.CommandInput placeholder="Search..." onKeyDown={handleInputKeyDown} value={inputValue} onValueChange={handleInputChange}/>
            <command_1.CommandList>
              <command_1.CommandEmpty>
                {allowCustomValues ? (<command_1.CommandItem onSelect={() => addCustomValue(inputValue)}>
                    Add &quot;{inputValue}&quot;
                  </command_1.CommandItem>) : ("No results found.")}
              </command_1.CommandEmpty>
              <command_1.CommandGroup>
                <command_1.CommandItem key="all" onSelect={toggleAll} className="cursor-pointer">
                  <div className={(0, utils_1.cn)("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", selectedValues.length === allOptions.length
            ? "bg-primary text-primary-foreground"
            : "opacity-50 [&_svg]:invisible")}>
                    <lucide_react_1.CheckIcon className="h-4 w-4"/>
                  </div>
                  <span>(Select All)</span>
                </command_1.CommandItem>

                {/* Show selected items first */}
                {allOptions
            .filter((option) => selectedValues.includes(option.value))
            .map((option) => (<command_1.CommandItem key={option.value} onSelect={() => toggleOption(option.value)} className="cursor-pointer w-full">
                      <div className={(0, utils_1.cn)("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", selectedValues.includes(option.value)
                ? "bg-primary text-primary-foreground"
                : "opacity-50 [&_svg]:invisible")}>
                        <lucide_react_1.CheckIcon className="h-4 w-4"/>
                      </div>
                      {option.icon && (<option.icon className="mr-2 h-4 w-4 text-muted-foreground"/>)}
                      <span>{option.label}</span>
                      {!options.find((o) => o.value === option.value) && (<badge_1.Badge variant="outline" className="ml-2">
                          custom
                        </badge_1.Badge>)}
                    </command_1.CommandItem>))}

                {allOptions
            .filter((option) => !selectedValues.includes(option.value))
            .map((option) => (<command_1.CommandItem key={option.value} onSelect={() => toggleOption(option.value)} className="cursor-pointer w-full">
                      <div className={(0, utils_1.cn)("mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary", selectedValues.includes(option.value)
                ? "bg-primary text-primary-foreground"
                : "opacity-50 [&_svg]:invisible")}>
                        <lucide_react_1.CheckIcon className="h-4 w-4"/>
                      </div>
                      {option.icon && (<option.icon className="mr-2 h-4 w-4 text-muted-foreground"/>)}
                      <span>{option.label}</span>
                      {!options.find((o) => o.value === option.value) && (<badge_1.Badge variant="outline" className="ml-2">
                          custom
                        </badge_1.Badge>)}
                    </command_1.CommandItem>))}
              </command_1.CommandGroup>
              <command_1.CommandSeparator />
              <command_1.CommandGroup>
                <div className="flex items-center justify-between">
                  {selectedValues.length > 0 && (<>
                      <command_1.CommandItem onSelect={handleClear} className="flex-1 justify-center cursor-pointer">
                        Clear
                      </command_1.CommandItem>
                      <separator_1.Separator orientation="vertical" className="flex min-h-6 h-full"/>
                    </>)}
                  <command_1.CommandItem onSelect={() => setIsPopoverOpen(false)} className="flex-1 justify-center cursor-pointer max-w-full">
                    Close
                  </command_1.CommandItem>
                </div>
              </command_1.CommandGroup>
            </command_1.CommandList>
          </command_1.Command>
        </popover_1.PopoverContent>
      </popover_1.Popover>);
});
exports.MultiSelect.displayName = "MultiSelect";
