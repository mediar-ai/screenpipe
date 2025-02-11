"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SqlAutocompleteInput = SqlAutocompleteInput;
const react_1 = __importStar(require("react"));
const use_sql_autocomplete_1 = require("@/lib/hooks/use-sql-autocomplete");
const cmdk_1 = require("cmdk");
const input_1 = require("@/components/ui/input");
const lucide_react_1 = require("lucide-react");
const utils_1 = require("@/lib/utils");
function SqlAutocompleteInput({ id, placeholder, value, onChange, type, icon, className, onKeyDown, }) {
    const { items, isLoading } = (0, use_sql_autocomplete_1.useSqlAutocomplete)(type);
    const [open, setOpen] = (0, react_1.useState)(false);
    const [inputValue, setInputValue] = (0, react_1.useState)(value);
    const inputRef = (0, react_1.useRef)(null);
    const commandRef = (0, react_1.useRef)(null);
    // update local state when prop changes
    (0, react_1.useEffect)(() => {
        setInputValue(value);
    }, [value]);
    const handleSelect = (selectedValue) => {
        var _a;
        onChange(selectedValue);
        setInputValue(selectedValue);
        setOpen(false);
        (_a = inputRef.current) === null || _a === void 0 ? void 0 : _a.focus();
    };
    const handleInputChange = (0, react_1.useCallback)((e) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        onChange(newValue);
    }, [onChange]);
    const handleClearInput = (0, react_1.useCallback)(() => {
        var _a;
        setInputValue("");
        onChange("");
        (_a = inputRef.current) === null || _a === void 0 ? void 0 : _a.focus();
    }, [onChange]);
    (0, react_1.useEffect)(() => {
        const handleClickOutside = (event) => {
            if (commandRef.current &&
                !commandRef.current.contains(event.target)) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);
    return (<div className={(0, utils_1.cn)("relative", className)} ref={commandRef}>
      <div className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 z-10 flex items-center">
        {icon}
        <span className="w-2"/>
      </div>
      <cmdk_1.Command className="relative w-full" shouldFilter={false}>
        <div className="relative">
          <input_1.Input ref={inputRef} id={id} type="text" placeholder={placeholder} value={inputValue} onChange={handleInputChange} onFocus={() => setOpen(true)} className={(0, utils_1.cn)("pr-8 w-full", icon ? "pl-7" : "pl-3")} autoCorrect="off" aria-autocomplete="none" onKeyDown={onKeyDown}/>
          {inputValue && (<button onClick={handleClearInput} className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <lucide_react_1.X className="h-4 w-4"/>
            </button>)}
        </div>
        {open && (<cmdk_1.Command.List className="absolute z-20 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-60 overflow-auto shadow-lg text-sm">
            <div className="flex items-center px-3 py-2 border-b border-gray-200">
              <lucide_react_1.Search className="mr-2 h-4 w-4 text-gray-400"/>
              <cmdk_1.Command.Input placeholder="search..." value={inputValue} onValueChange={setInputValue} className="border-none focus:ring-0 outline-none w-full"/>
            </div>
            {isLoading ? (<cmdk_1.Command.Loading>
                <div className="px-4 py-2 text-gray-500 flex items-center">
                  <lucide_react_1.Loader2 className="mr-2 h-4 w-4 animate-spin"/>
                  loading...
                </div>
              </cmdk_1.Command.Loading>) : (items
                .filter((item) => item.name.toLowerCase().includes(inputValue.toLowerCase()))
                .map((item) => (<cmdk_1.Command.Item key={item.name} value={item.name} onSelect={handleSelect} className="px-4 py-2 hover:bg-gray-100 cursor-pointer border-b border-gray-200 last:border-b-0">
                    {item.name} ({item.count})
                  </cmdk_1.Command.Item>)))}
            {!isLoading && items.length === 0 && (<div className="px-4 py-2 text-gray-500">no results found</div>)}
          </cmdk_1.Command.List>)}
      </cmdk_1.Command>
    </div>);
}
