
import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  FileArchive,
  Settings2,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  ConfigQuestion,
  GeneratedCodeResult,
  GeneratedFile,
} from '@/api/types';
import { useProjectStore, type ProjectState } from '@/store/state';

async function loadCode(projectId: string): Promise<GeneratedCodeResult> {
  const response = await fetch(`/code/${encodeURIComponent(projectId)}`);

  if (response.ok) {
    return response.json() as Promise<GeneratedCodeResult>;
  }

  const generated = await fetch('/code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project_id: projectId }),
  });

  if (!generated.ok) {
    throw new Error(
      `Code konnte nicht geladen werden (HTTP ${generated.status}).`,
    );
  }

  return generated.json() as Promise<GeneratedCodeResult>;
}

// ---------------------------------------------------------------------------
// Lokal gespeicherte Konfigurationsantworten
// ---------------------------------------------------------------------------

function answersStorageKey(projectId: string): string {
  return `code-answers-${projectId}`;
}

function loadStoredAnswers(projectId: string): Record<string, string> {
  try {
    const stored = localStorage.getItem(answersStorageKey(projectId));

    if (!stored) {
      return {};
    }

    const parsed = JSON.parse(stored);

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function saveStoredAnswers(
  projectId: string,
  answers: Record<string, string>,
): void {
  try {
    localStorage.setItem(
      answersStorageKey(projectId),
      JSON.stringify(answers),
    );
  } catch {
    // localStorage kann z. B. im privaten Modus blockiert sein.
    // Das Backend speichert die Antworten trotzdem weiterhin.
  }
}

// Farbpunkt je Dateiendung — hilft beim schnellen Scannen der Tableiste
const EXTENSION_COLORS: Record<string, string> = {
  ino: '#C46A2B',
  cpp: '#5B8DEF',
  h: '#5B8DEF',
  py: '#E0B84C',
  json: '#7A8190',
  txt: '#7A8190',
};

function extensionColor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return EXTENSION_COLORS[ext] ?? '#9AA0AA';
}

export function Step5Quellcode() {
  const projectId = useProjectStore(
    (s: ProjectState) => s.projectId,
  );

  const [files, setFiles] = useState<GeneratedFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Konfigurationsfragen
  const [configQuestions, setConfigQuestions] = useState<ConfigQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [isSubmittingAnswers, setIsSubmittingAnswers] = useState(false);

  // Freier Änderungs-Prompt
  const [codePrompt, setCodePrompt] = useState('');
  const [isModifyingCode, setIsModifyingCode] = useState(false);

  const activeFile =
    files.find((file) => file.path === activeFilePath) ?? files[0];

  const code = activeFile?.content ?? '';
  const codeLines = code.length ? code.split('\n') : [];

  const activeFileName =
    activeFile?.path.split('/').pop() || 'aktuelle Datei';

  // ---------------------------------------------------------------------------
  // Code laden
  // ---------------------------------------------------------------------------

  useEffect(() => {
    if (!projectId) {
      setError('Kein aktives Projekt vorhanden.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    loadCode(projectId)
      .then((result) => {
        setFiles(result.files);
        setActiveFilePath(result.files[0]?.path ?? '');

        // Bereits im Browser gespeicherte echte Nutzerantworten laden.
        const storedAnswers = loadStoredAnswers(projectId);

        // GET /code liefert aktuell kein "unanswered".
        // Deshalb nehmen wir alle Config-Fragen und entfernen diejenigen,
        // die laut localStorage bereits beantwortet wurden.
        const allQuestions = result.config_questions ?? [];

        const unansweredQuestions = allQuestions.filter(
          (question) =>
            !Object.prototype.hasOwnProperty.call(
              storedAnswers,
              question.key,
            ),
        );

        setConfigQuestions(unansweredQuestions);

        // Wichtig:
        // NICHT die example-Werte in answers übernehmen.
        // Examples sind nur Defaults/Platzhalter und keine echten Antworten.
        setAnswers(storedAnswers);
      })
      .catch((requestError: unknown) => {
        setError(
          requestError instanceof Error
            ? requestError.message
            : 'Code konnte nicht geladen werden.',
        );
      })
      .finally(() => setLoading(false));
  }, [projectId]);

  // ---------------------------------------------------------------------------
  // Konfigurationsfragen beantworten
  // ---------------------------------------------------------------------------

  const handleSubmitAnswers = async () => {
    if (!projectId || isSubmittingAnswers) return;

    setIsSubmittingAnswers(true);
    setError(null);

    try {
      // Nur Antworten für aktuell offene Fragen übertragen.
      // Leere Text-/Select-Werte werden nicht als beantwortet gespeichert.
      //
      // Slider brauchen einen tatsächlichen Wert. Falls der Nutzer den
      // Slider nicht bewegt hat, wird dessen sichtbarer Default verwendet.
      const submittedAnswers: Record<string, string> = {};

      for (const question of configQuestions) {
        let value = answers[question.key];

        if (
          question.input_type === 'slider' &&
          (value === undefined || value === '')
        ) {
          value = String(
            question.example ??
              question.min ??
              0,
          );
        }

        if (value !== undefined && value.trim() !== '') {
          submittedAnswers[question.key] = value;
        }
      }

      if (Object.keys(submittedAnswers).length === 0) {
        setError('Bitte beantworte mindestens eine Konfigurationsfrage.');
        return;
      }

      const response = await fetch(
        `/code/${encodeURIComponent(projectId)}/answers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            answers: submittedAnswers,
          }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `Antworten konnten nicht gespeichert werden (HTTP ${response.status})` +
            (errorText ? `: ${errorText}` : '.'),
        );
      }

      const result = (await response.json()) as GeneratedCodeResult;

      // Bereits gespeicherte Antworten mit den neuen Antworten kombinieren.
      const storedAnswers = loadStoredAnswers(projectId);

      const mergedAnswers = {
        ...storedAnswers,
        ...submittedAnswers,
      };

      saveStoredAnswers(projectId, mergedAnswers);
      setAnswers(mergedAnswers);

      setFiles(result.files);

      // Aktive Datei möglichst beibehalten.
      setActiveFilePath((currentPath) => {
        const stillExists = result.files.some(
          (file) => file.path === currentPath,
        );

        return stillExists
          ? currentPath
          : (result.files[0]?.path ?? '');
      });

      // Der /answers-Endpoint liefert "unanswered".
      // Dadurch verschwinden beantwortete Fragen sofort.
      const remainingQuestions =
        result.unanswered ??
        (result.config_questions ?? []).filter(
          (question) =>
            !Object.prototype.hasOwnProperty.call(
              mergedAnswers,
              question.key,
            ),
        );

      setConfigQuestions(remainingQuestions);

      setIsPromptOpen(false);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Antworten konnten nicht gespeichert werden.',
      );
    } finally {
      setIsSubmittingAnswers(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Freie Änderung am bestehenden Quellcode
  //
  // POST /code unterstützt bereits Revisionen:
  // project_id + message -> vorherigen Code laden -> Code über LLM ändern.
  // ---------------------------------------------------------------------------

  const handleModifyCode = async () => {
    if (!projectId || isModifyingCode) return;

    const prompt = codePrompt.trim();

    if (!prompt) {
      setError('Bitte beschreibe zuerst die gewünschte Änderung.');
      return;
    }

    setIsModifyingCode(true);
    setError(null);

    const previousActiveFilePath = activeFilePath;

    try {
      // ------------------------------------------------------------
      // 1. Bestehenden Code über POST /code ändern
      // ------------------------------------------------------------

      const response = await fetch('/code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: projectId,
          message: prompt,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();

        throw new Error(
          `Code konnte nicht geändert werden (HTTP ${response.status})` +
            (errorText ? `: ${errorText}` : '.'),
        );
      }

      // POST /code speichert bereits den neu generierten Code.
      await response.json();

      // ------------------------------------------------------------
      // 2. Neu gespeicherten Code über GET laden
      //
      // GET /code/:projectId setzt serverseitig bereits vorhandene
      // CODE_ANSWERS_ARTIFACT_TYPE-Werte wieder in die Platzhalter ein.
      // ------------------------------------------------------------

      const finalResult = await loadCode(projectId);

      // ------------------------------------------------------------
      // 3. Frontend aktualisieren
      // ------------------------------------------------------------

      setFiles(finalResult.files);

      const previousFileStillExists = finalResult.files.some(
        (file) => file.path === previousActiveFilePath,
      );

      setActiveFilePath(
        previousFileStillExists
          ? previousActiveFilePath
          : (finalResult.files[0]?.path ?? ''),
      );

      // Lokal gespeicherte echte Antworten berücksichtigen.
      const storedAnswers = loadStoredAnswers(projectId);

      setAnswers(storedAnswers);

      const allQuestions =
        finalResult.config_questions ?? [];

      const unansweredQuestions = allQuestions.filter(
        (question) =>
          !Object.prototype.hasOwnProperty.call(
            storedAnswers,
            question.key,
          ),
      );

      setConfigQuestions(unansweredQuestions);

      setCodePrompt('');
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'Code konnte nicht geändert werden.',
      );
    } finally {
      setIsModifyingCode(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Code kopieren
  // ---------------------------------------------------------------------------

  const handleCopy = async () => {
    if (!code) return;

    await navigator.clipboard.writeText(code);

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ---------------------------------------------------------------------------
  // Aktuelle Datei herunterladen
  // ---------------------------------------------------------------------------

  const handleDownload = () => {
    if (!code) return;

    const link = document.createElement('a');

    link.href = URL.createObjectURL(
      new Blob([code], {
        type: 'text/plain;charset=utf-8',
      }),
    );

    link.download =
      activeFileName === 'aktuelle Datei'
        ? 'code.txt'
        : activeFileName;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(link.href);
  };

  // ---------------------------------------------------------------------------
  // Komplettes Projekt als ZIP
  // ---------------------------------------------------------------------------

  const handleDownloadZip = () => {
    if (!projectId || zipDownloading) return;

    setZipDownloading(true);

    window.open(
      `/code/${encodeURIComponent(projectId)}/download`,
      '_blank',
      'noopener,noreferrer',
    );

    window.setTimeout(
      () => setZipDownloading(false),
      500,
    );
  };

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-24 text-center text-[#5A6172]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#C46A2B] border-t-transparent" />
        <p className="text-sm font-medium">
          Quellcode wird vorbereitet …
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Fehler
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>

        <button
          type="button"
          onClick={() => setError(null)}
          className="rounded-full border border-[#D9D3C7] px-4 py-2 text-xs font-semibold text-[#5A6172] transition hover:bg-[#FAF8F4]"
        >
          Meldung schließen
        </button>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Hauptansicht
  // ---------------------------------------------------------------------------

  return (
   <div className="space-y-6 w-full max-w-full">
      <div className="space-y-4 border-b border-[#D9D3C7] pb-5">
        <div>
          <h2 className="text-2xl font-bold font-sans text-[#1E2430]">
            Schritt 5 · Quellcode
          </h2>
          <p className="text-sm text-[#5A6172] mt-1">
            Der generierte Quellcode für deinen Microcontroller.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {configQuestions.length > 0 && (
            <button
              type="button"
              onClick={() => setIsPromptOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-[#1E2430] px-4 py-2 text-xs font-semibold text-[#1E2430] transition hover:bg-[#1E2430] hover:text-white"
            >
              <Settings2 size={14} aria-hidden="true" />

              Konfigurieren

              <span className="ml-0.5 rounded-full bg-[#C46A2B] px-1.5 text-[10px] text-white">
                {configQuestions.length}
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={zipDownloading}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#D9D3C7] px-4 py-2 text-xs font-semibold text-[#5A6172] transition hover:bg-[#FAF8F4] disabled:opacity-60"
          >
            <FileArchive size={14} aria-hidden="true" />

            {zipDownloading
              ? 'ZIP wird erstellt …'
              : 'Projekt als ZIP'}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            disabled={!code}
            className="inline-flex items-center gap-1.5 rounded-full bg-[#007A5A] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#00684D] disabled:opacity-50"
          >
            <Download size={14} aria-hidden="true" />

            {activeFileName} herunterladen
          </button>
        </div>
      </div>

      {/* Konfigurationsdialog */}

      {isPromptOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#1E2430]/60 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="code-config-title"
        >
          <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#D9D3C7] bg-[#FAF8F4] p-6 shadow-2xl">

            <div className="mb-6 flex items-start justify-between gap-4">
              <div>
                <h3
                  id="code-config-title"
                  className="text-lg font-bold text-[#1E2430]"
                >
                  Code konfigurieren
                </h3>

                <p className="mt-1 text-sm text-[#5A6172]">
                  Beantworte die offenen Fragen für deinen generierten Code.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsPromptOpen(false)}
                aria-label="Dialog schließen"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#5A6172] transition hover:bg-[#EFEBE2] hover:text-[#1E2430]"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="space-y-6">
              {configQuestions.map((question) => {
                const value =
                  answers[question.key] ?? '';

                const sliderValue =
                  value ||
                  question.example ||
                  question.min ||
                  0;

                return (
                  <div
                    key={question.key}
                    className="space-y-2"
                  >
                    <div className="flex items-baseline justify-between gap-3">
                      <label
                        htmlFor={`q-${question.key}`}
                        className="text-sm font-semibold text-[#1E2430]"
                      >
                        {question.question}
                      </label>

                      {question.input_type === 'slider' && (
                        <span className="shrink-0 font-mono text-sm font-semibold text-[#C46A2B]">
                          {sliderValue}
                        </span>
                      )}
                    </div>

                    {question.input_type === 'slider' ? (
                      <input
                        id={`q-${question.key}`}
                        type="range"
                        min={question.min ?? 0}
                        max={question.max ?? 100}
                        value={sliderValue}
                        onChange={(event) =>
                          setAnswers((current) => ({
                            ...current,
                            [question.key]:
                              event.target.value,
                          }))
                        }
                        className="w-full accent-[#C46A2B]"
                      />
                    ) : question.input_type ===
                        'single_choice' &&
                      question.options?.length ? (
                      <select
                        id={`q-${question.key}`}
                        value={value}
                        onChange={(event) =>
                          setAnswers((current) => ({
                            ...current,
                            [question.key]:
                              event.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-[#D9D3C7] bg-white px-3 py-2 text-sm text-[#1E2430] outline-none transition focus:border-[#C46A2B] focus:ring-2 focus:ring-[#C46A2B]/20"
                      >
                        <option value="">
                          Bitte auswählen
                        </option>

                        {question.options.map(
                          (option) => (
                            <option
                              key={option}
                              value={option}
                            >
                              {option}
                            </option>
                          ),
                        )}
                      </select>
                    ) : (
                      <input
                        id={`q-${question.key}`}
                        type="text"
                        value={value}
                        placeholder={
                          question.example ?? ''
                        }
                        onChange={(event) =>
                          setAnswers((current) => ({
                            ...current,
                            [question.key]:
                              event.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-[#D9D3C7] bg-white px-3 py-2 text-sm text-[#1E2430] outline-none transition placeholder:text-[#9AA0AA] focus:border-[#C46A2B] focus:ring-2 focus:ring-[#C46A2B]/20"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-7 flex justify-end gap-3 border-t border-[#D9D3C7] pt-5">
              <button
                type="button"
                onClick={() =>
                  setIsPromptOpen(false)
                }
                className="rounded-full border border-[#D9D3C7] px-4 py-2 text-xs font-semibold text-[#5A6172] transition hover:bg-[#EFEBE2]"
              >
                Abbrechen
              </button>

              <button
                type="button"
                onClick={() =>
                  void handleSubmitAnswers()
                }
                disabled={isSubmittingAnswers}
                className="rounded-full bg-[#007A5A] px-4 py-2 text-xs font-semibold text-white transition hover:bg-[#00684D] disabled:opacity-60"
              >
                {isSubmittingAnswers
                  ? 'Speichern …'
                  : 'Antworten übernehmen'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quellcode + Änderung */}

      <div className="overflow-hidden rounded-2xl border border-gray-800 bg-[#12151B] shadow-xl">

        {/* Dateireiter */}

        <div className="flex min-h-12 items-end border-b border-gray-800 bg-[#1A1E27]">
          <div className="flex items-center gap-1.5 self-stretch px-4">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-500/80" />
          </div>

          <div className="flex min-w-0 flex-1 self-stretch overflow-x-auto">
            {files.map((file) => {
              const isActive =
                file.path === activeFile?.path;

              return (
                <button
                  key={file.path}
                  type="button"
                  title={file.path}
                  onClick={() =>
                    setActiveFilePath(file.path)
                  }
                  className={`flex min-w-0 flex-1 items-center gap-2 truncate border-r border-[#2B313F] px-3 text-xs font-mono transition ${
                    isActive
                      ? 'border-t-2 border-t-[#C46A2B] bg-[#12151B] text-gray-200'
                      : 'border-t-2 border-t-transparent text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        extensionColor(file.path),
                    }}
                    aria-hidden="true"
                  />

                  {file.path}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={handleCopy}
            disabled={!code}
            title={`Inhalt von ${activeFileName} kopieren`}
            aria-label={`Inhalt von ${activeFileName} kopieren`}
            className="mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-gray-400 transition hover:bg-[#2B313F] hover:text-white disabled:opacity-40"
          >
            {copied ? (
              <Check
                size={16}
                aria-hidden="true"
              />
            ) : (
              <Copy
                size={16}
                aria-hidden="true"
              />
            )}
          </button>
        </div>

        {copied && (
          <div className="border-b border-[#2B313F] bg-[#1A1E27] px-4 py-1 text-right text-[10px] font-mono text-[#D9D3C7]">
            {activeFileName} kopiert
          </div>
        )}

        {/* Code mit Zeilennummern */}

        <div className="max-h-[560px] min-h-[420px] overflow-auto">
          {codeLines.length === 0 ? (
            <div className="flex h-[420px] items-center justify-center text-sm text-gray-500">
              Keine Datei ausgewählt.
            </div>
          ) : (
            <pre className="flex text-xs leading-relaxed">
              <code className="select-none border-r border-[#2B313F] px-3 py-4 text-right font-mono text-gray-600">
                {codeLines.map((_, i) => (
                  <div key={i}>{i + 1}</div>
                ))}
              </code>

              <code className="flex-1 px-4 py-4 font-mono text-emerald-400">
                {codeLines.map(
                  (lineText, i) => (
                    <div key={i}>
                      {lineText || '\u00A0'}
                    </div>
                  ),
                )}
              </code>
            </pre>
          )}
        </div>

        {/* Freie Codeänderung */}

        <div className="border-t border-gray-800 bg-[#1A1E27] p-4">
          <div className="mb-3 flex items-center gap-2 text-gray-300">
            <Sparkles
              size={14}
              className="text-[#C46A2B]"
              aria-hidden="true"
            />

            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              Code ändern
            </span>

            {activeFilePath && (
              <span className="ml-auto truncate font-mono text-[11px] text-gray-500">
                {activeFilePath}
              </span>
            )}
          </div>

          <textarea
            value={codePrompt}
            onChange={(event) =>
              setCodePrompt(event.target.value)
            }
            placeholder="z. B. Ändere den Code so, dass die LED beim Start dreimal blinkt und danach dauerhaft ausgeschaltet bleibt."
            disabled={isModifyingCode}
            rows={3}
            className="w-full resize-y rounded-lg border border-[#2B313F] bg-[#12151B] px-3 py-2.5 text-sm text-gray-200 outline-none transition placeholder:text-gray-600 focus:border-[#C46A2B] focus:ring-2 focus:ring-[#C46A2B]/20 disabled:opacity-60"
          />

          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-gray-500">
              Änderung bezieht sich auf das gesamte Projekt.
            </p>

            <button
              type="button"
              onClick={() =>
                void handleModifyCode()
              }
              disabled={
                isModifyingCode ||
                !codePrompt.trim()
              }
              className="shrink-0 rounded-full bg-[#C46A2B] px-5 py-2 text-xs font-semibold text-white transition hover:bg-[#AD5B22] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isModifyingCode
                ? 'Wird angepasst …'
                : 'Änderung übernehmen'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}