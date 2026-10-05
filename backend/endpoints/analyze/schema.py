schema2 = {
    "type": "object",
    "properties": {
        # ---------------- META DATEN ----------------   
        "project_metadata": {
            "type": "object",
            "properties": {
                "working_title": {"type": "string"},
                "core_intention": {"type": "string"}
            },
            # required = muss von AI ausgefüllt werden
            "required": ["working_title", "core_intention"],
            "additionalProperties": False
        },
        # ---------------- AKTÖRE ----------------  
        "actors_entities": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    # id zum Referenzieren in open_questions, z.B. "actor_nutzer"
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": ["Human", "Object", "Animal", "Other"]
                    },
                    "description": {"type": "string"}
                },
                "required": ["id", "name", "type", "description"],
                "additionalProperties": False
            }
        },
        # ---------------- SENSOREN ----------------  
        "sensors": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    # id zum Referenzieren in open_questions, z.B. "sensor_erde_trocken"
                    "id": {"type": "string"},
                    "concept_term": {"type": "string"},
                    "category": {"type": "string"}
                },
                "required": ["id", "concept_term", "category"],
                "additionalProperties": False
            }
        },
        # ---------------- AKTOREN ----------------  
        "actuators": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    # id zum Referenzieren in open_questions, z.B. "actuator_led_rot"
                    "id": {"type": "string"},
                    "concept_term": {"type": "string"},
                    "category": {"type": "string"}
                },
                "required": ["id", "concept_term", "category"],
                "additionalProperties": False
            }
        },
        # ---------------- ZUSTÄNDE ----------------  
        "states": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    # id zum Referenzieren in open_questions UND in target_state_id, z.B. "state_durst"
                    "id": {"type": "string"},
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    # Nur ein Zustand darf hier true haben 
                    "is_initial_state": {"type": "boolean"},
                    # Übergansaktionen: Wenn in den Zustand gewechselt wird dann ...
                    "entry_actions": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    # Triggeraktionen: Situationen (Trigger + ausgelöste Aktionen) die in diesem Zustand auftreten können
                    "trigger_actions": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                # id zum Referenzieren in open_questions, z.B. "trigger_beruehrung_durst"
                                "id": {"type": "string"},
                                "trigger": {"type": "string"},
                                "trigger_type": {
                                    "type": "string",
                                    "enum": ["Sensor", "User-Interaction", "Time/Timer", "Other"]
                                },
                                # Aktionen die durch diesen Trigger ausgelöst werden
                                "actions": {
                                    "type": "array",
                                    "items": {"type": "string"}
                                },
                                # null bedeute, dass es dadurch zu keinem Zustandwechsel kommt.
                                # Referenziert die "id" eines Eintrags in "states", NICHT den Namen.
                                "target_state_id": {"type": ["string", "null"]}
                            },
                            "required": ["id", "trigger", "trigger_type", "actions", "target_state_id"],
                            "additionalProperties": False
                        }
                    }
                },
                "required": ["id", "name", "description", "is_initial_state", "entry_actions", "trigger_actions"],
                "additionalProperties": False
            }
        },
        # ---------------- GLOBALE AKTIONEN ---------------- 
        "global_actions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "trigger": {"type": "string"},
                    "trigger_type": {
                        "type": "string",
                        "enum": ["Sensor", "User-Interaction", "Time/Timer", "Other"]
                    },
                    "actions": {
                        "type": "array",
                        "items": {"type": "string"}
                    },
                    "target_state_id": {"type": ["string", "null"]}
                },
                "required": ["id", "trigger", "trigger_type", "actions", "target_state_id"],
                "additionalProperties": False
            }
        },
        # ---------------- Offene Fragem ---------------- 
        "open_questions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "question": {"type": "string"},
                    "reference": {"type": "string"},
                    "type": {
                        "type": "string",
                        "enum": ["SingleChoice", "MultipleChoice", "Text"]
                    },
                    "options": {
                        "type": ["array", "null"],
                        "items": {"type": "string"}
                    }
                },
                "required": ["id", "question", "reference", "type", "options"],
                "additionalProperties": False
            }
        }

    },
    "required": [
        "project_metadata",
        "actors_entities",
        "sensors",
        "actuators",
        "states",
        "global_actions",
        "open_questions"
    ],
    "additionalProperties": False
}
