"use client";

import { useState } from "react";
import { Slider } from "@/components/ui/slider";
import * as store from "@/lib/store";

interface Props {
  frequency: number;
  setFrequency: (frequency: number) => void;
}

export function FrequencySlider({ frequency, setFrequency }: Props) {
  const change = (value: number[]) => {
    setFrequency(value[0]);
    store.putFrequency(value[0]);
  };

  return (
    <div>
      <h2 className="text-lg text-center font-bold mb-4">Task Frequency</h2>
      <Slider value={[frequency]} onValueChange={change} min={1} max={5} />
    </div>
  );
}
