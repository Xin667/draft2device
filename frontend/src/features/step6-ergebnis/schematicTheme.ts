import type { CircuitComponent, Connection, SignalType } from '@/api/types';

/**
 * Signalfarben für die Schaltplan-Darstellung.
 *
 * Eigene Datei (statt in StaticSchematic.tsx), damit dort nur die Komponente
 * exportiert wird — sonst meckert der Fast-Refresh-Lint.
 */
export const SIGNAL_COLORS: Record<SignalType, string> = {
  power: '#dc2626',
  ground: '#4b5563',
  digital: '#2563eb',
  analog: '#0d9488',
  pwm: '#9333ea',
  i2c: '#ea580c',
  spi: '#78350f',
  uart: '#16a34a',
  other: '#9ca3af',
};

export function signalColor(type: SignalType): string {
  return SIGNAL_COLORS[type] ?? '#9ca3af';
}

/** Die im Plan tatsächlich vorkommenden Signaltypen — für die Legende. */
export function signalTypesInUse(
  components: CircuitComponent[],
  connections: Connection[],
): SignalType[] {
  const inUse = new Set<SignalType>();
  for (const conn of connections) inUse.add(conn.signal_type);
  for (const comp of components) {
    for (const pin of comp.pins) inUse.add(pin.signal_type);
  }
  return (Object.keys(SIGNAL_COLORS) as SignalType[]).filter((t) => inUse.has(t));
}
