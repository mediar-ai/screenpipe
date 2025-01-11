import { create } from 'zustand';
import type { DetectionSnippet } from '@/agents/payment-detector-agent';

export interface RecipientDetails {
  name: string;
  email: string;
  routingNumber: string;
  accountNumber: string;
  accountType: 'businessChecking' | 'personalChecking';
  address: {
    country: string;
    postalCode: string;
    region: string;
    city: string;
    address1: string;
  };
}

interface DetectionStore {
  detections: DetectionSnippet[];
  selectedDetection: DetectionSnippet | null;
  recipientDetails: RecipientDetails | null;
  setDetections: (detections: DetectionSnippet[]) => void;
  setSelectedDetection: (detection: DetectionSnippet | null) => void;
  setRecipientDetails: (details: RecipientDetails | null) => void;
  clearDetections: () => void;
}

export const useDetectionStore = create<DetectionStore>((set) => ({
  detections: [],
  selectedDetection: null,
  recipientDetails: null,
  setDetections: (detections) => set({ detections }),
  setSelectedDetection: (detection) => set({ selectedDetection: detection }),
  setRecipientDetails: (details) => set({ recipientDetails: details }),
  clearDetections: () => set({ detections: [], selectedDetection: null, recipientDetails: null }),
})); 