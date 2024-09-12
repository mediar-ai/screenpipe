import { useState, useEffect } from "react";

export function useInputHistory(key: string, maxHistory: number = 10) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);

  useEffect(() => {
    const savedHistory = localStorage.getItem(`${key}_history`);
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, [key]);

  const updateValue = (newValue: string) => {
    setValue(newValue);
  };

  const saveToHistory = () => {
    if (value && !history.includes(value)) {
      const updatedHistory = [value, ...history.slice(0, maxHistory - 1)];
      setHistory(updatedHistory);
      try {
        localStorage.setItem(`${key}_history`, JSON.stringify(updatedHistory));
      } catch (error) {
        console.error(`Failed to save ${key} history:`, error);
      }
    }
  };

  return { value, setValue: updateValue, history, saveToHistory };
}
