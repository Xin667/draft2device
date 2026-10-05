import type { AnalyzeResult } from '@/api/types'

/**
 * Beispieldaten für MOCK_MODE — erlaubt eine vollständige Demo ohne Backend.
 *
 */

export const MOCK_PROJECT_ID = 'mock-0000-0000-0000-000000000001'

export const MOCK_ANALYZE_INITIAL: AnalyzeResult = {
  project_id: MOCK_PROJECT_ID,
  project_metadata: {
    working_title: 'Die jammernde Pflanze',
    core_intention:
      'Emotionale Bindung zwischen Ausstellungsbesucher und Objekt durch niedliches, nicht nerviges Feedback.',
  },
  actors_entities: [
    {
      id: 'actor_besucher',
      name: 'Ausstellungsbesucher',
      type: 'Human',
      description: 'Interagiert mit der Pflanze, indem er sie gießt.',
    },
    {
      id: 'actor_blumentopf',
      name: 'Blumentopf mit Pflanze',
      type: 'Object',
      description: 'Das reaktive Objekt, das seinen Zustand nach außen kommuniziert.',
    },
  ],
  sensors: [
    {
      id: 'sensor_bodenfeuchte',
      concept_term: 'Erde ist trocken',
      category: 'Feuchtigkeitssensor',
    },
  ],
  actuators: [
    {
      id: 'actuator_led',
      concept_term: 'rot bzw. grün leuchten',
      category: 'RGB-LED',
    },
    {
      id: 'actuator_speaker',
      concept_term: 'jammern',
      category: 'Audio-Ausgabe',
    },
  ],
  states: [
    {
      id: 'state_zufrieden',
      name: 'Pflanze ist zufrieden',
      description: 'Ausgangszustand, solange genug Feuchtigkeit vorhanden ist.',
      is_initial_state: true,
      entry_actions: ['LED ausschalten'],
      trigger_actions: [
        {
          id: 'trigger_wird_durstig',
          trigger: 'Bodenfeuchte fällt unter den Schwellenwert',
          trigger_type: 'Sensor',
          actions: [],
          target_state_id: 'state_durstig',
        },
      ],
    },
    {
      id: 'state_durstig',
      name: 'Pflanze hat Durst',
      description: 'Die Pflanze macht in Intervallen auf sich aufmerksam.',
      is_initial_state: false,
      entry_actions: ['LED rot leuchten lassen'],
      trigger_actions: [
        {
          id: 'trigger_jammern',
          trigger: 'Intervall abgelaufen',
          trigger_type: 'Time/Timer',
          actions: ['Jammer-Sound abspielen'],
          target_state_id: null,
        },
        {
          id: 'trigger_wird_gegossen',
          trigger: 'Bodenfeuchte steigt plötzlich an',
          trigger_type: 'Sensor',
          actions: [],
          target_state_id: 'state_giessen',
        },
      ],
    },
    {
      id: 'state_giessen',
      name: 'Pflanze wird gegossen',
      description: 'Belohnungszustand, kehrt danach automatisch zurück.',
      is_initial_state: false,
      entry_actions: ['Grün blinken', 'Fröhlichen Sound abspielen'],
      trigger_actions: [
        {
          id: 'trigger_belohnung_vorbei',
          trigger: 'Belohnungsanimation beendet',
          trigger_type: 'Time/Timer',
          actions: [],
          target_state_id: 'state_zufrieden',
        },
      ],
    },
  ],
  global_actions: [],
  open_questions: [
    {
      id: 'question_1',
      question: 'Ab wann gilt die Pflanze als „durstig"?',
      reference: 'sensor_bodenfeuchte',
      type: 'SingleChoice',
      options: ['20 % Bodenfeuchte', '30 % Bodenfeuchte', '40 % Bodenfeuchte'],
    },
    {
      id: 'question_2',
      question: 'Wie lange soll das grüne Blinken beim Gießen anhalten?',
      reference: 'state_giessen',
      type: 'SingleChoice',
      options: ['3× blinken', '5× blinken', '10× blinken'],
    },
    {
      id: 'question_3',
      question: 'Was soll bei Überflutung passieren?',
      reference: 'state_zufrieden',
      type: 'Text',
      options: null,
    },
  ],
}

export const MOCK_ANALYZE_REFINED: AnalyzeResult = {
  ...MOCK_ANALYZE_INITIAL,
  states: [
    ...MOCK_ANALYZE_INITIAL.states,
    {
      id: 'state_ueberflutung',
      name: 'Zu viel Wasser',
      description: 'Warnzustand bei zu hoher Bodenfeuchte.',
      is_initial_state: false,
      entry_actions: ['LED blau pulsieren lassen'],
      trigger_actions: [
        {
          id: 'trigger_wasser_normalisiert',
          trigger: 'Bodenfeuchte fällt wieder unter 85 %',
          trigger_type: 'Sensor',
          actions: [],
          target_state_id: 'state_zufrieden',
        },
      ],
    },
  ],
  open_questions: [
    {
      id: 'question_4',
      question: 'Soll das Jammern mit der Zeit dramatischer werden?',
      reference: 'state_durstig',
      type: 'SingleChoice',
      options: ['Ja, Lautstärke steigt', 'Nein, immer gleich'],
    },
  ],
}
