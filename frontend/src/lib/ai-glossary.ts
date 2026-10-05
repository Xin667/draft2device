export interface AITerm {
  term: string;
  explanation: string;
  category?: string;
}

// Globaler Speicher für alle von OpenAI erkannten Begriffe
export const GLOBAL_AI_TERMS = new Map<string, AITerm>();
const analyzedTexts = new Set<string>();

const listeners: Array<() => void> = [];

export function subscribeToGlossary(callback: () => void) {
  listeners.push(callback);
  return () => {
    const idx = listeners.indexOf(callback);
    if (idx !== -1) listeners.splice(idx, 1);
  };
}

function notifyListeners() {
  listeners.forEach((fn) => fn());
}

export async function requestIoTExplanation(text: string) {
  const clean = text?.trim();
  if (!clean || clean.length < 3 || analyzedTexts.has(clean)) return;

  analyzedTexts.add(clean);

  try {
    const res = await fetch('/api/glossary/extract-and-explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean }),
    });

    if (!res.ok) return;

    const data = await res.json();
    const terms: AITerm[] = data.terms || [];

    if (terms.length > 0) {
      terms.forEach((t) => {
        GLOBAL_AI_TERMS.set(t.term.toLowerCase(), t);
      });
      notifyListeners();
    }
  } catch (err) {
    console.error('Fehler bei Glossar-Abfrage:', err);
  }
}