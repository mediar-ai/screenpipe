import { cn } from "@/lib/utils";
import { AvailableAiProviders } from "@/modules/ai-providers/types/available-providers";

interface AIProviderCardProps {
    type: AvailableAiProviders;
    title: string;
    description: string;
    imageSrc: string;
    selected: boolean;
    onClick: () => void;
    disabled?: boolean;
    warningText?: string;
    imageClassName?: string;
}

export const AIProviderCard = ({
    type,
    title,
    description,
    imageSrc,
    selected,
    onClick,
    disabled,
    imageClassName,
  }: AIProviderCardProps) => {
    return (
      <div
        onClick={onClick}
        data-selected={selected}
        data-disabled={disabled}
        className={cn(
          "flex p-4 rounded-lg hover:bg-accent transition-colors cursor-pointer"
        )}
      >
          <div className="flex items-center space-x-3">
            <img
              src={imageSrc}
              alt={title}
              data-outline={[AvailableAiProviders.EMBEDDED, AvailableAiProviders.NATIVE_OLLAMA].includes(type as any)}
              className={cn(
                "rounded-lg shrink-0 size-12 data-[outline=true]:outline data-[outline=true]:outline-gray-300 data-[outline=true]:outline-1 data-[outline=true]:outline-offset-2",
                imageClassName
              )}
            />
            <div className="flex flex-col gap-1">
              <div className="flex gap-1 items-center">
                <h1 className="text-md leading-none text-left font-medium truncate">
                  {title}
                </h1>
              </div>
              <p className="text-[10px] leading-[12px] text-left text-muted-foreground line-clamp-3">
                {description}
              </p>
            </div>
          </div>
      </div>
    );
  };