"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OllamaModelsList = OllamaModelsList;
const react_1 = require("react");
const lucide_react_1 = require("lucide-react");
const button_1 = require("@/components/ui/button");
const command_1 = require("@/components/ui/command");
const popover_1 = require("@/components/ui/popover");
function OllamaModelsList({ defaultValue, onChange, disabled }) {
    const [open, setOpen] = (0, react_1.useState)(false);
    const [ollamaModels, setOllamaModels] = (0, react_1.useState)([]);
    const [loading, setLoading] = (0, react_1.useState)(true);
    const [error, setError] = (0, react_1.useState)(null);
    const [value, setValue] = (0, react_1.useState)(defaultValue);
    (0, react_1.useEffect)(() => {
        const fetchOllamaModels = () => __awaiter(this, void 0, void 0, function* () {
            try {
                const response = yield fetch("http://localhost:11434/api/tags");
                if (!response.ok)
                    throw new Error("failed to fetch ollama models");
                const data = (yield response.json());
                setOllamaModels(data.models || []);
                setError(null);
            }
            catch (error) {
                console.error("failed to fetch ollama models:", error);
                setError("failed to connect to ollama");
                setOllamaModels([]);
            }
            finally {
                setLoading(false);
            }
        });
        fetchOllamaModels();
    }, []);
    if (loading) {
        return (<div className="flex items-center gap-2 h-10 px-3 border rounded-md">
        <lucide_react_1.Loader2 className="h-4 w-4 animate-spin"/>
        <span className="text-muted-foreground">loading models...</span>
      </div>);
    }
    if (error) {
        return (<div className="text-center p-4 text-muted-foreground">
        <p>{error}</p>
      </div>);
    }
    return (<popover_1.Popover open={open} onOpenChange={(isOpen) => {
            if (!disabled) {
                setOpen(isOpen);
            }
        }}>
      <popover_1.PopoverTrigger asChild>
        <button_1.Button variant="outline" role="combobox" className="w-full justify-between" disabled={disabled}>
          <input type="hidden" name="aiModel" value={value}/>
          {value || "select model..."}
          <lucide_react_1.ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50"/>
        </button_1.Button>
      </popover_1.PopoverTrigger>
      <popover_1.PopoverContent className="w-full p-0">
        <command_1.Command>
          <command_1.CommandInput placeholder="search models..."/>
          <command_1.CommandList>
            <command_1.CommandEmpty>no models found</command_1.CommandEmpty>
            <command_1.CommandGroup>
              {ollamaModels.map((model) => (<command_1.CommandItem key={model.digest} value={model.name} onSelect={(currentValue) => {
                setValue(currentValue);
                setOpen(false);
                if (onChange) {
                    onChange(currentValue);
                }
                const input = document.querySelector('input[name="aiModel"]');
                if (input)
                    input.value = currentValue;
            }}>
                  <div className="flex items-center justify-between w-full">
                    <span>{model.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {(model.size / 1024 / 1024 / 1024).toFixed(2)} GB
                    </span>
                  </div>
                </command_1.CommandItem>))}
            </command_1.CommandGroup>
          </command_1.CommandList>
        </command_1.Command>
      </popover_1.PopoverContent>
    </popover_1.Popover>);
}
