import { create } from 'zustand';

// Hier definieren wir, welche Daten unsere gesamte App speichert
interface AppState {
  currentStep: number;
  maxStepReached: number;
  
  // Daten aus Schritt 1
  step1Data: {
    sketch: File | null;
    notes: string;
    audioUrl: string | null;
  };
  
  // Daten aus Schritt 2
  step2Data: {
    gapAnswers: Record<string, string>;
  };
  
  // Daten aus Schritt 3
  step3Data: {
    selectedHardware: string[];
    parameters: Record<string, any>;
  };

  // Aktionen, um die Daten zu verändern
  setCurrentStep: (step: number) => void;
  setStep1Data: (data: Partial<AppState['step1Data']>) => void;
  setStep2Data: (data: Partial<AppState['step2Data']>) => void;
  setStep3Data: (data: Partial<AppState['step3Data']>) => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentStep: 1,
  maxStepReached: 1,
  
  step1Data: { sketch: null, notes: '', audioUrl: null },
  step2Data: { gapAnswers: {} },
  step3Data: { selectedHardware: [], parameters: {} },

  setCurrentStep: (step) => set((state) => ({ 
    currentStep: step,
    maxStepReached: Math.max(state.maxStepReached, step)
  })),
  
  setStep1Data: (data) => set((state) => ({ step1Data: { ...state.step1Data, ...data } })),
  setStep2Data: (data) => set((state) => ({ step2Data: { ...state.step2Data, ...data } })),
  setStep3Data: (data) => set((state) => ({ step3Data: { ...state.step3Data, ...data } })),
}));