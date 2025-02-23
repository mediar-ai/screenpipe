"use client";

import { useState, useEffect } from "react";
import * as store from "@/lib/store";

interface Props {
  prompt: string;
  setPrompt: (prompt: string) => void;
}

export function PromptInput({ prompt, setPrompt }: Props) {
  const [rows, setRows] = useState<number>(5);

  useEffect(() => {
    const updateRows = () => {
      setRows(5 + Math.floor(Math.max(window.innerHeight - 800, 0) / 50));
    };

    updateRows();
    window.addEventListener("resize", updateRows);

    return () => window.removeEventListener("resize", updateRows);
  }, []);

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
        rows={rows}
        value={"Rules:\n" + prompt}
        onChange={change}
      />
    </div>
  );
}
