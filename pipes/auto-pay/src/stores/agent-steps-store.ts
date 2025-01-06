import { create } from 'zustand';

export interface AgentStep {
  id: string;
  timestamp: string;
  text: string;
  tokenCount: number;
  toolCalls: any[];
  toolResults?: any[];
  finishReason?: string;
  usage?: any;
  humanAction: string;
  humanResult?: string;
}

interface AgentStepsState {
  steps: Record<string, AgentStep[]>;
  addStep: (recognizedItemId: string, step: Omit<AgentStep, "id" | "timestamp">) => void;
  updateStep: (recognizedItemId: string, stepId: string, update: Partial<AgentStep>) => void;
  updateStepResult: (recognizedItemId: string, stepId: string, result: string) => void;
  clearSteps: (recognizedItemId: string) => void;
}

export const useAgentStepsStore = create<AgentStepsState>((set) => ({
  steps: {},
  addStep: (recognizedItemId, step) => set((state) => {
    const newStep: AgentStep = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...step,
    };
    return {
      steps: {
        ...state.steps,
        [recognizedItemId]: [...(state.steps[recognizedItemId] || []), newStep],
      },
    };
  }),
  updateStep: (recognizedItemId, stepId, update) => set((state) => {
    const steps = state.steps[recognizedItemId] || [];
    const stepIndex = steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) return state;

    const updatedSteps = [...steps];
    updatedSteps[stepIndex] = {
      ...updatedSteps[stepIndex],
      ...update,
    };

    return {
      steps: {
        ...state.steps,
        [recognizedItemId]: updatedSteps,
      },
    };
  }),
  updateStepResult: (recognizedItemId, stepId, result) => set((state) => {
    const steps = state.steps[recognizedItemId] || [];
    const stepIndex = steps.findIndex(s => s.id === stepId);
    if (stepIndex === -1) return state;

    const updatedSteps = [...steps];
    updatedSteps[stepIndex] = {
      ...updatedSteps[stepIndex],
      humanResult: result,
    };

    return {
      steps: {
        ...state.steps,
        [recognizedItemId]: updatedSteps,
      },
    };
  }),
  clearSteps: (recognizedItemId) => set((state) => ({
    steps: {
      ...state.steps,
      [recognizedItemId]: [],
    },
  })),
})); 