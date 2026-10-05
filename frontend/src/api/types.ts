/**
 * Typen für den Backend-Vertrag (FastAPI, http://localhost:8000).
 */

export type ActorType = 'Human' | 'Object' | 'Animal' | 'Other';
export type TriggerType = 'Sensor' | 'User-Interaction' | 'Time/Timer' | 'Other';
export type QuestionType = 'SingleChoice' | 'MultipleChoice' | 'Text';

// ==========================================
// Projekt-Verwaltung (/projects)
// ==========================================

export interface CreateProject {
  project_name: string;
}

export interface GetProjectID {
  project_id: string;
}

export interface Project {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectMetadata {
  working_title: string;
  core_intention: string;
}

export interface ProjectListResponse {
  projects: Project[];
}

export interface CreateProjectResponse {
  project_id: number | string;
}

// ==========================================
// Analyse & Struktur (/analyze)
// ==========================================

export interface ActorEntity {
  id: string;
  name: string;
  type: ActorType;
  description: string;
}

export interface SensorActuator {
  id: string;
  concept_term: string;
  category: string;
}

export interface TriggerAction {
  id: string;
  trigger: string;
  trigger_type: TriggerType;
  actions: string[];
  /** null = Übergang bleibt im selben Zustand. */
  target_state_id: string | null;
}

/** Ein Zustand des Zustandsautomaten. Nicht "State", um Verwechslung mit UI-State zu vermeiden. */
export interface MachineState {
  id: string;
  name: string;
  description: string;
  is_initial_state: boolean;
  entry_actions: string[];
  trigger_actions: TriggerAction[];
}

export interface OpenQuestion {
  id: string;
  question: string;
  /** id eines Elements aus states / sensors / actuators / actors_entities. */
  reference: string;
  type: QuestionType;
  /** null bei type === 'Text'. */
  options: string[] | null;
}

/** Antwort von POST /analyze. Alle Arrays können leer sein. */
export interface AnalyzeResult {
  project_id: string;
  project_metadata: ProjectMetadata;
  actors_entities: ActorEntity[];
  sensors: SensorActuator[];
  actuators: SensorActuator[];
  states: MachineState[];
  global_actions: TriggerAction[];
  open_questions: OpenQuestion[];
}

export interface AnalyzeParams {
  projectId: string;
  message: string;
  imageFile?: File | null;
}

/** Antworten des Nutzers, indiziert nach OpenQuestion.id. */
export type AnswersMap = Record<string, string | string[]>;

export interface GeneratedFile {
  path: string;
  content: string;
}

export interface ConfigQuestion {
  key: string;
  question: string;
  example: string | null;
  input_type: 'text' | 'slider' | 'single_choice';
  min: number | null;
  max: number | null;
  options: string[] | null;
}

export interface GeneratedCodeResult {
  project_id: string;
  files: GeneratedFile[];
  config_questions: ConfigQuestion[];
  unanswered?: ConfigQuestion[];
}

// ==========================================
// Hardware-Endpoints (/hardware, /hardware/select)
// ==========================================

export interface HardwareOption {
  id: string;
  name: string;
  interface: string;
  pros_cons: string[];
  cost: string;
  availability: string;
  product_link: string | null;
  voltage: string;
  current: string;
  connector: string;
  dimensions: string | null;
  resolution: string | null;
  measurement_range: string | null;
  operating_temp: string | null;
  additional_notes: string | null;
  selected: boolean;
}

export interface HardwareComponent {
  id: string;
  component_name: string;
  concept_ref_id: string;
  options: HardwareOption[];
}

export interface ControllerOption {
  id: string;
  name: string;
  pros_cons: string[];
  cost: string;
  availability: string;
  product_link: string | null;
  voltage: string;
  current: string;
  supported_interfaces: string[];
  wireless_connectivity: string | null;
  gpio_count: string | null;
  dimensions: string | null;
  operating_temp: string | null;
  compatibility_notes: string;
  additional_notes: string | null;
  selected: boolean;
}

export interface ControllerComponent {
  id: string;
  role: string;
  connected_component_ids: string[];
  options: ControllerOption[];
}

export interface HardwareResult {
  project_id: string;
  hardware_components: HardwareComponent[];
  controllers: ControllerComponent[];
}

export interface HardwareSelectionItem {
  target_id: string;
  option_id: string;
}

// ==========================================
// Schaltplan-Endpoints (/circuit-diagram)
// ==========================================

export type SignalType =
  | 'power'
  | 'ground'
  | 'digital'
  | 'analog'
  | 'pwm'
  | 'i2c'
  | 'spi'
  | 'uart'
  | 'other';

export type WireColor =
  | 'red'
  | 'black'
  | 'blue'
  | 'yellow'
  | 'green'
  | 'orange'
  | 'purple'
  | 'brown'
  | 'gray'
  | 'white';

export type ComponentCategory =
  | 'Microcontroller'
  | 'Sensor'
  | 'Actuator'
  | 'Power Supply'
  | 'Passive Component'
  | 'Other';

export interface ComponentPin {
  id: string;
  label: string;
  signal_type: SignalType;
  description: string;
}

export interface CircuitComponent {
  id: string;
  name: string;
  category: ComponentCategory;
  description: string;
  pins: ComponentPin[];
}

export interface Connection {
  id: string;
  from_component_id: string;
  from_pin_id: string;
  to_component_id: string;
  to_pin_id: string;
  signal_type: SignalType;
  wire_color: WireColor;
  description: string;
}

export interface AssemblyStep {
  step_number: number;
  instruction: string;
  connection_ids: string[];
}

export interface PowerRequirement {
  component_id: string;
  voltage: string;
  note: string;
}

export interface CircuitDiagram {
  title: string;
  summary: string;
  components: CircuitComponent[];
  connections: Connection[];
  assembly_steps: AssemblyStep[];
  power_requirements: PowerRequirement[];
  safety_notes: string[];
}

export interface CircuitDiagramResponse extends CircuitDiagram {
  project_id: string;
  used_dummy_hardware_input: boolean;
  hardware_components_input: any;
  hardware_updated: boolean;
}

// ==========================================
// Code-Endpoints (/code)
// ==========================================

/** Eine vom Modell generierte Datei, z. B. "platformio.ini" oder "src/main.cpp". */
export interface GeneratedFile {
  path: string;
  content: string;
}

/**
 * Ein Wert, der sich nicht aus Schaltplan/Konzept ableiten lässt (WLAN-SSID,
 * Server-Adresse, Schwellenwert …) und den die Nutzer:in beantworten kann.
 * `key` entspricht exakt einem "{{KEY}}"-Platzhalter in den Dateien.
 */
export interface ConfigQuestion {
  key: string;
  question: string;
  /** Vorgeschlagener Default — wird eingesetzt, solange die Frage offen ist. */
  example: string | null;
  input_type: 'text' | 'slider' | 'single_choice';
  /** Nur bei input_type === 'slider'. */
  min: number | null;
  /** Nur bei input_type === 'slider'. */
  max: number | null;
  /** Nur bei input_type === 'single_choice'. */
  options: string[] | null;
}

/** Antwort von GET /code/{project_id} bzw. POST /code/{project_id}/answers. */
export interface GeneratedCodeResult {
  project_id: string;
  files: GeneratedFile[];
  config_questions: ConfigQuestion[];
  /** Nur bei POST …/answers: noch offene Fragen (ohne echte Antwort). */
  unanswered?: ConfigQuestion[];
}