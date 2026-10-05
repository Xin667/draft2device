import React, { useEffect, useRef, useState, useLayoutEffect } from 'react';
import { generateCircuitDiagram, getCircuitDiagram } from '@/api/api';
import type { CircuitDiagramResponse, Connection, CircuitComponent } from '@/api/types';
import { useProjectStore, type ProjectState } from '@/store/state';
import { GlossaryText } from '@/components/GlossaryText';

const WIRE_COLOR_MAP: Record<string, string> = {
  red: '#EF4444',
  black: '#4B5563',
  blue: '#3B82F6',
  yellow: '#EAB308',
  green: '#22C55E',
  orange: '#F97316',
  purple: '#A855F7',
  brown: '#B45309',
  gray: '#9CA3AF',
  white: '#F3F4F6',
};

// Signal-Typen für die Legende
const SIGNAL_TYPES = [
  { label: 'power', color: '#EF4444' },
  { label: 'ground', color: '#4B5563' },
  { label: 'digital', color: '#3B82F6' },
  { label: 'analog', color: '#10B981' },
  { label: 'i2c', color: '#F97316' },
];

const SIGNAL_DOT_COLORS: Record<string, string> = {
  power: '#EF4444',
  ground: '#4B5563',
  digital: '#3B82F6',
  analog: '#10B981',
  pwm: '#A855F7',
  i2c: '#F97316',
  spi: '#B45309',
  uart: '#22C55E',
  other: '#9CA3AF',
};

interface PinCoords {
  x: number;
  y: number;
}

export const Step4Schaltplan: React.FC = () => {
  const projectId = useProjectStore((s: ProjectState) => (s as any).projectId || (s as any).project_id);

  const [data, setData] = useState<CircuitDiagramResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [selectedComponentId, setSelectedComponentId] = useState<string | null>(null);
  const [refinePrompt, setRefinePrompt] = useState<string>('');
  const [isRefining, setIsRefining] = useState<boolean>(false);

  // Zoom-State
  const [zoom, setZoom] = useState<number>(100);

  // Referenzen für SVG Canvas
  const canvasRef = useRef<HTMLDivElement>(null);
  const innerContentRef = useRef<HTMLDivElement>(null);
  const pinRefs = useRef<Map<string, HTMLSpanElement>>(new Map());
  const [pinPositions, setPinPositions] = useState<Map<string, PinCoords>>(new Map());

  // Daten laden
  useEffect(() => {
    if (!projectId) {
      setError('Keine aktive Projekt-ID vorhanden.');
      setLoading(false);
      return;
    }

    setLoading(true);
    getCircuitDiagram(projectId)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch(() => {
        return generateCircuitDiagram(projectId)
          .then((res) => setData(res))
          .catch((err) => setError(err.message))
          .finally(() => setLoading(false));
      });
  }, [projectId]);

  // Exakte Pin-Positionen innerhalb des skalierten Canvas ermitteln
  const updatePinPositions = () => {
    if (!innerContentRef.current) return;
    const canvasRect = innerContentRef.current.getBoundingClientRect();
    const scale = zoom / 100;
    const newPositions = new Map<string, PinCoords>();

    pinRefs.current.forEach((el, pinKey) => {
      if (el) {
        const rect = el.getBoundingClientRect();
        newPositions.set(pinKey, {
          x: (rect.left + rect.width / 2 - canvasRect.left) / scale,
          y: (rect.top + rect.height / 2 - canvasRect.top) / scale,
        });
      }
    });

    setPinPositions(newPositions);
  };

  useLayoutEffect(() => {
    updatePinPositions();
    window.addEventListener('resize', updatePinPositions);
    const timer = setTimeout(updatePinPositions, 200);
    return () => {
      window.removeEventListener('resize', updatePinPositions);
      clearTimeout(timer);
    };
  }, [data, selectedStep, zoom]);

  // Zoom-Funktionen
  const handleZoomIn = () => setZoom((prev) => Math.min(prev + 10, 200));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev - 10, 40));
  const handleZoomReset = () => {
    setZoom(100);
    setSelectedStep(null);
  };

  // Schritt-Navigation
  const handlePrevStep = () => {
    if (!data?.assembly_steps?.length) return;
    if (selectedStep === null || selectedStep <= 1) {
      setSelectedStep(data.assembly_steps.length);
    } else {
      setSelectedStep(selectedStep - 1);
    }
  };

  const handleNextStep = () => {
    if (!data?.assembly_steps?.length) return;
    if (selectedStep === null || selectedStep >= data.assembly_steps.length) {
      setSelectedStep(1);
    } else {
      setSelectedStep(selectedStep + 1);
    }
  };

  const handleRefine = async () => {
    if (!projectId || !refinePrompt.trim()) return;
    setIsRefining(true);
    try {
      const res = await generateCircuitDiagram(projectId, refinePrompt);
      setData(res);
      setRefinePrompt('');
      setSelectedStep(null);
      setSelectedComponentId(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsRefining(false);
    }
  };

  if (loading) {
    return (
      <div className="py-24 text-center text-[#5A6172]">
        <div className="inline-block w-8 h-8 border-2 border-[#C46A2B] border-t-transparent rounded-full animate-spin mb-3"></div>
        <p className="font-medium animate-pulse">Schaltplan wird aufgebaut...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
        <p className="font-bold mb-1">Fehler beim Laden des Schaltplans:</p>
        <p>{error || 'Keine Daten vorhanden.'}</p>
      </div>
    );
  }

  // Leerer Schaltplan: kann passieren, wenn die Hardware-Auswahl keine
  // Bauteile enthielt und der Schaltplan deshalb ohne Komponenten erzeugt
  // wurde. Wichtig als eigener Zweig, weil die Fallback-Liste
  // [data.components[0]] sonst [undefined] ergäbe und der Zugriff auf
  // comp.id die komplette App zum Absturz brächte (weißer Bildschirm).
  if (data.components.length === 0) {
    return (
      <div className="space-y-6 w-full max-w-full">
        <div>
          <h2 className="text-2xl font-bold font-sans text-[#1E2430]">
            Schritt 4 · Schaltplan
          </h2>
        </div>
        <div className="rounded-xl border border-[#C46A2B]/40 bg-orange-50/40 p-6">
          <p className="text-sm font-semibold text-[#1E2430] mb-1">
            Der Schaltplan enthält keine Bauteile.
          </p>
          <p className="text-xs text-[#5A6172] leading-relaxed">
            Das passiert, wenn für dieses Projekt noch keine Hardware-Auswahl
            gespeichert ist oder die Auswahl leer war. Prüfe Schritt 3 und
            erzeuge den Schaltplan danach erneut.
          </p>
        </div>
      </div>
    );
  }

  // Komponenten-Aufteilung
  const controllers = data.components.filter(
    (c) => c.category === 'Microcontroller' || c.name.toLowerCase().includes('esp32') || c.name.toLowerCase().includes('pico')
  );
  const peripherals = data.components.filter((c) => !controllers.includes(c));

  // Aktive Leitungen je nach ausgewähltem Montageschritt
  const activeConnectionIds =
    selectedStep !== null
      ? data.assembly_steps.find((s) => s.step_number === selectedStep)?.connection_ids || []
      : null;

  const selectedComponent = selectedComponentId
    ? data.components.find((c) => c.id === selectedComponentId) || null
    : null;

  const componentCardClass = (comp: CircuitComponent) =>
    `bg-[#181C24] border rounded-2xl p-4 shadow-lg text-left cursor-pointer transition-all ${
      selectedComponentId === comp.id
        ? 'border-[#C46A2B] ring-1 ring-[#C46A2B]/60'
        : 'border-[#2B313F] hover:border-[#4B5563]'
    }`;

  return (
    <div className="space-y-6 w-full max-w-full">
      {/* Header-Bereich */}
      <div>
        <h2 className="text-2xl font-bold font-sans text-[#1E2430]">
          Schritt 4 · {data.title || 'Schaltplan'}
        </h2>
        <p className="text-sm text-[#5A6172] mt-1 leading-relaxed max-w-4xl">
          <GlossaryText text={data.summary} />
        </p>
      </div>

      {/* Haupt-Layout: Schaltplan oben (volle Breite), darunter Montageschritte & Infos */}
      <div className="flex flex-col gap-6">

        {/* SCHALTPLAN: oben, volle Breite */}
        <div
          ref={canvasRef}
          className="min-w-0 bg-[#11141A] border border-[#232836] text-white rounded-2xl p-4 min-h-[560px] relative flex flex-col shadow-xl"
        >
          {/* Canvas Top Bar mit Zoom-Controls */}
          <div className="flex justify-between items-center pb-3 border-b border-gray-800/80 mb-2 z-30">
            <span className="font-bold text-gray-200 text-sm tracking-wide">Schaltplan</span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleZoomOut}
                disabled={zoom <= 40}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-700 bg-[#1A1E27] hover:bg-gray-700 text-gray-200 text-sm font-semibold transition-colors disabled:opacity-40"
              >
                −
              </button>

              <span className="min-w-[42px] text-center font-mono text-xs text-gray-300 font-medium">
                {zoom}%
              </span>

              <button
                type="button"
                onClick={handleZoomIn}
                disabled={zoom >= 200}
                className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-700 bg-[#1A1E27] hover:bg-gray-700 text-gray-200 text-sm font-semibold transition-colors disabled:opacity-40"
              >
                +
              </button>

              <button
                type="button"
                onClick={handleZoomReset}
                className="px-2.5 h-7 flex items-center justify-center rounded-lg border border-gray-700 bg-[#1A1E27] hover:bg-gray-700 text-gray-200 text-xs font-semibold transition-colors ml-1"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Skalierbarer innerer Canvas */}
          <div className="overflow-auto flex-1 relative py-2">
            <div
              ref={innerContentRef}
              style={{
                transform: `scale(${zoom / 100})`,
                transformOrigin: 'top left',
                transition: 'transform 0.15s ease-out',
                minWidth: '540px',
              }}
              className="relative p-2"
            >
              {/* SVG-Kabel-Layer */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-10 overflow-visible">
                {data.connections.map((conn: Connection) => {
                  const fromKey = `${conn.from_component_id}:${conn.from_pin_id}`;
                  const toKey = `${conn.to_component_id}:${conn.to_pin_id}`;
                  const p1 = pinPositions.get(fromKey);
                  const p2 = pinPositions.get(toKey);

                  if (!p1 || !p2) return null;

                  const isHighlighted =
                    activeConnectionIds === null || activeConnectionIds.includes(conn.id);
                  const strokeColor = WIRE_COLOR_MAP[conn.wire_color] || '#9CA3AF';

                  // Sanfter Bezier-Bogen
                  const dx = Math.abs(p2.x - p1.x) * 0.45;
                  const pathData = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y}, ${p2.x - dx} ${p2.y}, ${p2.x} ${p2.y}`;

                  return (
                    <g key={conn.id}>
                      {isHighlighted && activeConnectionIds !== null && (
                        <path
                          d={pathData}
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth={7}
                          strokeOpacity={0.4}
                          strokeLinecap="round"
                        />
                      )}
                      <path
                        d={pathData}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={isHighlighted ? 2.5 : 1}
                        strokeOpacity={isHighlighted ? 1 : 0.12}
                        strokeLinecap="round"
                        className="transition-all duration-300"
                      />
                    </g>
                  );
                })}
              </svg>

              {/* Bauteile im 2-Spalten-Raster */}
              <div className="grid grid-cols-2 gap-7 z-20 relative">
                {/* Linke Spalte: Controller */}
                <div className="space-y-4">
                  {(controllers.length > 0 ? controllers : [data.components[0]]).map((comp: CircuitComponent) => (
                    <div
                      key={comp.id}
                      onClick={() => setSelectedComponentId(comp.id)}
                      className={componentCardClass(comp)}
                    >
                      <div className="flex justify-between items-start gap-2 mb-4">
                        <span className="font-bold text-xs text-gray-100 leading-tight">{comp.name}</span>
                        <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 bg-[#232836] text-gray-300 rounded font-semibold shrink-0">
                          {comp.category || 'MICROCONTROLLER'}
                        </span>
                      </div>

                      <div className="space-y-2.5">
                        {comp.pins.map((pin) => {
                          const pinKey = `${comp.id}:${pin.id}`;
                          return (
                            <div key={pin.id} className="flex items-center justify-between">
                              <span className="text-[11px] text-gray-300 font-mono">{pin.label}</span>
                              <span
                                ref={(el) => {
                                  if (el) pinRefs.current.set(pinKey, el);
                                  else pinRefs.current.delete(pinKey);
                                }}
                                className="w-2.5 h-2.5 rounded-full ring-4 ring-[#E67E22]/20 inline-block"
                                style={{ backgroundColor: SIGNAL_DOT_COLORS[pin.signal_type] || '#E67E22' }}
                                title={pin.description}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Rechte Spalte: Sensoren / Aktoren */}
                <div className="space-y-4">
                  {(controllers.length > 0 ? peripherals : data.components.slice(1)).map((comp: CircuitComponent) => (
                    <div
                      key={comp.id}
                      onClick={() => setSelectedComponentId(comp.id)}
                      className={componentCardClass(comp)}
                    >
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <span className="font-bold text-[11px] text-gray-100 leading-tight">{comp.name}</span>
                        <span className="text-[8px] font-mono uppercase px-1.5 py-0.5 bg-[#232836] text-gray-300 rounded font-semibold shrink-0">
                          {comp.category || 'SENSOR'}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {comp.pins.map((pin) => {
                          const pinKey = `${comp.id}:${pin.id}`;
                          return (
                            <span
                              key={pin.id}
                              ref={(el) => {
                                if (el) pinRefs.current.set(pinKey, el);
                                else pinRefs.current.delete(pinKey);
                              }}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-[#0F1218] border border-[#2B313F] rounded-full text-[10px] text-gray-200 font-mono"
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: SIGNAL_DOT_COLORS[pin.signal_type] || '#0284C7' }}
                              />
                              {pin.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* INFO-KARTEN: horizontal unter dem Schaltplan */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 items-start">
          {/* Bauteil-Details (Hardware-Erklärung) */}
          <div className="bg-white border border-[#D9D3C7] rounded-2xl p-5 shadow-sm">
            <h4 className="font-bold text-xs text-[#1E2430] uppercase tracking-wider mb-3">
              Bauteil-Details
            </h4>
            {selectedComponent ? (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="font-semibold text-[#1E2430] leading-tight block">
                    {selectedComponent.name}
                  </span>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 bg-[#FAF8F4] border border-[#D9D3C7] text-[#5A6172] rounded mt-1 inline-block">
                    {selectedComponent.category}
                  </span>
                </div>
                <p className="text-[#5A6172] leading-relaxed">
                  <GlossaryText text={selectedComponent.description} />
                </p>
                <ul className="space-y-2 border-t border-gray-100 pt-2">
                  {selectedComponent.pins.map((pin) => (
                    <li key={pin.id} className="flex items-start gap-2">
                      <span
                        className="w-2 h-2 rounded-full shrink-0 mt-1"
                        style={{ backgroundColor: SIGNAL_DOT_COLORS[pin.signal_type] || '#9CA3AF' }}
                      />
                      <span className="text-[#1E2430] leading-snug">
                        <span className="font-mono font-semibold">{pin.label}</span>
                        <span className="text-[#9CA3AF]"> ({pin.signal_type})</span>
                        <span className="block text-[#5A6172]">{pin.description}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-xs text-[#5A6172]">
                Klicke im Schaltplan auf ein Bauteil, um hier seine Funktion und Pins zu sehen.
              </p>
            )}
          </div>

          {/* Signalfarben */}
          <div className="bg-white border border-[#D9D3C7] rounded-2xl p-4 shadow-sm">
            <h4 className="font-bold text-xs text-[#1E2430] uppercase tracking-wider mb-3">Signalfarben</h4>
            <div className="space-y-2 text-xs text-[#5A6172]">
              {SIGNAL_TYPES.map((sig) => (
                <div key={sig.label} className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: sig.color }} />
                  <span className="capitalize text-xs font-medium text-gray-700">{sig.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Stromversorgung */}
          <div className="bg-white border border-[#D9D3C7] rounded-2xl p-4 shadow-sm">
            <h4 className="font-bold text-xs text-[#1E2430] uppercase tracking-wider mb-3">Stromversorgung</h4>
            <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
              {data.power_requirements.map((p, idx) => {
                const comp = data.components.find((c) => c.id === p.component_id);
                return (
                  <div key={idx} className="text-xs border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                    <span className="font-semibold text-[#1E2430] block leading-tight">
                      {comp?.name || p.component_id}
                    </span>
                    <span className="text-[#C46A2B] font-bold text-[11px] inline-block my-0.5">{p.voltage}</span>
                    <p className="text-[11px] text-[#5A6172] leading-snug">
                      <GlossaryText text={p.note} />
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sicherheitshinweise */}
          {data.safety_notes.length > 0 && (
            <div className="bg-white border border-[#D9D3C7] rounded-2xl p-4 shadow-sm">
              <h4 className="font-bold text-xs text-[#1E2430] uppercase tracking-wider mb-3">
                Sicherheitshinweise
              </h4>
              <ul className="space-y-2 text-[11px] text-[#5A6172] leading-snug">
                {data.safety_notes.map((note, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-[#C46A2B] font-bold shrink-0">•</span>
                    <GlossaryText text={note} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Montageschritte: ganz unten, volle Breite */}
        <div className="bg-white border border-[#D9D3C7] rounded-2xl p-5 shadow-sm">
          <div className="flex justify-between items-center mb-4 pb-2 border-b border-gray-100">
            <h3 className="font-bold text-base text-[#1E2430]">Montageschritte</h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handlePrevStep}
                className="w-7 h-7 flex items-center justify-center border border-[#D9D3C7] rounded-lg text-xs hover:bg-gray-50 text-gray-700"
                title="Vorheriger Schritt"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => setSelectedStep(null)}
                className="px-2.5 h-7 flex items-center justify-center border border-[#D9D3C7] rounded-lg text-xs hover:bg-gray-50 text-gray-700"
              >
                alle
              </button>
              <button
                type="button"
                onClick={handleNextStep}
                className="w-7 h-7 flex items-center justify-center border border-[#D9D3C7] rounded-lg text-xs hover:bg-gray-50 text-gray-700"
                title="Nächster Schritt"
              >
                →
              </button>
            </div>
          </div>

          <ol className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {data.assembly_steps.map((step) => {
              const isSelected = selectedStep === step.step_number;
              return (
                <li
                  key={step.step_number}
                  onClick={() => setSelectedStep(step.step_number)}
                  className={`text-xs p-3.5 rounded-xl cursor-pointer transition-all border leading-relaxed break-words ${
                    isSelected
                      ? 'border-[#C46A2B] bg-[#FFF9F5] ring-1 ring-[#C46A2B] font-medium shadow-sm'
                      : 'border-gray-200/80 hover:border-[#D9D3C7] bg-white hover:bg-gray-50/50 text-[#5A6172]'
                  }`}
                >
                  <span className="font-bold text-[#C46A2B] mr-2">{step.step_number}.</span>
                  <GlossaryText text={step.instruction} />
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* Refinement Bereich (Änderungswünsche an KI) */}
      <div className="bg-white border border-[#D9D3C7] rounded-2xl p-4 space-y-3 shadow-sm">
        <label className="block text-sm font-semibold text-[#1E2430]">
          Änderungswunsch am Schaltplan oder den Bauteilen
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={refinePrompt}
            onChange={(e) => setRefinePrompt(e.target.value)}
            placeholder="z. B. 'Nutze GPIO21 statt GPIO34' oder 'Ersetze die rote LED durch einen Buzzer'..."
            className="flex-1 border border-[#D9D3C7] rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#C46A2B]"
          />
          <button
            type="button"
            onClick={handleRefine}
            disabled={isRefining || !refinePrompt.trim()}
            className="bg-[#C46A2B] hover:bg-[#A0522D] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
          >
            {isRefining ? 'Aktualisiere...' : 'Ändern'}
          </button>
        </div>
      </div>
    </div>
  );
};
