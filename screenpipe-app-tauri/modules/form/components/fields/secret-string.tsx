import { ControllerRenderProps } from "react-hook-form";
import { useState } from "react";
import { EyeIcon, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconButton } from "./icon-button";

export default function FormSecretStringField({
  field
}: { 
  field: ControllerRenderProps<any, string> 
}) {
    const [visibility, setVisibility] = useState(false)
    return (
      <div className="flex flex-row space-x-2">
        <Input
          type={visibility ? "text" : "password"}
          className="mb-0"
          autoCorrect="off"
          autoCapitalize="off"
          autoComplete="off"
          {...field}
        />
        <IconButton
          onClick={() => setVisibility(!visibility)}
          defaultToggleValue={visibility}
          OnComponent={EyeIcon}
          OffComponent={EyeOff}
        />
      </div>
    );
}