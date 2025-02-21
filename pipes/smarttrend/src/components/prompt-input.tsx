"use client";

import { useState } from "react";
import * as store from "@/lib/store";

interface Props {
  prompt: string;
  setPrompt: (prompt: string) => void;
}

export function PromptInput({ prompt, setPrompt }: Props) {
  const [updating, setUpdating] = useState<boolean>(false);

  const change = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newPrompt = e.target?.value.slice("Rules:\n".length);
    setPrompt(newPrompt);
    store.putPrompt(newPrompt);
  };

  return <textarea rows="10" value={"Rules:\n" + prompt} onChange={change} />;
}
