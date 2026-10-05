import { useMemo } from 'react';
import type { CircuitComponent, Connection } from '@/api/types';
import { signalColor } from './schematicTheme';

/**
 * Statischer, druckbarer Schaltplan als reines SVG.
 *
 * Anders als die interaktive Ansicht in Schritt 4 (die Pin-Positionen per
 * getBoundingClientRect aus dem DOM misst und daher im Ausdruck unzuverlässig
 * ist) wird das Layout hier deterministisch berechnet: BFS-Distanz jedes
 * Bauteils zum Microcontroller bestimmt die Spalte, Pins werden je nach
 * Verbindungsrichtung links/rechts platziert. Dadurch ist das Ergebnis
 * reproduzierbar und lässt sich sauber als PDF drucken.
 */

const BOX_WIDTH = 210;
const HEADER_HEIGHT = 46;
const PIN_ROW_HEIGHT = 22;
const COL_GAP = 150;
const ROW_GAP = 40;
const MARGIN = 24;

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
  headerHeight: number;
  pinRowHeight: number;
}

interface PinPlacement {
  side: 'left' | 'right';
  index: number;
}

interface StaticSchematicProps {
  components: CircuitComponent[];
  connections: Connection[];
  /** Optional: nur diese Verbindungen kräftig zeichnen, Rest blass. */
  highlightedConnectionIds?: string[] | null;
}

export function StaticSchematic({
  components,
  connections,
  highlightedConnectionIds = null,
}: StaticSchematicProps) {
  const layout = useMemo(
    () => buildLayout(components, connections),
    [components, connections],
  );

  if (components.length === 0) {
    return (
      <div className="p-6 text-center text-xs text-[#5A6172]">
        Keine Schaltplan-Daten vorhanden.
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={layout.viewBox}
        className="w-full h-auto"
        style={{ display: 'block', maxHeight: 620 }}
      >
        {/* Kabel zuerst, damit die Boxen darüber liegen */}
        {layout.wires.map(({ connection, path }) => {
          const focused =
            highlightedConnectionIds === null || highlightedConnectionIds.includes(connection.id);
          return (
            <path
              key={connection.id}
              d={path}
              fill="none"
              stroke={signalColor(connection.signal_type)}
              strokeWidth={focused ? 2 : 1}
              opacity={focused ? 1 : 0.15}
              strokeLinecap="round"
            />
          );
        })}

        {components.map((comp) => {
          const box = layout.positions[comp.id];
          if (!box) return null;

          return (
            <g key={comp.id}>
              <rect
                x={box.x}
                y={box.y}
                width={box.width}
                height={box.height}
                rx={8}
                fill="#ffffff"
                stroke="#d9d3c7"
                strokeWidth={1.5}
              />
              <text
                x={box.x + box.width / 2}
                y={box.y + 18}
                textAnchor="middle"
                fill="#1e2430"
                fontSize={11}
                fontWeight={600}
              >
                {truncate(comp.name, 30)}
              </text>
              <text
                x={box.x + box.width / 2}
                y={box.y + 32}
                textAnchor="middle"
                fill="#8a8371"
                fontSize={9}
              >
                {comp.category}
              </text>

              {comp.pins.map((pin) => {
                const pl = layout.pinLayout[comp.id]?.[pin.id];
                if (!pl) return null;
                const px = pl.side === 'left' ? box.x : box.x + box.width;
                const py =
                  box.y + box.headerHeight + pl.index * box.pinRowHeight + box.pinRowHeight / 2;

                return (
                  <g key={pin.id}>
                    <text
                      x={pl.side === 'left' ? box.x + 10 : box.x + box.width - 10}
                      y={py + 3.5}
                      textAnchor={pl.side === 'left' ? 'start' : 'end'}
                      fill="#1e2430"
                      fontSize={9.5}
                      fontFamily="monospace"
                    >
                      {pin.label}
                    </text>
                    <circle
                      cx={px}
                      cy={py}
                      r={4}
                      fill={signalColor(pin.signal_type)}
                      stroke="#ffffff"
                      strokeWidth={1}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** BFS-Distanz vom Microcontroller (= Spalte); Fallback: am stärksten verdrahtetes Bauteil. */
function computeLayers(
  components: CircuitComponent[],
  connections: Connection[],
): Map<string, number> {
  const adj = new Map<string, string[]>();
  for (const c of components) adj.set(c.id, []);

  for (const conn of connections) {
    if (!adj.has(conn.from_component_id) || !adj.has(conn.to_component_id)) continue;
    adj.get(conn.from_component_id)!.push(conn.to_component_id);
    adj.get(conn.to_component_id)!.push(conn.from_component_id);
  }

  const layer = new Map<string, number>();
  let roots = components
    .filter((c) => c.category === 'Microcontroller')
    .map((c) => c.id);

  if (roots.length === 0) {
    let best: string | null = null;
    let bestDeg = -1;
    for (const c of components) {
      const deg = adj.get(c.id)?.length ?? 0;
      if (deg > bestDeg) {
        bestDeg = deg;
        best = c.id;
      }
    }
    if (best !== null) roots = [best];
  }

  const queue: string[] = [];
  for (const id of roots) {
    layer.set(id, 0);
    queue.push(id);
  }
  while (queue.length > 0) {
    const id = queue.shift()!;
    const d = layer.get(id)!;
    for (const other of adj.get(id) ?? []) {
      if (!layer.has(other)) {
        layer.set(other, d + 1);
        queue.push(other);
      }
    }
  }

  let maxLayer = -1;
  for (const v of layer.values()) maxLayer = Math.max(maxLayer, v);
  for (const c of components) {
    if (!layer.has(c.id)) layer.set(c.id, maxLayer + 1);
  }

  return layer;
}

function buildLayout(components: CircuitComponent[], connections: Connection[]) {
  const layerOf = computeLayers(components, connections);

  const byLayer = new Map<number, CircuitComponent[]>();
  for (const c of components) {
    const l = layerOf.get(c.id)!;
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l)!.push(c);
  }
  const layers = [...byLayer.keys()].sort((a, b) => a - b);

  // Pins stehen standardmäßig rechts; "rückwärts" laufende Verbindungen klappen sie nach links.
  const pinSideMap: Record<string, Record<string, 'left' | 'right'>> = {};
  for (const c of components) {
    pinSideMap[c.id] = {};
    for (const p of c.pins) pinSideMap[c.id][p.id] = 'right';
  }
  for (const conn of connections) {
    const fromLayer = layerOf.get(conn.from_component_id);
    const toLayer = layerOf.get(conn.to_component_id);
    if (fromLayer === undefined || toLayer === undefined) continue;

    if (fromLayer <= toLayer) {
      pinSideMap[conn.from_component_id][conn.from_pin_id] = 'right';
      pinSideMap[conn.to_component_id][conn.to_pin_id] = 'left';
    } else {
      pinSideMap[conn.from_component_id][conn.from_pin_id] = 'left';
      pinSideMap[conn.to_component_id][conn.to_pin_id] = 'right';
    }
  }

  const positions: Record<string, Box> = {};
  const pinLayout: Record<string, Record<string, PinPlacement>> = {};

  let x = MARGIN;
  for (const l of layers) {
    let y = MARGIN;
    for (const comp of byLayer.get(l)!) {
      const side = pinSideMap[comp.id];
      const leftPins = comp.pins.filter((p) => side[p.id] === 'left');
      const rightPins = comp.pins.filter((p) => side[p.id] !== 'left');
      const rowCount = Math.max(1, leftPins.length, rightPins.length);
      const height = HEADER_HEIGHT + rowCount * PIN_ROW_HEIGHT + 14;

      positions[comp.id] = {
        x,
        y,
        width: BOX_WIDTH,
        height,
        headerHeight: HEADER_HEIGHT,
        pinRowHeight: PIN_ROW_HEIGHT,
      };
      pinLayout[comp.id] = {};
      leftPins.forEach((p, i) => {
        pinLayout[comp.id][p.id] = { side: 'left', index: i };
      });
      rightPins.forEach((p, i) => {
        pinLayout[comp.id][p.id] = { side: 'right', index: i };
      });

      y += height + ROW_GAP;
    }
    x += BOX_WIDTH + COL_GAP;
  }

  const pinPoint = (box: Box, side: 'left' | 'right', index: number) => ({
    x: side === 'left' ? box.x : box.x + box.width,
    y: box.y + box.headerHeight + index * box.pinRowHeight + box.pinRowHeight / 2,
  });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (px: number, py: number) => {
    minX = Math.min(minX, px);
    minY = Math.min(minY, py);
    maxX = Math.max(maxX, px);
    maxY = Math.max(maxY, py);
  };

  for (const box of Object.values(positions)) {
    extend(box.x, box.y);
    extend(box.x + box.width, box.y + box.height);
  }

  const wires: Array<{ connection: Connection; path: string }> = [];
  for (const conn of connections) {
    const fromBox = positions[conn.from_component_id];
    const toBox = positions[conn.to_component_id];
    const fromPL = pinLayout[conn.from_component_id]?.[conn.from_pin_id];
    const toPL = pinLayout[conn.to_component_id]?.[conn.to_pin_id];
    if (!fromBox || !toBox || !fromPL || !toPL) continue;

    const p1 = pinPoint(fromBox, fromPL.side, fromPL.index);
    const p2 = pinPoint(toBox, toPL.side, toPL.index);
    const dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.5);
    const c1x = p1.x + (fromPL.side === 'right' ? dx : -dx);
    const c2x = p2.x + (toPL.side === 'right' ? dx : -dx);

    extend(c1x, p1.y);
    extend(c2x, p2.y);

    wires.push({
      connection: conn,
      path: `M ${p1.x},${p1.y} C ${c1x},${p1.y} ${c2x},${p2.y} ${p2.x},${p2.y}`,
    });
  }

  const pad = 20;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;
  const width = Math.max(50, maxX - minX);
  const height = Math.max(50, maxY - minY);

  return {
    positions,
    pinLayout,
    wires,
    viewBox: `${minX} ${minY} ${width} ${height}`,
  };
}
