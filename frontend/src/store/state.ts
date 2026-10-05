import { create } from 'zustand'

import {
  ApiError,
  analyze,
  createProject,
  formatAnswersAsMessage,
  resetMockState,
  toApiError,
  getLatestAnalysis,
  getLatestHardwareSelection,
  getCircuitDiagram,
  fetchHardware,
  selectHardwareOption,
} from '@/api/api'
import type {
  AnalyzeResult,
  AnswersMap,
  OpenQuestion,
  HardwareResult,
  CircuitDiagramResponse,
  HardwareSelectionItem,
} from '@/api/types'

export type ProjectStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface ProjectState {
  // --- Server & Pipeline Felder ---
  projectId: string | null
  structure: AnalyzeResult | null
  hardwareData: HardwareResult | null
  circuitData: CircuitDiagramResponse | null
  activeStep: number
  status: ProjectStatus
  error: ApiError | null
  version: number

  // --- Formular-Eingaben ---
  sketchFile: File | null
  notes: string
  performancePriority: number
  uiTheme: 'light' | 'dark' | ''
  openPrompt: string
  primaryHardwareId: string
  secondaryHardwareIds: string[]
  structureAdjustments: string

  // --- Setters ---
  setProjectId: (id: string | null) => void
  setStructure: (structure: AnalyzeResult) => void
  setStatus: (status: ProjectStatus) => void
  setError: (error: ApiError | null) => void
  reset: () => void
  setActiveStep: (step: number) => void
  setHardwareData: (hardware: HardwareResult | null) => void
  setCircuitData: (circuit: CircuitDiagramResponse | null) => void

  // --- Formular-Setters ---
  setSketchFile: (file: File | null) => void
  setNotes: (notes: string) => void
  setPerformancePriority: (val: number) => void
  setUiTheme: (theme: 'light' | 'dark' | '') => void
  setOpenPrompt: (prompt: string) => void
  setPrimaryHardwareId: (id: string) => void
  setSecondaryHardwareIds: (ids: string[]) => void
  toggleSecondaryHardware: (id: string) => void
  setStructureAdjustments: (adj: string) => void

  // --- Pipeline Actions & Data Hydration ---
  startProject: (name?: string) => Promise<string>
  loadProject: (projectId: string) => Promise<void>
  submitAnalyze: (input?: {
    message?: string
    imageFile?: File | null
  }) => Promise<AnalyzeResult | null>
  submitAnswers: (
    questions: OpenQuestion[],
    answers: AnswersMap,
    extraPrompt?: string,
  ) => Promise<AnalyzeResult | null>
  loadOrGenerateHardware: () => Promise<HardwareResult | null>
  chooseHardware: (selections: HardwareSelectionItem[]) => Promise<HardwareResult | null>
  loadOrGenerateCircuit: () => Promise<CircuitDiagramResponse | null>
}

const initialState = {
  // API & Pipeline State
  projectId: null,
  structure: null,
  hardwareData: null,
  circuitData: null,
  activeStep: 1,
  status: 'idle' as ProjectStatus,
  error: null,
  version: 0,

  // Schritt 1-4 Formular-Werte
  sketchFile: null,
  notes: '',
  performancePriority: 50,
  uiTheme: '' as const,
  openPrompt: '',
  primaryHardwareId: '',
  secondaryHardwareIds: [] as string[],
  structureAdjustments: '',
}

export const useProjectStore = create<ProjectState>()((set, get) => ({
  ...initialState,

  // Setters
  setProjectId: (projectId) => set({ projectId }),
  setActiveStep: (activeStep) => set({ activeStep }),

  setStructure: (structure) =>
    set((state) => ({
      structure,
      version: state.version + 1,
      status: 'ready',
      error: null,
      projectId: structure.project_id || state.projectId,
    })),

  setHardwareData: (hardwareData) => set({ hardwareData }),
  setCircuitData: (circuitData) => set({ circuitData }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: error ? 'error' : get().status }),

  setSketchFile: (sketchFile) => set({ sketchFile }),
  setNotes: (notes) => set({ notes }),
  setPerformancePriority: (performancePriority) => set({ performancePriority }),
  setUiTheme: (uiTheme) => set({ uiTheme }),
  setOpenPrompt: (openPrompt) => set({ openPrompt }),
  setPrimaryHardwareId: (primaryHardwareId) => set({ primaryHardwareId }),
  setSecondaryHardwareIds: (secondaryHardwareIds) => set({ secondaryHardwareIds }),

  toggleSecondaryHardware: (id) =>
    set((state) => {
      const exists = state.secondaryHardwareIds.includes(id)
      return {
        secondaryHardwareIds: exists
          ? state.secondaryHardwareIds.filter((item) => item !== id)
          : [...state.secondaryHardwareIds, id],
      }
    }),

  setStructureAdjustments: (structureAdjustments) => set({ structureAdjustments }),

  reset: () => {
    resetMockState()
    set({ ...initialState })
  },

  // Projekt-Aktionen
  startProject: async (name) => {
    const existing = get().projectId
    if (existing) return existing

    const projectId = await createProject(name)
    set({ projectId })
    return projectId
  },

  loadProject: async (projectId: string) => {
    set({ status: 'loading', error: null, projectId })
    let reachedStep = 1

    try {
      // 1. Analyse laden
      try {
        const structure = await getLatestAnalysis(projectId)
        set({ structure })
        reachedStep = 2
      } catch {}

      // 2. Hardware laden
      try {
        const hardwareData = await getLatestHardwareSelection(projectId)
        set({ hardwareData })
        reachedStep = 3
      } catch {}

      // 3. Schaltplan laden
      try {
        const circuitData = await getCircuitDiagram(projectId)
        set({ circuitData })
        reachedStep = 4
      } catch {}

      set({ activeStep: reachedStep, status: 'ready' })
    } catch (err) {
      set({ status: 'error', error: toApiError(err) })
    }
  },

  submitAnalyze: async (input) => {
    set({ status: 'loading', error: null })

    try {
      const state = get()
      const projectId = await state.startProject()

      const combinedMessage =
        input?.message ||
        [
          state.notes && `Notizen: ${state.notes}`,
          state.openPrompt && `Anforderung: ${state.openPrompt}`,
          state.primaryHardwareId && `Hardware: ${state.primaryHardwareId}`,
          state.secondaryHardwareIds.length > 0 &&
            `Erweiterungen: ${state.secondaryHardwareIds.join(', ')}`,
          state.structureAdjustments && `Anpassungen: ${state.structureAdjustments}`,
        ]
          .filter(Boolean)
          .join('\n') ||
        'Standard-Analyse gestartet'

      const imageFile = input?.imageFile !== undefined ? input.imageFile : state.sketchFile

      const structure = await analyze({ projectId, message: combinedMessage, imageFile })
      get().setStructure(structure)
      set({ activeStep: 2 })
      return structure
    } catch (caught) {
      set({ status: 'error', error: toApiError(caught) })
      return null
    }
  },

  submitAnswers: async (questions, answers, extraPrompt) => {
    const formatted = formatAnswersAsMessage(questions, answers)
    const message = [formatted, extraPrompt?.trim()].filter(Boolean).join('\n\n')

    if (!message) {
      set({
        status: 'error',
        error: new ApiError('client', 'Bitte mindestens eine Frage beantworten.'),
      })
      return null
    }

    return get().submitAnalyze({ message })
  },

  loadOrGenerateHardware: async () => {
    const { projectId, hardwareData } = get()
    if (!projectId) return null
    if (hardwareData) return hardwareData

    set({ status: 'loading' })
    try {
      try {
        const existing = await getLatestHardwareSelection(projectId)
        set({ hardwareData: existing, status: 'ready' })
        return existing
      } catch {
        const generated = await fetchHardware(projectId)
        set({ hardwareData: generated, status: 'ready' })
        return generated
      }
    } catch (err) {
      set({ status: 'error', error: toApiError(err) })
      return null
    }
  },

  chooseHardware: async (selections) => {
    const { projectId } = get()
    if (!projectId) return null

    set({ status: 'loading' })
    try {
      const result = await selectHardwareOption(projectId, selections)
      set({ hardwareData: result, status: 'ready' })
      return result
    } catch (err) {
      set({ status: 'error', error: toApiError(err) })
      return null
    }
  },

  loadOrGenerateCircuit: async () => {
    const { projectId, circuitData } = get()
    if (!projectId) return null
    if (circuitData) return circuitData

    set({ status: 'loading' })
    try {
      const circuit = await getCircuitDiagram(projectId)
      set({ circuitData: circuit, status: 'ready' })
      return circuit
    } catch (err) {
      set({ status: 'error', error: toApiError(err) })
      return null
    }
  },
}))

// Vanilla-Zugriff
export const getState = useProjectStore.getState
export const setState = useProjectStore.setState
export const subscribe = useProjectStore.subscribe