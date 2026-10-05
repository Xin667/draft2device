import React, { useState, useEffect } from 'react';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { extractAndExplainTerms, type ExtractedTerm } from '@/api/api';

const cache = new Map<string, ExtractedTerm[]>();

// Begriffe, die NIEMALS unterstrichen werden sollen (zu banal)
const IGNORED_TERMS = new Set([
  'led', 'leds', '5 mm', '3 mm', 'rot', 'grün', 'blau', 'taster',
  'schalter', 'summer', 'buzzer', 'sensor', 'kabel', 'display',
  'start', 'stop', 'strom', 'spannung', 'masse', 'gnd'
]);

interface GlossaryTextProps {
  text: string | null | undefined;
}

export const GlossaryText: React.FC<GlossaryTextProps> = ({ text }) => {
  const [terms, setTerms] = useState<ExtractedTerm[]>([]);

  useEffect(() => {
    if (!text || text.trim().length < 4) return;

    if (cache.has(text)) {
      setTerms(cache.get(text)!);
      return;
    }

    let isMounted = true;
    extractAndExplainTerms(text).then((found) => {
      if (isMounted && found && found.length > 0) {
        // Trivial-Begriffe herausfiltern
        const filtered = found.filter(
          (item) => !IGNORED_TERMS.has(item.term.trim().toLowerCase())
        );
        cache.set(text, filtered);
        setTerms(filtered);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [text]);

  if (!text) return null;
  if (!terms.length) return <span>{text}</span>;

  // Längste Fachbegriffe zuerst sortieren
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);
  const regex = new RegExp(`\\b(${sorted.map((t) => t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`, 'gi');
  const parts = text.split(regex);

  return (
    <span className="inline">
      {parts.map((part, index) => {
        const match = terms.find((t) => t.term.toLowerCase() === part.toLowerCase());

        if (match) {
          return (
            <HoverCard key={index}>
              <HoverCardTrigger>
                <span
                  onClick={(e) => e.stopPropagation()}
                  className="cursor-help font-semibold text-slate-900 dark:text-slate-100 underline decoration-slate-900/60 dark:decoration-slate-400 decoration-dotted underline-offset-4 hover:decoration-solid transition-colors"
                >
                  {part}
                </span>
              </HoverCardTrigger>
              <HoverCardContent className="z-50 w-72 rounded-lg border border-slate-700 bg-slate-900 p-3 text-slate-100 shadow-2xl text-left font-sans">
                <div className="flex items-center justify-between pb-1 mb-1.5 border-b border-slate-700">
                  <span className="font-mono font-bold text-white text-xs">
                    {match.term}
                  </span>
                  {match.category && (
                    <span className="bg-slate-800 border border-slate-700 text-slate-300 text-[10px] px-1.5 py-0.5 rounded font-mono uppercase tracking-wider">
                      {match.category}
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-300 leading-snug">
                  {match.explanation}
                </p>
              </HoverCardContent>
            </HoverCard>
          );
        }

        return <span key={index}>{part}</span>;
      })}
    </span>
  );
};

export default GlossaryText;