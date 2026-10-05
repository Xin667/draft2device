// src/lib/glossary-match.ts
import type { AITerm } from './ai-glossary';

/**
 * Erstellt dynamisch einen regulären Ausdruck aus den von der KI gefundenen Begriffen.
 */
export function buildRegexFromTerms(terms: AITerm[]): RegExp | null {
  if (!terms || terms.length === 0) return null;

  // Längere Begriffe zuerst sortieren, damit z. B. "Logikpegel 3.3V" vor "Logikpegel" gematcht wird
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);

  const escapedPatterns = sorted.map((t) =>
    t.term.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
  );

  return new RegExp(`(${escapedPatterns.join('|')})`, 'gi');
}