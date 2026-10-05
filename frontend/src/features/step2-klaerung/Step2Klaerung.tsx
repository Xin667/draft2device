import React, { useState } from 'react';
import type { OpenQuestion, AnswersMap, AnalyzeResult } from '@/api/types';
import { useProjectStore } from '@/store/state';

/** Findet den menschenlesbaren Namen des referenzierten Elements. */
function resolveReference(
  reference: string,
  structure: AnalyzeResult,
): string | null {
  const allItems = [
    ...structure.actors_entities,
    ...structure.sensors,
    ...structure.actuators,
    ...structure.states,
  ] as Array<{ id: string; name?: string; concept_term?: string }>;

  const found = allItems.find((item) => item.id === reference);
  if (!found) return null;
  return found.name ?? found.concept_term ?? found.id;
}

export const Step2Klaerung: React.FC = () => {
  const structure = useProjectStore((s) => s.structure);
  const status = useProjectStore((s) => s.status);
  const storeError = useProjectStore((s) => s.error);
  const submitAnswers = useProjectStore((s) => s.submitAnswers);

  const [answers, setAnswers] = useState<AnswersMap>({});
  const [extraPrompt, setExtraPrompt] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  /** Baut ein AnswersMap aus dem Formular-State. */
  function updateAnswer(questionId: string, value: string | string[]) {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
  }

  async function handleRefine() {
    if (!structure) return;
    setIsRefining(true);
    const result = await submitAnswers(
      structure.open_questions,
      answers,
      extraPrompt,
    );
    setIsRefining(false);
    if (result) {
      setAnswers({});
      setExtraPrompt('');
    }
  }

  // ------------------------------------------------------------------
  // Lade- / Leerzustand
  // ------------------------------------------------------------------
  if (!structure) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-2xl font-bold font-sans text-[#1E2430]">
            Schritt 2: Analyse & Struktur-Klärung
          </h2>
          <p className="text-sm text-[#5A6172] mt-1">
            Überprüfe die extrahierte Struktur und fülle die notwendigen Systemlücken aus.
          </p>
        </div>
        <div className="rounded-xl border border-[#D9D3C7] bg-[#FAF8F4] p-8 text-center text-sm text-[#5A6172]">
          {status === 'loading'
            ? 'KI analysiert deine Eingabe …'
            : 'Keine Analysedaten vorhanden. Bitte starte die Analyse in Schritt 1.'}
        </div>
      </div>
    );
  }

  // ------------------------------------------------------------------
  // Daten aufbereiten
  // ------------------------------------------------------------------
  const {
    project_metadata,
    actors_entities,
    sensors,
    actuators,
    states,
    open_questions,
  } = structure;

  const unansweredQuestions = open_questions.filter(
    (q) => !answers[q.id] || (Array.isArray(answers[q.id]) && (answers[q.id] as string[]).length === 0),
  );

  return (
    <div className="space-y-8 w-full max-w-full">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold font-sans text-[#1E2430]">
          Schritt 2. Analyse & Struktur-Klärung
        </h2>
        <p className="text-sm text-[#5A6172] mt-1">
          Überprüfe die extrahierte Struktur und fülle die notwendigen Systemlücken aus.
        </p>
      </div>

      {/* Projekt-Metadaten */}
      <div className="rounded-xl border border-[#C46A2B]/30 bg-orange-50/40 p-4">
        <h3 className="font-semibold text-sm text-[#1E2430]">
          {project_metadata.working_title}
        </h3>
        <p className="text-xs text-[#5A6172] mt-1">
          {project_metadata.core_intention}
        </p>
      </div>

      {/* Struktur-Übersicht */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Akteure */}
        <div className="bg-[#FAF8F4] border border-[#D9D3C7] rounded-xl p-4">
          <h3 className="font-semibold text-sm text-[#1E2430]">
            Akteure / Entitäten ({actors_entities.length})
          </h3>
          {actors_entities.length === 0 ? (
            <p className="text-xs text-[#5A6172] mt-2">Keine erkannt.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {actors_entities.map((a) => (
                <li key={a.id} className="text-xs text-[#5A6172]">
                  <span className="font-medium text-[#1E2430]">{a.name}</span>
                  <span className="ml-1 text-[10px] text-[#9CA3AF]">
                    ({a.type})
                  </span>
                  {' — '}
                  {a.description}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Sensoren & Aktoren */}
        <div className="bg-[#FAF8F4] border border-[#D9D3C7] rounded-xl p-4">
          <h3 className="font-semibold text-sm text-[#1E2430]">
            Sensoren ({sensors.length}) / Aktoren ({actuators.length})
          </h3>
          {[...sensors, ...actuators].length === 0 ? (
            <p className="text-xs text-[#5A6172] mt-2">Keine erkannt.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {sensors.map((s) => (
                <li key={s.id} className="text-xs text-[#5A6172]">
                  📡 <span className="font-medium text-[#1E2430]">{s.concept_term}</span>
                </li>
              ))}
              {actuators.map((a) => (
                <li key={a.id} className="text-xs text-[#5A6172]">
                  🔧 <span className="font-medium text-[#1E2430]">{a.concept_term}</span>
                  <span className="ml-1 text-[10px] text-[#9CA3AF]">
                    ({a.category})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Zustände */}
        <div className="bg-[#FAF8F4] border border-[#D9D3C7] rounded-xl p-4">
          <h3 className="font-semibold text-sm text-[#1E2430]">
            Zustände ({states.length})
          </h3>
          {states.length === 0 ? (
            <p className="text-xs text-[#5A6172] mt-2">Keine definiert.</p>
          ) : (
            <ul className="mt-2 space-y-1">
              {states.map((s) => (
                <li key={s.id} className="text-xs text-[#5A6172]">
                  <span className="font-medium text-[#1E2430]">{s.name}</span>
                  {s.is_initial_state && (
                    <span className="ml-1 rounded bg-green-100 px-1.5 py-0.5 text-[10px] text-green-700">
                      Start
                    </span>
                  )}
                  {' — '}
                  {s.description}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Status */}
        <div className="bg-[#FAF8F4] border border-[#D9D3C7] rounded-xl p-4">
          <h3 className="font-semibold text-sm text-[#1E2430]">
            Status
          </h3>
          <p className="text-xs text-[#5A6172] mt-2">
            {open_questions.length === 0
              ? 'Keine offenen Fragen — die Struktur ist vollständig.'
              : `${unansweredQuestions.length} von ${open_questions.length} Fragen noch offen.`}
          </p>
        </div>
      </div>

      {/* Offene Fragen */}
      {open_questions.length > 0 && (
        <>
          <hr className="border-[#D9D3C7]" />

          <div className="space-y-6">
            <h3 className="font-bold text-lg text-[#1E2430]">
              Offene Fragen ({unansweredQuestions.length} unbeantwortet)
            </h3>

            {open_questions.map((question) => (
              <QuestionBlock
                key={question.id}
                question={question}
                structure={structure}
                value={answers[question.id]}
                onChange={(val) => updateAnswer(question.id, val)}
              />
            ))}
          </div>
        </>
      )}

      {/* Fehleranzeige */}
      {storeError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {storeError.message}
        </div>
      )}

      <hr className="border-[#D9D3C7]" />

      {/* Freier Prompt + Aktionen */}
      <div className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#1E2430]">
            Ergänzende Anweisungen an die KI
          </label>
          <textarea
            value={extraPrompt}
            onChange={(e) => setExtraPrompt(e.target.value)}
            placeholder="Gib der KI spezifische Anweisungen, wie verbleibende Lücken gefüllt werden sollen..."
            rows={3}
            className="w-full rounded-xl border border-[#D9D3C7] p-4 text-sm focus:outline-none focus:border-[#C46A2B] resize-none"
          />
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={handleRefine}
            disabled={isRefining}
            className="inline-flex items-center gap-2 rounded-xl bg-[#C46A2B] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#A0522D] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isRefining ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                KI verfeinert...
              </>
            ) : (
              'Struktur verfeinern'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Frage-Block
// ---------------------------------------------------------------------------

interface QuestionBlockProps {
  question: OpenQuestion;
  structure: AnalyzeResult;
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}

function QuestionBlock({ question, structure, value, onChange }: QuestionBlockProps) {
  const referenceName = resolveReference(question.reference, structure);

  return (
    <div className="rounded-xl border border-[#D9D3C7] bg-white p-4">
      <p className="text-sm font-medium text-[#1E2430]">
        {question.question}
      </p>
      {referenceName && (
        <p className="text-xs text-[#9CA3AF] mt-1">
          Bezieht sich auf: <span className="font-medium">{referenceName}</span>
        </p>
      )}

      <div className="mt-3">
        {question.type === 'SingleChoice' && question.options && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {question.options.map((option) => (
              <label
                key={option}
                className={`flex items-center gap-2 border p-3 rounded-xl cursor-pointer transition-colors ${
                  value === option
                    ? 'border-[#C46A2B] bg-orange-50/40'
                    : 'border-[#D9D3C7] hover:border-[#C46A2B]/50'
                }`}
              >
                <input
                  type="radio"
                  name={question.id}
                  value={option}
                  checked={value === option}
                  onChange={() => onChange(option)}
                  className="accent-[#C46A2B]"
                />
                <span className="text-sm text-[#1E2430]">
                  {option}
                </span>
              </label>
            ))}
          </div>
        )}

        {question.type === 'MultipleChoice' && question.options && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {question.options.map((option) => {
              const selected = Array.isArray(value) ? value.includes(option) : false;
              return (
                <label
                  key={option}
                  className={`flex items-center gap-2 border p-3 rounded-xl cursor-pointer transition-colors ${
                    selected
                      ? 'border-[#C46A2B] bg-orange-50/40'
                      : 'border-[#D9D3C7] hover:border-[#C46A2B]/50'
                  }`}
                >
                  <input
                    type="checkbox"
                    value={option}
                    checked={selected}
                    onChange={() => {
                      const current = Array.isArray(value) ? value : [];
                      onChange(
                        selected
                          ? current.filter((v) => v !== option)
                          : [...current, option],
                      );
                    }}
                    className="accent-[#C46A2B]"
                  />
                  <span className="text-sm text-[#1E2430]">
                    {option}
                  </span>
                </label>
              );
            })}
          </div>
        )}

        {question.type === 'Text' && (
          <textarea
            value={typeof value === 'string' ? value : ''}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Deine Antwort..."
            rows={3}
            className="w-full rounded-xl border border-[#D9D3C7] p-3 text-sm focus:outline-none focus:border-[#C46A2B] resize-none"
          />
        )}
      </div>
    </div>
  );
}