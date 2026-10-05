import {
  MOCK_ANALYZE_INITIAL,
  MOCK_ANALYZE_REFINED,
  MOCK_PROJECT_ID,
} from '@/mock/analyzeMock'
import type {
  ActorEntity,
  AnalyzeParams,
  AnalyzeResult,
  AnswersMap,
  MachineState,
  OpenQuestion,
  QuestionType,
  SensorActuator,
  TriggerAction,
  TriggerType,
  HardwareComponent,
  HardwareOption,
  ControllerComponent,
  ControllerOption,
  HardwareResult,
  HardwareSelectionItem,
  // Schaltplan-Typen:
  CircuitDiagramResponse,
  CircuitComponent,
  ComponentPin,
  Connection,
  AssemblyStep,
  PowerRequirement,
  SignalType,
  WireColor,
  ComponentCategory,
  Project,
  ProjectListResponse,
  GeneratedCodeResult,
} from '@/api/types'

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

/**
 * Basis-URL des FastAPI-Backends.
 * Leer lassen — dann laufen alle Requests über den Vite-Proxy (kein CORS).
 */
export const API_BASE = ''

/** true = keine Netzwerk-Requests, stattdessen Beispieldaten aus src/mock/. */
export const MOCK_MODE: boolean = false

const MOCK_CREATE_DELAY_MS = 300
const MOCK_ANALYZE_DELAY_MS = 800

// ---------------------------------------------------------------------------
// Fehlermodell
// ---------------------------------------------------------------------------

export type ApiErrorKind =
  | 'network'
  | 'cors'
  | 'http'
  | 'backend'
  | 'parse'
  | 'client'

export class ApiError extends Error {
  kind: ApiErrorKind
  status?: number
  detail?: string

  constructor(
    kind: ApiErrorKind,
    message: string,
    options?: { status?: number; detail?: string; cause?: unknown },
  ) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'ApiError'
    this.kind = kind
    this.status = options?.status
    this.detail = options?.detail
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error
  return new ApiError('client', 'Unerwarteter Fehler in der API-Schicht.', { cause: error })
}

// ---------------------------------------------------------------------------
// HTTP-Schicht
// ---------------------------------------------------------------------------

async function classifyFetchFailure(cause: unknown): Promise<ApiError> {
  return new ApiError(
    'network',
    `Keine Verbindung zum Backend. Läuft der Server (uvicorn main:app --reload)?`,
    { cause },
  )
}

async function parseJsonBody(res: Response): Promise<unknown> {
  const text = await res.text()
  if (!text.trim()) return null

  try {
    return JSON.parse(text) as unknown
  } catch (cause) {
    const snippet = text.slice(0, 300)
    if (!res.ok) {
      throw new ApiError('http', `Backend antwortete mit HTTP ${res.status}.`, {
        status: res.status,
        detail: snippet,
      })
    }
    throw new ApiError('parse', 'Antwort des Backends ist kein gültiges JSON.', {
      status: res.status,
      detail: snippet,
      cause,
    })
  }
}

function extractBackendError(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined
  const value = (data as { error?: unknown; detail?: unknown }).error || (data as { detail?: unknown }).detail
  if (typeof value === 'string' && value.trim()) return value
  return undefined
}

async function request(path: string, init?: RequestInit): Promise<unknown> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, init)
  } catch (cause) {
    throw await classifyFetchFailure(cause)
  }

  const data = await parseJsonBody(res)
  const backendError = extractBackendError(data)

  if (!res.ok) {
    throw new ApiError(
      'http',
      backendError
        ? `Backend antwortete mit HTTP ${res.status}: ${backendError}`
        : `Backend antwortete mit HTTP ${res.status}.`,
      { status: res.status, detail: backendError },
    )
  }

  if (backendError && (data as any).error) {
    throw new ApiError('backend', `Das Backend meldet einen Fehler: ${backendError}`, {
      status: res.status,
      detail: backendError,
    })
  }

  return data
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen zur Normalisierung
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

// ---------------------------------------------------------------------------
// Normalisierung: Analyse & Struktur
// ---------------------------------------------------------------------------

function normalizeActor(raw: unknown): ActorEntity {
  const record = asRecord(raw)
  return {
    id: asString(record.id),
    name: asString(record.name),
    type: asString(record.type, 'Other') as ActorEntity['type'],
    description: asString(record.description),
  }
}

function normalizeSensorActuator(raw: unknown): SensorActuator {
  const record = asRecord(raw)
  return {
    id: asString(record.id),
    concept_term: asString(record.concept_term),
    category: asString(record.category),
  }
}

function normalizeTriggerAction(raw: unknown): TriggerAction {
  const record = asRecord(raw)
  return {
    id: asString(record.id),
    trigger: asString(record.trigger),
    trigger_type: asString(record.trigger_type, 'Other') as TriggerType,
    actions: asStringArray(record.actions),
    target_state_id:
      typeof record.target_state_id === 'string' ? record.target_state_id : null,
  }
}

function normalizeState(raw: unknown): MachineState {
  const record = asRecord(raw)
  return {
    id: asString(record.id),
    name: asString(record.name),
    description: asString(record.description),
    is_initial_state: record.is_initial_state === true,
    entry_actions: asStringArray(record.entry_actions),
    trigger_actions: asArray(record.trigger_actions).map(normalizeTriggerAction),
  }
}

function normalizeQuestion(raw: unknown): OpenQuestion {
  const record = asRecord(raw)
  return {
    id: asString(record.id),
    question: asString(record.question),
    reference: asString(record.reference),
    type: asString(record.type, 'Text') as QuestionType,
    options: Array.isArray(record.options) ? asStringArray(record.options) : null,
  }
}

export function normalizeAnalyzeResult(raw: unknown): AnalyzeResult {
  const record = asRecord(raw)
  const metadata = asRecord(record.project_metadata)

  return {
    project_id: asString(record.project_id),
    project_metadata: {
      working_title: asString(metadata.working_title),
      core_intention: asString(metadata.core_intention),
    },
    actors_entities: asArray(record.actors_entities).map(normalizeActor),
    sensors: asArray(record.sensors).map(normalizeSensorActuator),
    actuators: asArray(record.actuators).map(normalizeSensorActuator),
    states: asArray(record.states).map(normalizeState),
    global_actions: asArray(record.global_actions).map(normalizeTriggerAction),
    open_questions: asArray(record.open_questions).map(normalizeQuestion),
  }
}

// ---------------------------------------------------------------------------
// Normalisierung: Hardware
// ---------------------------------------------------------------------------

function normalizeHardwareOption(raw: unknown): HardwareOption {
  const r = asRecord(raw)
  return {
    id: asString(r.id),
    name: asString(r.name),
    interface: asString(r.interface),
    pros_cons: asStringArray(r.pros_cons),
    cost: asString(r.cost),
    availability: asString(r.availability),
    product_link: typeof r.product_link === 'string' ? r.product_link : null,
    voltage: asString(r.voltage),
    current: asString(r.current),
    connector: asString(r.connector),
    dimensions: typeof r.dimensions === 'string' ? r.dimensions : null,
    resolution: typeof r.resolution === 'string' ? r.resolution : null,
    measurement_range: typeof r.measurement_range === 'string' ? r.measurement_range : null,
    operating_temp: typeof r.operating_temp === 'string' ? r.operating_temp : null,
    additional_notes: typeof r.additional_notes === 'string' ? r.additional_notes : null,
    selected: r.selected === true,
  }
}

function normalizeHardwareComponent(raw: unknown): HardwareComponent {
  const r = asRecord(raw)
  return {
    id: asString(r.id),
    component_name: asString(r.component_name),
    concept_ref_id: asString(r.concept_ref_id),
    options: asArray(r.options).map(normalizeHardwareOption),
  }
}

function normalizeControllerOption(raw: unknown): ControllerOption {
  const r = asRecord(raw)
  return {
    id: asString(r.id),
    name: asString(r.name),
    pros_cons: asStringArray(r.pros_cons),
    cost: asString(r.cost),
    availability: asString(r.availability),
    product_link: typeof r.product_link === 'string' ? r.product_link : null,
    voltage: asString(r.voltage),
    current: asString(r.current),
    supported_interfaces: asStringArray(r.supported_interfaces),
    wireless_connectivity: typeof r.wireless_connectivity === 'string' ? r.wireless_connectivity : null,
    gpio_count: typeof r.gpio_count === 'string' ? r.gpio_count : null,
    dimensions: typeof r.dimensions === 'string' ? r.dimensions : null,
    operating_temp: typeof r.operating_temp === 'string' ? r.operating_temp : null,
    compatibility_notes: asString(r.compatibility_notes),
    additional_notes: typeof r.additional_notes === 'string' ? r.additional_notes : null,
    selected: r.selected === true,
  }
}

function normalizeController(raw: unknown): ControllerComponent {
  const r = asRecord(raw)
  return {
    id: asString(r.id),
    role: asString(r.role),
    connected_component_ids: asStringArray(r.connected_component_ids),
    options: asArray(r.options).map(normalizeControllerOption),
  }
}

export function normalizeHardwareResult(raw: unknown): HardwareResult {
  const record = asRecord(raw)
  return {
    project_id: asString(record.project_id),
    hardware_components: asArray(record.hardware_components).map(normalizeHardwareComponent),
    controllers: asArray(record.controllers).map(normalizeController),
  }
}

// ---------------------------------------------------------------------------
// Normalisierung: Schaltplan (/circuit-diagram)
// ---------------------------------------------------------------------------

function normalizeComponentPin(raw: unknown): ComponentPin {
  const r = asRecord(raw)
  return {
    id: asString(r.id),
    label: asString(r.label),
    signal_type: asString(r.signal_type, 'other') as SignalType,
    description: asString(r.description),
  }
}

function normalizeCircuitComponent(raw: unknown): CircuitComponent {
  const r = asRecord(raw)
  return {
    id: asString(r.id),
    name: asString(r.name),
    category: asString(r.category, 'Other') as ComponentCategory,
    description: asString(r.description),
    pins: asArray(r.pins).map(normalizeComponentPin),
  }
}

function normalizeConnection(raw: unknown): Connection {
  const r = asRecord(raw)
  return {
    id: asString(r.id),
    from_component_id: asString(r.from_component_id),
    from_pin_id: asString(r.from_pin_id),
    to_component_id: asString(r.to_component_id),
    to_pin_id: asString(r.to_pin_id),
    signal_type: asString(r.signal_type, 'other') as SignalType,
    wire_color: asString(r.wire_color, 'gray') as WireColor,
    description: asString(r.description),
  }
}

function normalizeAssemblyStep(raw: unknown): AssemblyStep {
  const r = asRecord(raw)
  return {
    step_number: typeof r.step_number === 'number' ? r.step_number : 0,
    instruction: asString(r.instruction),
    connection_ids: asStringArray(r.connection_ids),
  }
}

function normalizePowerRequirement(raw: unknown): PowerRequirement {
  const r = asRecord(raw)
  return {
    component_id: asString(r.component_id),
    voltage: asString(r.voltage),
    note: asString(r.note),
  }
}

export function normalizeCircuitDiagramResult(raw: unknown): CircuitDiagramResponse {
  const r = asRecord(raw)
  return {
    project_id: asString(r.project_id),
    title: asString(r.title, 'Schaltplan'),
    summary: asString(r.summary),
    components: asArray(r.components).map(normalizeCircuitComponent),
    connections: asArray(r.connections).map(normalizeConnection),
    assembly_steps: asArray(r.assembly_steps).map(normalizeAssemblyStep),
    power_requirements: asArray(r.power_requirements).map(normalizePowerRequirement),
    safety_notes: asStringArray(r.safety_notes),
    used_dummy_hardware_input: r.used_dummy_hardware_input === true,
    hardware_components_input: r.hardware_components_input ?? null,
    hardware_updated: r.hardware_updated === true,
  }
}

// ---------------------------------------------------------------------------
// Endpunkte
// ---------------------------------------------------------------------------

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

let mockAnalyzeCalls = 0

export function resetMockState(): void {
  mockAnalyzeCalls = 0
}

/** POST /projects — startet ein Projekt und liefert dessen project_id. */
export async function createProject(name?: string): Promise<string> {
  if (MOCK_MODE) {
    await delay(MOCK_CREATE_DELAY_MS)
    return MOCK_PROJECT_ID
  }

  const body = new FormData()
  if (name) body.append('name', name)

  const data = await request('/projects', { method: 'POST', body })
  const projectId = asRecord(data).project_id

  if (!projectId) {
    throw new ApiError('parse', 'Antwort von POST /projects enthält keine project_id.')
  }

  return String(projectId)
}

/** GET /projects — alle bisher angelegten Projekte, neueste zuerst. */
export async function listProjects(): Promise<ProjectListResponse> {
  const data = await request('/projects', { method: 'GET' })
  const record = asRecord(data)
  const projects = asArray(record.projects).map((raw): Project => {
    const p = asRecord(raw)
    return {
      id: asString(p.id),
      name: asString(p.name),
      created_at: asString(p.created_at),
      updated_at: asString(p.updated_at),
    }
  })
  return { projects }
}

/** DELETE /projects/{id} — löscht ein Projekt samt Chat-Historie, Artefakten und Bildern. */
export async function deleteProject(projectId: string): Promise<void> {
  await request(`/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' })
}

/** POST /analyze */
export async function analyze({
  projectId,
  message,
  imageFile,
}: AnalyzeParams): Promise<AnalyzeResult> {
  if (!projectId) {
    throw new ApiError('client', 'Kein aktives Projekt — bitte zuerst createProject() aufrufen.')
  }
  if (!message.trim() && !imageFile) {
    throw new ApiError('client', 'Bitte eine Beschreibung eingeben oder eine Skizze hochladen.')
  }

  if (MOCK_MODE) {
    await delay(MOCK_ANALYZE_DELAY_MS)
    mockAnalyzeCalls += 1
    return normalizeAnalyzeResult(
      mockAnalyzeCalls <= 1 ? MOCK_ANALYZE_INITIAL : MOCK_ANALYZE_REFINED,
    )
  }

  const form = new FormData()
  form.append('project_id', projectId)
  form.append('message', message)
  if (imageFile) form.append('image', imageFile)

  const data = await request('/analyze', { method: 'POST', body: form })
  return normalizeAnalyzeResult(data)
}

export function formatAnswersAsMessage(
  questions: OpenQuestion[],
  answers: AnswersMap,
): string {
  const blocks: string[] = []

  for (const question of questions) {
    const raw = answers[question.id]
    const answer = Array.isArray(raw)
      ? raw.map((entry) => entry.trim()).filter(Boolean).join(', ')
      : (raw ?? '').trim()

    if (!answer) continue

    const reference = question.reference ? ` (bezieht sich auf: ${question.reference})` : ''
    blocks.push(`${blocks.length + 1}. ${question.question}${reference}\n   Antwort: ${answer}`)
  }

  if (blocks.length === 0) return ''

  return `Antworten auf die offenen Fragen:\n\n${blocks.join('\n\n')}`
}

/** POST /code/{project_id}/answers — speichert die Konfiguration und regeneriert den Code. */
export async function submitCodeAnswers(
  projectId: string,
  answers: Record<string, string>,
): Promise<GeneratedCodeResult> {
  if (!projectId) {
    throw new ApiError('client', 'Kein aktives Projekt vorhanden.')
  }

  const data = await request(`/code/${encodeURIComponent(projectId)}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  })

  return data as GeneratedCodeResult
}

/** POST /hardware */
export async function fetchHardware(
  projectId: string,
  message: string = 'Ermittle passende Hardware',
  disableWebSearch: boolean = false,
  localSearchOnly: boolean = true,
): Promise<HardwareResult> {
  if (!projectId) {
    throw new ApiError('client', 'Kein aktives Projekt vorhanden.')
  }

  const form = new FormData()
  form.append('project_id', projectId)
  form.append('message', message)
  form.append('disable_web_search', String(disableWebSearch))
  form.append('local_search_only', String(localSearchOnly))

  const data = await request('/hardware', { method: 'POST', body: form })
  return normalizeHardwareResult(data)
}

/** POST /hardware/select */
export async function selectHardwareOption(
  projectId: string,
  selections: HardwareSelectionItem[],
): Promise<HardwareResult> {
  if (!projectId) {
    throw new ApiError('client', 'Kein aktives Projekt vorhanden.')
  }
  if (!selections.length) {
    throw new ApiError('client', 'Mindestens eine Auswahl erforderlich.')
  }

  const form = new FormData()
  form.append('project_id', projectId)

  for (const item of selections) {
    form.append('selections', JSON.stringify(item))
  }

  const data = await request('/hardware/select', { method: 'POST', body: form })
  return normalizeHardwareResult(data)
}

/** GET /hardware/{project_id} */
export async function getLatestHardwareSelection(projectId: string): Promise<HardwareResult> {
  if (!projectId) {
    throw new ApiError('client', 'Kein aktives Projekt vorhanden.')
  }

  const data = await request(`/hardware/${projectId}`, { method: 'GET' })
  return normalizeHardwareResult(data)
}

// ---------------------------------------------------------------------------
// Schaltplan-Endpunkte (/circuit-diagram)
// ---------------------------------------------------------------------------

/**
 * POST /circuit-diagram — generiert den Schaltplan neu oder aktualisiert ihn per Änderungswunsch (message).
 */
export async function generateCircuitDiagram(
  projectId: string,
  message?: string | null,
): Promise<CircuitDiagramResponse> {
  if (!projectId) {
    throw new ApiError('client', 'Kein aktives Projekt vorhanden.')
  }

  const data = await request('/circuit-diagram', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      project_id: projectId,
      message: message || null,
    }),
  })

  return normalizeCircuitDiagramResult(data)
}

/**
 * GET /circuit-diagram/{project_id} — lädt den zuletzt generierten Schaltplan ohne neuen KI-Aufruf.
 */
export async function getCircuitDiagram(projectId: string): Promise<CircuitDiagramResponse> {
  if (!projectId) {
    throw new ApiError('client', 'Kein aktives Projekt vorhanden.')
  }

  const data = await request(`/circuit-diagram/${encodeURIComponent(projectId)}`, { method: 'GET' })
  return normalizeCircuitDiagramResult(data)
}