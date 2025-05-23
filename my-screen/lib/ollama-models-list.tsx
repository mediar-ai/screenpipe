import { useState, useEffect } from "react";
import { Loader2, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}

interface Props {
  defaultValue: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

export function OllamaModelsList({ defaultValue, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    const fetchOllamaModels = async () => {
      try {
        const response = await fetch("http://localhost:11434/api/tags");
        if (!response.ok) throw new Error("failed to fetch ollama models");
        const data = (await response.json()) as { models: OllamaModel[] };
        setOllamaModels(data.models || []);
        setError(null);
      } catch (error) {
        console.error("failed to fetch ollama models:", error);
        setError("failed to connect to ollama");
        setOllamaModels([]);
      } finally {
        setLoading(false);
      }
    };

    fetchOllamaModels();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 h-10 px-3 border rounded-md">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-muted-foreground">loading models...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center p-4 text-muted-foreground">
        <p>{error}</p>
      </div>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(isOpen: boolean) => {
        if (!disabled) {
          setOpen(isOpen);
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          className="w-full justify-between"
          disabled={disabled}
        >
          <input type="hidden" name="aiModel" value={value} />
          {value || "select model..."}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command>
          <CommandInput placeholder="search models..." />
          <CommandList>
            <CommandEmpty>no models found</CommandEmpty>
            <CommandGroup>
              {ollamaModels.map((model) => (
                <CommandItem
                  key={model.digest}
                  value={model.name}
                  onSelect={(currentValue) => {
                    setValue(currentValue);
                    setOpen(false);
                    if (onChange) {
                      onChange(currentValue);
                    }
                    const input = document.querySelector(
                      'input[name="aiModel"]'
                    ) as HTMLInputElement;
                    if (input) input.value = currentValue;
                  }}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>{model.name}</span>
                    <span className="text-sm text-muted-foreground">
                      {(model.size / 1024 / 1024 / 1024).toFixed(2)} GB
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
