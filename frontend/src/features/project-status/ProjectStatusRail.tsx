import { useRef, useMemo } from 'react';
import { useProjectStore } from '@/store/state';
import type { MachineState, TriggerAction } from '@/api/types';

/** Schätzt LED-Farbe aus Aktionsbeschreibungen (Heuristik). */
function inferLedColor(actions: string[]): 'red' | 'green' | 'blue' | 'off' {
  const text = actions.join(' ').toLowerCase();
  if (text.includes('rot')) return 'red';
  if (text.includes('grün') || text.includes('green')) return 'green';
  if (text.includes('blau') || text.includes('blue')) return 'blue';
  return 'off';
}

/** Verkürzte ID für Anzeige (z. B. "state_durst" → "B"). */
function shortId(id: string, index: number): string {
  const parts = id.split('_');
  return parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : String.fromCharCode(65 + index);
}

/** Bündelt Einträge, die ohne target_state_id im selben Zustand bleiben. */
function collectSelfTransitions(triggerActions: TriggerAction[]): TriggerAction[] {
  return triggerActions.filter((t) => t.target_state_id === null);
}

/** Bündelt Einträge, die zu einem anderen Zustand führen. */
function collectStateTransitions(triggerActions: TriggerAction[]): TriggerAction[] {
  return triggerActions.filter((t) => t.target_state_id !== null);
}

function formattedTime(): string {
  return new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Einzelner Zustands-Block
// ---------------------------------------------------------------------------

interface StateBlockProps {
  state: MachineState;
  index: number;
  isInitial: boolean;
  targetNames: Map<string, string>;
  /** true wenn dieser Zustand gerade als Ziel eines Triggers markiert wurde. */
  highlighted: boolean;
}

function StateBlock({ state, index, isInitial, targetNames, highlighted }: StateBlockProps) {
  const selfTransitions = useMemo(() => collectSelfTransitions(state.trigger_actions), [state.trigger_actions]);
  const stateTransitions = useMemo(() => collectStateTransitions(state.trigger_actions), [state.trigger_actions]);
  const ledColor = inferLedColor(state.entry_actions);

  return (
    <div className={`state ${highlighted ? 'hl' : ''}`}>
      <h5>
        {state.name}
        <span className="sid">{shortId(state.id, index)}</span>
      </h5>

      {/* Zustandsbeschreibung */}
      <div className="trig">{state.description}</div>

      {/* entry_actions mit LED */}
      {state.entry_actions.length > 0 && (
        <div className="act">
          {state.entry_actions.map((action, i) => (
            <span key={i}>
              <span className={`led ${ledColor}`} />
              {action}
            </span>
          ))}
        </div>
      )}

      {/* Trigger ohne Zustandswechsel (bleiben im selben Zustand) */}
      {selfTransitions.map((t) => (
        <div key={t.id} className="act" style={{ marginTop: 4 }}>
          {t.actions.map((action, i) => (
            <span key={i}>
              <span className="led off" />
              {action}
            </span>
          ))}
          <div className="trig" style={{ fontSize: '10.5px', marginTop: 1 }}>
            ↳ bei: {t.trigger}
          </div>
        </div>
      ))}

      {/* Übergänge zu anderen Zuständen */}
      {stateTransitions.map((t) => (
        <div key={t.id} className="trig" style={{ marginTop: 4, color: 'var(--copper)' }}>
          → {t.trigger}
          {t.target_state_id && (
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, marginLeft: 4 }}>
              ({targetNames.get(t.target_state_id) ?? t.target_state_id})
            </span>
          )}
        </div>
      ))}

      {/* Start-Badge */}
      {isInitial && (
        <div style={{ fontSize: '10.5px', color: 'var(--signal-green)', marginTop: 4, fontFamily: 'var(--mono)' }}>
          ◆ Initialzustand
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rail (Hauptkomponente)
// ---------------------------------------------------------------------------

export function ProjectStatusRail() {
  const structure = useProjectStore((s) => s.structure);
  const version = useProjectStore((s) => s.version);
  const status = useProjectStore((s) => s.status);

  // Merkt sich die letzte Versionsnummer, um Änderungen hervorzuheben.
  const prevVersion = useRef(version);

  // Baue target-Namen-Map für Transition-Labels.
  const targetNames = useMemo(() => {
    if (!structure?.states) return new Map<string, string>();
    const map = new Map<string, string>();
    for (const s of structure.states) {
      map.set(s.id, s.name);
    }
    return map;
  }, [structure]);

  // Leerzustand: noch keine Analyse
  if (!structure || status === 'idle') {
    return (
      <aside className="ir-rail" aria-label="Zustandsautomat">
        <h3>So versteht das System deine Idee</h3>
        <div className="ver">noch keine Analyse</div>
        <div className="ir-empty">
          Erscheint nach der ersten Analyse und zeigt jederzeit, was das System
          gerade über dein Projekt weiß.
        </div>
      </aside>
    );
  }

  // Analyse läuft
  if (status === 'loading') {
    return (
      <aside className="ir-rail" aria-label="Zustandsautomat">
        <h3>So versteht das System deine Idee</h3>
        <div className="ver">analysiert …</div>
        <div className="ir-empty" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div className="pulse" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--copper)', animation: 'pulse 1s infinite' }} />
          KI analysiert deine Eingabe …
        </div>
      </aside>
    );
  }

  // Fehlerfall
  if (status === 'error') {
    return (
      <aside className="ir-rail" aria-label="Zustandsautomat">
        <h3>So versteht das System deine Idee</h3>
        <div className="ver">Fehler</div>
        <div className="ir-empty" style={{ color: 'var(--signal-red)' }}>
          Analyse fehlgeschlagen. Bitte versuche es erneut.
        </div>
      </aside>
    );
  }

  // Struktur vorhanden → Zustandsautomaten anzeigen
  const { project_metadata, states } = structure;
  const isNewVersion = version > prevVersion.current;
  if (isNewVersion) prevVersion.current = version;

  return (
    <aside className="ir-rail" aria-label="Zustandsautomat">
      <h3>So versteht das System deine Idee</h3>
      <div className="ver">
        v{version} · {formattedTime()}
      </div>

      {/* Projekt-Metadaten */}
      <div style={{ fontSize: '12px', marginBottom: 18, color: 'var(--ink-soft)' }}>
        <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{project_metadata.working_title}</div>
        <div style={{ fontSize: '11px', marginTop: 2 }}>{project_metadata.core_intention}</div>
      </div>

      {/* Zustandsautomat */}
      {states.length === 0 ? (
        <div className="ir-empty">Keine Zustände definiert.</div>
      ) : (
        <div className="sm">
          {states.map((state, index) => (
            <StateBlock
              key={state.id}
              state={state}
              index={index}
              isInitial={state.is_initial_state}
              targetNames={targetNames}
              highlighted={isNewVersion}
            />
          ))}
        </div>
      )}

      {/* Patch-Meldung bei neuer Version */}
      {isNewVersion && (
        <div className="ir-patch show">
          ✓ v{version} · Struktur aktualisiert ({formattedTime()})
        </div>
      )}
    </aside>
  );
}
