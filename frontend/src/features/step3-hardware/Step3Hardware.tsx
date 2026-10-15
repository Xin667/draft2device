import React, { useEffect, useState } from 'react';
import { selectHardwareOption } from '@/api/api';
import type { HardwareComponent, ControllerComponent, HardwareOption, ControllerOption } from '@/api/types';
import { useProjectStore } from '@/store/state';
import { GlossaryText } from '@/components/GlossaryText';


/** Extrahiert URL aus Markdown [Text](url) oder direktem String */
function extractLink(text: string | null | undefined, fallbackUrl?: string | null): string | null {
  if (fallbackUrl && fallbackUrl.startsWith('http')) return fallbackUrl;
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s)]+/);
  return match ? match[0] : null;
}

/** Bereinigt Markdown-Klammern für die Anzeige */
function cleanDisplayText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [reichelt.de](url) -> reichelt.de
    .replace(/\(https?:\/\/[^\s)]+\)/g, '')   // (http...) entfernen
    .trim();
}

/** Formatiert den Preiswert */
function cleanCost(cost: string | null | undefined): string {
  if (!cost) return 'k. A.';
  const cleaned = cleanDisplayText(cost);
  return cleaned.split('(')[0].trim() || cleaned;
}

export const Step3Hardware: React.FC = () => {
  const projectId = useProjectStore((s) => s.projectId);
  const hardwareData = useProjectStore((s) => s.hardwareData); //  Holt vorhandene Hardware
  const loadOrGenerateHardware = useProjectStore((s) => s.loadOrGenerateHardware); 

  const [components, setComponents] = useState<HardwareComponent[]>([]);
  const [controllers, setControllers] = useState<ControllerComponent[]>([]);
  // Startet nur als loading, wenn WIRKLICH noch keine Daten im Store sind:
  const [loading, setLoading] = useState<boolean>(!hardwareData);
  const [saving, setSaving] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState<string>('');
  const [isRefining, setIsRefining] = useState<boolean>(false);

  // 1. Wenn hardwareData im Store existiert, sofort in die Ansicht übernehmen:
  useEffect(() => {
    if (hardwareData) {
      if (hardwareData.hardware_components) setComponents(hardwareData.hardware_components);
      if (hardwareData.controllers) setControllers(hardwareData.controllers);
      setLoading(false);
    }
  }, [hardwareData]);

  // 2. Nur wenn noch KEINE Hardware im Store existiert, wird geladen/generiert:
  useEffect(() => {
    async function initHardware() {
      if (!projectId) {
        setErrorMessage('Keine aktive Projekt-ID gefunden. Bitte starte bei Schritt 1.');
        setLoading(false);
        return;
      }

      // Wenn Daten schon da sind: Gar nichts tun, Ladekringel sofort aus!
      if (hardwareData) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setErrorMessage(null);
      try {
        const data = await loadOrGenerateHardware();
        if (data?.hardware_components) setComponents(data.hardware_components);
        if (data?.controllers) setControllers(data.controllers);
      } catch (err: any) {
        console.error('Fehler beim Laden der Hardware:', err);
        setErrorMessage(err.message || 'Hardware konnte nicht geladen werden.');
      } finally {
        setLoading(false);
      }
    }

    initHardware();
  }, [projectId, hardwareData, loadOrGenerateHardware]);

 const handleSelectOption = async (targetId: string, optionId: string, isController = false) => {
    if (!projectId) return; // <- Verhindert die Ausführung, wenn projectId null ist

    // Lokale Kopie für TypeScript sichern:
    const currentProjectId = projectId;

    if (isController) {
      setControllers((prev) =>
        prev.map((ctrl) =>
          ctrl.id !== targetId
            ? ctrl
            : {
                ...ctrl,
                options: ctrl.options.map((opt) => ({
                  ...opt,
                  selected: opt.id === optionId,
                })),
              }
        )
      );
    } else {
      setComponents((prev) =>
        prev.map((comp) =>
          comp.id !== targetId
            ? comp
            : {
                ...comp,
                options: comp.options.map((opt) => ({
                  ...opt,
                  selected: opt.id === optionId,
                })),
              }
        )
      );
    }

    setSaving(true);
    try {
      // currentProjectId ist hier garantiert string und niemals null:
      await selectHardwareOption(currentProjectId, [{ target_id: targetId, option_id: optionId }]);
    } catch (err) {
      console.error('Fehler beim Speichern der Auswahl:', err);
    } finally {
      setSaving(false);
    }
  };

// Chat-Nachricht an POST /hardware absenden und neue Vorschläge abrufen
  const handleSendChatInstruction = async () => {
    if (!chatMessage.trim() || !projectId) return;

    setIsRefining(true);
    setErrorMessage(null);

    try {
      const updatedData = await loadOrGenerateHardware(chatMessage);
      if (updatedData?.hardware_components) setComponents(updatedData.hardware_components);
      if (updatedData?.controllers) setControllers(updatedData.controllers);
      setChatMessage(''); // Eingabefeld nach Erfolg leeren
    } catch (err: any) {
      console.error('Fehler bei der Hardware-Verfeinerung:', err);
      setErrorMessage(err.message || 'Änderungswunsch konnte nicht verarbeitet werden.');
    } finally {
      setIsRefining(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center text-[#5A6172]">
        <div className="inline-block w-6 h-6 border-2 border-[#C46A2B] border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="font-medium animate-pulse">Hardware-Optionen werden ermittelt...</p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
        <p className="font-bold mb-1">Hinweis zur Hardware-Abfrage:</p>
        <p>{errorMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 w-full max-w-full">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold font-sans text-[#1E2430]">
          Schritt 3 · Hardware-Auswahl
        </h2>
        <p className="text-sm text-[#5A6172] mt-1">
          <GlossaryText text="Wähle für jede Komponente die passende Hardware-Option." />
        </p>
      </div>

      {/* 1. Controller */}
      {controllers.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-bold text-lg text-[#1E2430]">
            <GlossaryText text="Steuerungseinheit / Microcontroller" />
          </h3>
          {controllers.map((ctrl) => (
            <div key={ctrl.id} className="space-y-3">
              <span className="text-xs text-[#5A6172] block">
                <GlossaryText text={ctrl.role} />
              </span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {ctrl.options.map((opt: ControllerOption) => {
                  const isSelected = opt.selected;
                  const displayCost = cleanCost(opt.cost);
                  const directUrl = extractLink(opt.availability, opt.product_link) || extractLink(opt.cost);

                  return (
                    <div
                      key={opt.id}
                      onClick={() => handleSelectOption(ctrl.id, opt.id, true)}
                      className={`border rounded-xl p-4 cursor-pointer transition-all flex flex-col justify-between shadow-sm relative hover:border-[#C46A2B] ${
                        isSelected
                          ? 'border-[#C46A2B] bg-[#FAF8F4] ring-2 ring-[#C46A2B]/20'
                          : 'border-[#D9D3C7] bg-white'
                      }`}
                    >
                      <div>
                        {/* Name & Preis */}
                        <div className="flex justify-between items-start gap-3 mb-3">
                          <h4 className="font-bold text-sm text-[#1E2430] leading-snug flex-1">
                            <GlossaryText text={cleanDisplayText(opt.name)} />
                          </h4>
                          <span className="shrink-0 text-[#C46A2B] font-bold text-xs bg-white px-2 py-1 rounded border border-[#D9D3C7]/60 whitespace-nowrap shadow-2xs">
                            {displayCost}
                          </span>
                        </div>

                        {/* Specs */}
                        <div className="flex flex-wrap gap-1.5 mb-3 text-[11px]">
                          {opt.voltage && (
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                              <GlossaryText text={cleanDisplayText(opt.voltage)} />
                            </span>
                          )}
                          {opt.wireless_connectivity && (
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                              <GlossaryText text={cleanDisplayText(opt.wireless_connectivity)} />
                            </span>
                          )}
                        </div>

                        {/* Stichpunkte */}
                        {opt.pros_cons && opt.pros_cons.length > 0 && (
                          <ul className="text-xs text-[#5A6172] space-y-1.5 mb-3 list-disc pl-4">
                            {opt.pros_cons.map((pc, idx) => (
                              <li key={idx} className="leading-relaxed">
                                <GlossaryText text={cleanDisplayText(pc)} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Footer mit Link */}
                      <div className="pt-2 border-t border-[#D9D3C7]/40 flex items-center justify-between text-[11px] text-[#5A6172] mt-2 gap-2">
                        <span className="truncate flex-1">
                          <GlossaryText text={cleanDisplayText(opt.availability)} />
                        </span>
                        {directUrl ? (
                          <a
                            href={directUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#C46A2B] hover:underline font-semibold shrink-0 inline-flex items-center gap-0.5"
                          >
                            Shop / Link ↗
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 2. Sensoren & Aktoren */}
      {components.length > 0 && (
        <div className="space-y-6">
          <h3 className="font-bold text-lg text-[#1E2430]">
            <GlossaryText text="Sensoren & Aktoren" />
          </h3>
          {components.map((comp) => (
            <div key={comp.id} className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-base text-[#1E2430]">
                  <GlossaryText text={comp.component_name} />
                </h4>
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded shrink-0">
                  Ref: {comp.concept_ref_id}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {comp.options.map((opt: HardwareOption) => {
                  const isSelected = opt.selected;
                  const displayCost = cleanCost(opt.cost);
                  const directUrl = extractLink(opt.availability, opt.product_link) || extractLink(opt.cost);

                  return (
                    <div
                      key={opt.id}
                      onClick={() => handleSelectOption(comp.id, opt.id, false)}
                      className={`border rounded-xl p-4 cursor-pointer transition-all flex flex-col justify-between shadow-sm relative hover:border-[#C46A2B] ${
                        isSelected
                          ? 'border-[#C46A2B] bg-[#FAF8F4] ring-2 ring-[#C46A2B]/20'
                          : 'border-[#D9D3C7] bg-white'
                      }`}
                    >
                      <div>
                        {/* Name & Preis */}
                        <div className="flex justify-between items-start gap-3 mb-3">
                          <h5 className="font-bold text-sm text-[#1E2430] leading-snug flex-1">
                            <GlossaryText text={cleanDisplayText(opt.name)} />
                          </h5>
                          <span className="shrink-0 text-[#C46A2B] font-bold text-xs bg-white px-2 py-1 rounded border border-[#D9D3C7]/60 whitespace-nowrap shadow-2xs">
                            {displayCost}
                          </span>
                        </div>

                        {/* Specs */}
                        <div className="flex flex-wrap gap-1.5 mb-3 text-[11px]">
                          {opt.interface && (
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                              Port: <GlossaryText text={cleanDisplayText(opt.interface)} />
                            </span>
                          )}
                          {opt.voltage && (
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                              <GlossaryText text={cleanDisplayText(opt.voltage)} />
                            </span>
                          )}
                          {opt.connector && (
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-medium">
                              <GlossaryText text={cleanDisplayText(opt.connector)} />
                            </span>
                          )}
                        </div>

                        {/* Stichpunkte */}
                        {opt.pros_cons && opt.pros_cons.length > 0 && (
                          <ul className="text-xs text-[#5A6172] space-y-1.5 mb-3 list-disc pl-4">
                            {opt.pros_cons.map((pc, idx) => (
                              <li key={idx} className="leading-relaxed">
                                <GlossaryText text={cleanDisplayText(pc)} />
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      {/* Footer mit Link */}
                      <div className="pt-2 border-t border-[#D9D3C7]/40 flex items-center justify-between text-[11px] text-[#5A6172] mt-2 gap-2">
                        <span className="truncate flex-1">
                          <GlossaryText text={cleanDisplayText(opt.availability)} />
                        </span>
                        {directUrl ? (
                          <a
                            href={directUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-[#C46A2B] hover:underline font-semibold shrink-0 inline-flex items-center gap-0.5"
                          >
                            Shop / Link ↗
                          </a>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {saving && (
        <div className="text-xs text-[#C46A2B] italic text-right">
          Auswahl wird gespeichert...
        </div>
      )}

      {/* Chat-Eingabe für Hardware */}
      {/* Freier Hardware-Prompt + Aktionen */}
      <div className="space-y-4 pt-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-[#1E2430]">
            Hardware anpassen (Ergänzende Anweisungen an die KI)
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <textarea
              rows={2}
              className="flex-1 rounded-xl border border-[#D9D3C7] p-3 text-sm focus:outline-none focus:border-[#C46A2B] focus:ring-1 focus:ring-[#C46A2B] resize-none bg-white placeholder:text-[#5A6172]/60"
              placeholder="z. B. 'Nutze ein OLED-Display statt Buzzer'"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendChatInstruction();
                }
              }}
              disabled={isRefining}
            />
            <button
              type="button"
              onClick={handleSendChatInstruction}
              disabled={isRefining || !chatMessage.trim()}
              className="self-end sm:self-stretch px-5 py-2.5 bg-[#C46A2B] text-white font-medium text-xs rounded-xl hover:bg-[#a95720] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shrink-0 shadow-xs flex items-center justify-center min-w-[100px]"
            >
              {isRefining ? 'Wird angepasst...' : 'Senden'}
            </button>
          </div>
          {errorMessage && (
            <p className="text-red-500 text-xs mt-1">{errorMessage}</p>
          )}
        </div>
      </div>
    </div>
  );
};