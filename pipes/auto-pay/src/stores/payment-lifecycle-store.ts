import { create } from 'zustand';
import { useMemo } from 'react';
import { shallow } from 'zustand/shallow';
import type { DetectionSnippet } from '@/agents/payment-detector-agent';
import type { RecipientDetails } from '@/stores/detection-store';

// 1. Detection Stage
export interface PaymentDetection {
  id: string;
  status: 'pending' | 'detected' | 'selected' | 'failed';
  timestamp: string;
  snippet: DetectionSnippet;
  error?: string;
}

// 2. Preparation Stage
export interface PaymentPreparation {
  id: string;
  detectionId: string;
  status: 'pending' | 'prepared' | 'failed';
  timestamp: string;
  recipientDetails: RecipientDetails | null;
  paymentDetails: {
    amount: string;
    currency: string;
    description: string;
  };
  error?: string;
}

// 3. Execution Stage
export interface PaymentExecution {
  id: string;
  preparationId: string;
  status: 'pending' | 'created' | 'submitted' | 'completed' | 'failed';
  timestamp: string;
  provider: 'mercury' | 'wise';
  recipientId?: string;
  transferId?: string;
  trackingUrl?: string;
  error?: string;
}

interface PaymentLifecycleStore {
  // State
  detections: PaymentDetection[];
  preparations: PaymentPreparation[];
  executions: PaymentExecution[];
  
  // Detection Actions
  addDetection: (detection: Omit<PaymentDetection, 'id' | 'timestamp'>) => void;
  updateDetectionStatus: (id: string, status: PaymentDetection['status'], error?: string) => void;
  
  // Preparation Actions
  startPreparation: (detectionId: string) => void;
  updatePreparation: (id: string, update: Partial<PaymentPreparation>) => void;
  
  // Execution Actions
  startExecution: (preparationId: string, provider: 'mercury' | 'wise') => void;
  updateExecution: (id: string, update: Partial<PaymentExecution>) => void;
  
  // Utility Actions
  clearAll: () => void;
  getFullPaymentJourney: (executionId: string) => {
    detection: PaymentDetection | null;
    preparation: PaymentPreparation | null;
    execution: PaymentExecution | null;
  };
}

export const usePaymentLifecycleStore = create<PaymentLifecycleStore>((set, get) => ({
  detections: [],
  preparations: [],
  executions: [],

  addDetection: (detection) => set((state) => {
    const id = crypto.randomUUID();
    const newDetection: PaymentDetection = {
      ...detection,
      id,
      timestamp: new Date().toISOString(),
    };
    return {
      detections: [...state.detections, newDetection],
    };
  }),

  updateDetectionStatus: (id, status, error) => set((state) => ({
    detections: state.detections.map((d) =>
      d.id === id ? { ...d, status, error } : d
    ),
  })),

  startPreparation: (detectionId) => set((state) => {
    const id = crypto.randomUUID();
    const newPreparation: PaymentPreparation = {
      id,
      detectionId,
      status: 'pending',
      timestamp: new Date().toISOString(),
      recipientDetails: null,
      paymentDetails: {
        amount: '',
        currency: '',
        description: '',
      },
    };
    return {
      preparations: [...state.preparations, newPreparation],
    };
  }),

  updatePreparation: (id, update) => set((state) => ({
    preparations: state.preparations.map((p) =>
      p.id === id ? { ...p, ...update } : p
    ),
  })),

  startExecution: (preparationId, provider) => set((state) => {
    const id = crypto.randomUUID();
    const newExecution: PaymentExecution = {
      id,
      preparationId,
      status: 'pending',
      timestamp: new Date().toISOString(),
      provider,
    };
    return {
      executions: [...state.executions, newExecution],
    };
  }),

  updateExecution: (id, update) => set((state) => ({
    executions: state.executions.map((e) =>
      e.id === id ? { ...e, ...update } : e
    ),
  })),

  clearAll: () => set({
    detections: [],
    preparations: [],
    executions: [],
  }),

  getFullPaymentJourney: (executionId) => {
    const state = get();
    const execution = state.executions.find((e) => e.id === executionId) || null;
    if (!execution) return { detection: null, preparation: null, execution: null };

    const preparation = state.preparations.find((p) => p.id === execution.preparationId) || null;
    if (!preparation) return { detection: null, preparation: null, execution };

    const detection = state.detections.find((d) => d.id === preparation.detectionId) || null;
    return { detection, preparation, execution };
  },
}));

// Helper hook to get a filtered view of active payments
export function useActivePayments() {
  const selector = useMemo(
    () => (state: PaymentLifecycleStore) => ({
      executions: state.executions,
      getFullPaymentJourney: state.getFullPaymentJourney,
    }),
    []
  );
  
  const { executions, getFullPaymentJourney } = usePaymentLifecycleStore(selector, shallow);
  
  return useMemo(() => {
    const activeExecutions = executions.filter(
      (e: PaymentExecution) => e.status !== 'completed' && e.status !== 'failed'
    );
    
    return activeExecutions.map((execution: PaymentExecution) => ({
      ...getFullPaymentJourney(execution.id),
      lastUpdated: execution.timestamp,
    })).sort((a, b) => 
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );
  }, [executions, getFullPaymentJourney]);
}

// Helper hook to get payment history
export function usePaymentHistory() {
  const selector = useMemo(
    () => (state: PaymentLifecycleStore) => ({
      executions: state.executions,
      getFullPaymentJourney: state.getFullPaymentJourney,
    }),
    []
  );
  
  const { executions, getFullPaymentJourney } = usePaymentLifecycleStore(selector, shallow);
  
  return useMemo(() => {
    const completedExecutions = executions.filter(
      (e: PaymentExecution) => e.status === 'completed' || e.status === 'failed'
    );
    
    return completedExecutions.map((execution: PaymentExecution) => ({
      ...getFullPaymentJourney(execution.id),
      lastUpdated: execution.timestamp,
    })).sort((a, b) => 
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );
  }, [executions, getFullPaymentJourney]);
} 