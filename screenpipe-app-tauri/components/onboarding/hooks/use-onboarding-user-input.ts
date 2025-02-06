import { useState } from "react";

export function useOnboardingUserInput() {
    const [selectedOptions, setSelectedOptions] = useState<string[]>([]); // use case selection (four options)
    const [selectedPersonalization, setSelectedPersonalization] = useState<string | null>(null); // with ai or without ai
    const [selectedPreference, setSelectedPreference] = useState<string | null>(null); // dev or non dev
  
    return { 
      selectedOptions, 
      setSelectedOptions, 
      selectedPersonalization, 
      setSelectedPersonalization, 
      selectedPreference, 
      setSelectedPreference 
    };
}