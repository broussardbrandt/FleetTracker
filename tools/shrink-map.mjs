/*
 * Builds data/countries.topo.json (what the page loads) from
 * data/countries.original.topo.json (the full-detail source).
 *
 *   cd tools && npm install && npm run shrink-map
 *
 * - Simplifies coastlines/borders to keep KEEP of the points. The map is capped
 *   at port-level zoom (MAX_ZOOM in scripts/app.js), so the lost detail never shows.
 * - Islands smaller than PROTECT_KM2 keep every point; otherwise small islands
 *   such as Roatán, Bermuda and the Maldives collapse and vanish.
 * - Re-quantizes coordinates to a QUANTIZATION-step grid (smaller numbers in the file).
 *
 * Uses d3's own topojson tools. Don't swap in mapshaper: its re-encoding turns some
 * antimeridian-crossing countries inside out, which floods the whole map with land.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { quantize } from 'topojson-client';
import { presimplify, simplify, quantile, sphericalTriangleArea } from 'topojson-simplify';

const KEEP = 0.25;
const PROTECT_KM2 = 300;
const QUANTIZATION = 1e4;

const data = file => fileURLToPath(new URL(`../data/${file}`, import.meta.url));
const topo = JSON.parse(readFileSync(data('countries.original.topo.json'), 'utf8'));

// Decode the quantized, delta-encoded arcs to absolute lon/lat so they can be re-quantized.
const { scale: [kx, ky], translate: [dx, dy] } = topo.transform;
topo.arcs = topo.arcs.map(arc => {
  let x = 0, y = 0;
  return arc.map(([a, b]) => [(x += a) * kx + dx, (y += b) * ky + dy]);
});
delete topo.transform;

const weighted = presimplify(topo, sphericalTriangleArea);
const minWeight = quantile(weighted, KEEP);

// Pin small islands: an Infinity weight survives any simplification threshold.
const rings = Object.values(weighted.objects)
  .flatMap(o => o.geometries)
  .flatMap(g => (g.type === 'Polygon' ? g.arcs : g.type === 'MultiPolygon' ? g.arcs.flat() : []));
const ringPoints = ring => ring.flatMap(i => (i < 0 ? [...weighted.arcs[~i]].reverse() : weighted.arcs[i]));
const ringKm2 = pts => {
  // equirectangular shoelace: rough, but plenty for a size threshold
  const R = 6371, rad = Math.PI / 180;
  let a = 0;
  for (let j = 0; j < pts.length; j++) {
    const [x1, y1] = pts[j], [x2, y2] = pts[(j + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2) * (R * rad) ** 2 * Math.cos(pts[0][1] * rad);
};
for (const ring of rings) {
  if (ringKm2(ringPoints(ring)) >= PROTECT_KM2) continue;
  for (const i of ring) for (const p of weighted.arcs[i < 0 ? ~i : i]) p[2] = Infinity;
}

const out = quantize(simplify(weighted, minWeight), QUANTIZATION);
writeFileSync(data('countries.topo.json'), JSON.stringify(out) + '\n');

const points = t => t.arcs.reduce((n, a) => n + a.length, 0);
console.log(`countries.topo.json: ${points(out)} of ${points(topo)} points`);
