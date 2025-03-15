"use client";

import { useState, useEffect, type ChangeEvent } from "react";
import * as store from "@/lib/store";

interface Props {
  prompt: string;
  setPrompt: (prompt: string) => void;
}

export function PromptInput({ prompt, setPrompt }: Props) {
  const change = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newPrompt = e.target?.value.slice("Rules:\n".length);
    setPrompt(newPrompt);
    store.putPrompt(newPrompt);
  };

  return (
    <div>
      <h2 className="text-lg text-center font-bold mb-4">Prompt</h2>
      <textarea
        className="w-full border p-2"
        rows="5"
        value={"Rules:\n" + prompt}
        onChange={change}
      />
    </div>
  );
}
