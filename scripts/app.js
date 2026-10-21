const EMBED = location.hash === '#embed';
if (EMBED) {
  document.documentElement.classList.add('embed');
  document.getElementById('scaleNote').textContent = matchMedia(
    '(pointer: coarse)'
  ).matches
    ? 'Drag to pan · pinch or +/− to zoom'
    : 'Drag to pan · Ctrl + scroll or +/− to zoom';
}
const FLEET = [
  {
    id: 'nautilus',
    site: 'nautshipdash', // sites= param for getFleetPositions
    api: 'nautilus', // key in the getFleetPositions response
    tdi: 'https://www.tdi-bi.com/r-v-nautilus/',
    name: 'RV Nautilus',
    mmsi: '577030000',
    imo: '9223708',
    flag: 'Vanuatu',
    short: 'RV NAUTILUS',
    c: '--v1',
    photo: 'img/nautilus.webp',
    ar: 440 / 309,
  },
  {
    id: 'gyre',
    site: 'gyreshipdash', // sites= param for getFleetPositions
    api: 'gyre', // key in the getFleetPositions response
    tdi: 'https://www.tdi-bi.com/r-v-gyre/',
    name: 'RV Gyre',
    mmsi: '577275000',
    imo: '7318999',
    flag: 'Vanuatu',
    short: 'RV GYRE',
    c: '--v2',
    photo: 'img/gyre.webp',
    ar: 440 / 231,
  },
  {
    id: 'proteus',
    site: 'proteusshipdash', // sites= param for getFleetPositions
    api: 'proteus', // key in the getFleetPositions response
    tdi: 'https://www.tdi-bi.com/r-v-proteus/',
    name: 'RV Proteus',
    mmsi: '577207000',
    imo: '7634290',
    flag: 'Vanuatu',
    short: 'RV PROTEUS',
    c: '--v3',
    photo: 'img/proteus.webp',
    ar: 440 / 217,
  },
  {
    id: 'brooks-mccall',
    site: 'shipdash', // sites= param for getFleetPositions
    api: 'brooks', // key in the getFleetPositions response
    tdi: 'https://www.tdi-bi.com/r-v-brooks-mccall/',
    name: 'RV Brooks McCall',
    mmsi: '338257000',
    imo: '8964367',
    flag: 'USA',
    short: 'RV BROOKS McCALL',
    c: '--v4',
    photo: 'img/brooks-mccall.webp',
    ar: 440 / 171,
  },
  {
    id: 'miss-emma-mccall',
    site: 'emmashipdash', // sites= param for getFleetPositions
    api: 'emma', // key in the getFleetPositions response
    tdi: 'https://www.tdi-bi.com/r-v-miss-emma-mccall/',
    name: 'RV Miss Emma McCall',
    mmsi: '577759000',
    imo: '9289659',
    flag: 'Vanuatu',
    short: 'RV MISS EMMA McCALL',
    c: '--v5',
    photo: 'img/miss-emma-mccall.webp',
    ar: 420 / 238,
  },
];
const pos = {};
let selected = null,
  hover = null;

/* ---------- formatting ---------- */
function dm(v, isLat) {
  const h = isLat ? (v >= 0 ? 'N' : 'S') : v >= 0 ? 'E' : 'W';
  const a = Math.abs(v);
  const d = Math.floor(a);
  const m = (a - d) * 60;
  return (
    String(d).padStart(isLat ? 2 : 3, '0') +
    '°' +
    m.toFixed(3).padStart(6, '0') +
    '′' +
    h
  );
}
function ago(iso) {
  if (!iso) return '—';
  const s = (Date.now() - Date.parse(iso)) / 1000;
  if (isNaN(s)) return '—';
  if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
  if (s < 172800) return Math.round(s / 3600) + ' h ago';
  return Math.round(s / 86400) + ' d ago';
}
function fresh(iso) {
  const h = (Date.now() - Date.parse(iso)) / 3.6e6;
  if (!(h >= 0)) return ['mute', 'No fix'];
  if (h < 6) return ['ok', 'Fresh'];
  if (h < 48) return ['warn', 'Aging'];
  return ['bad', 'Stale'];
}

function esc(t) {
  return String(t ?? '').replace(
    /[&<>"]/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
  );
}
function utc(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
}

/* ---------- chart ---------- */
const svg = d3.select('#map'),
  root = svg.append('g'),
  landG = root.append('g'),
  plG = svg.append('g'),
  mkG = svg.append('g');
const proj = d3.geoMercator().scale(1).translate([0, 0]);
const path = d3.geoPath(proj);
/* basemap: world countries (TopoJSON), drawn once it arrives */
async function loadBasemap() {
  const r = await fetch('data/countries.topo.json');
  if (!r.ok) throw new Error(`countries.topo.json: ${r.status}`);
  const topo = await r.json();
  landG
    .selectAll('path')
    .data(topojson.feature(topo, topo.objects.countries).features)
    .join('path')
    .attr('class', 'land')
    .attr('d', path);
  landG
    .append('path')
    .datum(topojson.mesh(topo, topo.objects.countries, (a, b) => a !== b))
    .attr('class', 'borders')
    .attr('d', path);
}
loadBasemap().catch(e => console.error('Basemap failed to load', e));
/* place names: [lon, lat, text, kind, tier]; tier sets the zoom at which a name appears */
const PLACES = [
  [-47, 38.5, 'North Atlantic Ocean', 'ocean', 0],
  [-16, -22, 'South Atlantic Ocean', 'ocean', 0],
  [-122, 18, 'North Pacific Ocean', 'ocean', 0],
  [-90.5, 25.2, 'Gulf of Mexico', 'sea', 0],
  [-74, 14.6, 'Caribbean Sea', 'sea', 0],
  [-62, 28, 'Sargasso Sea', 'sea', 1],
  [3, 2, 'Gulf of Guinea', 'sea', 1],
  [-100, 57, 'Canada', 'country big', 0],
  [-98, 39.5, 'United States', 'country big', 0],
  [-102, 24, 'Mexico', 'country big', 0],
  [-52, -9, 'Brazil', 'country big', 0],
  [-73.5, 3.8, 'Colombia', 'country', 0],
  [-66, 7.2, 'Venezuela', 'country', 0],
  [-78.4, -1.4, 'Ecuador', 'country', 1],
  [-75, -9.5, 'Peru', 'country', 0],
  [-64.6, -16.5, 'Bolivia', 'country', 1],
  [-58.9, 5.2, 'Guyana', 'country', 1],
  [-55.8, 4.1, 'Suriname', 'country', 2],
  [-79.3, 21.8, 'Cuba', 'country', 1],
  [-77.3, 18.2, 'Jamaica', 'country', 2],
  [-70.4, 19, 'Dominican Republic', 'country', 2],
  [-90.3, 15.6, 'Guatemala', 'country', 1],
  [-86.6, 14.6, 'Honduras', 'country', 1],
  [-85, 12.9, 'Nicaragua', 'country', 1],
  [-84.1, 10, 'Costa Rica', 'country', 2],
  [-80.2, 8.5, 'Panama', 'country', 1],
  [-88.7, 17.3, 'Belize', 'country', 2],
  [-61.2, 10.35, 'Trinidad and Tobago', 'country', 2],
  [-6.2, 31.8, 'Morocco', 'country', 0],
  [2.6, 28, 'Algeria', 'country', 0],
  [-13.1, 24.6, 'Western Sahara', 'country', 1],
  [-10.4, 20.3, 'Mauritania', 'country', 0],
  [-2, 17.5, 'Mali', 'country', 0],
  [-14.6, 14.7, 'Senegal', 'country', 1],
  [-15.2, 11.9, 'Guinea-Bissau', 'country', 2],
  [-10.6, 10.6, 'Guinea', 'country', 1],
  [-11.8, 8.7, 'Sierra Leone', 'country', 2],
  [-9.4, 6.6, 'Liberia', 'country', 2],
  [-5.5, 7.8, "Côte d'Ivoire", 'country', 1],
  [-1, 8.1, 'Ghana', 'country', 1],
  [8.2, 9.6, 'Nigeria', 'country', 0],
  [12.6, 5.6, 'Cameroon', 'country', 1],
  [11.7, -0.7, 'Gabon', 'country', 1],
  [15.4, -1.2, 'Congo', 'country', 2],
  [23, -3.2, 'DR Congo', 'country', 0],
  [17.6, -12.3, 'Angola', 'country', 0],
  [-3.8, 40.2, 'Spain', 'country', 0],
  [-8.1, 39.7, 'Portugal', 'country', 1],
  [-99.3, 31.3, 'Texas', 'region', 1],
  [-92.2, 31, 'Louisiana', 'region', 1],
  [-89.7, 32.8, 'Mississippi', 'region', 1],
  [-86.8, 32.8, 'Alabama', 'region', 1],
  [-83.4, 32.7, 'Georgia', 'region', 2],
  [-81.6, 28.4, 'Florida', 'region', 1],
  [-89.2, 19.4, 'Yucatán', 'region', 2],
  [-15.6, 28.7, 'Canary Islands', 'region', 2],
  [-96.33, 30.63, 'College Station (HQ)', 'hq', 1],
  [-95.37, 29.76, 'Houston', 'city', 1],
  [-96.8, 32.78, 'Dallas', 'city', 2],
  [-90.07, 29.95, 'New Orleans', 'city', 2],
  [-90.2, 29.11, 'Port Fourchon', 'city', 3],
  [-95.36, 28.95, 'Freeport', 'city', 3],
  [-80.19, 25.76, 'Miami', 'city', 2],
  [-81.66, 30.33, 'Jacksonville', 'city', 3],
  [-97.4, 27.8, 'Corpus Christi', 'city', 3],
  [-82.37, 23.11, 'Havana', 'city', 2],
  [-96.13, 19.17, 'Veracruz', 'city', 3],
  [-76.79, 17.99, 'Kingston', 'city', 3],
  [-86.53, 16.32, 'Roatán', 'city', 3],
  [-86.78, 15.76, 'La Ceiba', 'city', 3],
  [-79.52, 8.98, 'Panama City', 'city', 2],
  [-66.9, 10.5, 'Caracas', 'city', 2],
  [-61.5, 10.66, 'Port of Spain', 'city', 3],
  [-55.2, 5.85, 'Paramaribo', 'city', 3],
  [-74.08, 4.71, 'Bogotá', 'city', 3],
  [-15.42, 28.12, 'Las Palmas', 'city', 2],
  [-17.45, 14.69, 'Dakar', 'city', 2],
  [-16.58, 13.45, 'Banjul', 'city', 3],
  [-13.23, 8.48, 'Freetown', 'city', 2],
  [-10.8, 6.3, 'Monrovia', 'city', 3],
  [-4.03, 5.33, 'Abidjan', 'city', 2],
  [3.38, 6.52, 'Lagos', 'city', 2],
  [8.78, -0.72, 'Port-Gentil', 'city', 3],
  [12.37, -6.13, 'Soyo', 'city', 3],
  [13.23, -8.84, 'Luanda', 'city', 2],
  [-9.14, 38.72, 'Lisbon', 'city', 3],
];
function tierNow() {
  const k = T.k;
  return k >= 2500 ? 3 : k >= 900 ? 2 : k >= 300 ? 1 : 0;
}
function drawPlaces() {
  const [w, h] = size(),
    tier = tierNow();
  const vis = PLACES.filter(p => p[4] <= tier)
    .map(p => {
      const [x, y] = T.apply(proj([p[0], p[1]]));
      return { p, x, y };
    })
    .filter(d => d.x > -150 && d.x < w + 150 && d.y > -40 && d.y < h + 40);
  const dotted = d => /city|hq/.test(d.p[3]);
  plG
    .selectAll('circle.pl-dot')
    .data(vis.filter(dotted), d => d.p[2])
    .join('circle')
    .attr('class', 'pl-dot')
    .attr('r', d => (d.p[3] === 'hq' ? 4 : 2.8))
    .attr('cx', d => d.x)
    .attr('cy', d => d.y);
  plG
    .selectAll('text.pl')
    .data(vis, d => d.p[2])
    .join('text')
    .attr('class', d => 'pl ' + d.p[3])
    .attr('text-anchor', d => (dotted(d) ? 'start' : 'middle'))
    .attr('x', d => (dotted(d) ? d.x + 6 : d.x))
    .attr('y', d => (dotted(d) ? d.y + 4 : d.y))
    .text(d => d.p[2]);
}
let T = d3.zoomIdentity;
// past this the coastline data is too coarse to be meaningful (~port level)
const MAX_ZOOM = 2500;
const motionMs = () =>
  matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 750;
const zoom = d3
  .zoom()
  .scaleExtent([60, MAX_ZOOM])
  .on('zoom', e => {
    T = e.transform;
    root.attr('transform', T);
    drawPlaces();
    drawMarkers();
  });

if (EMBED)
  zoom.filter(e =>
    e.type === 'wheel'
      ? e.ctrlKey || e.metaKey
      : (!e.ctrlKey || e.type === 'wheel') && !e.button
  );
svg.call(zoom).on('dblclick.zoom', null);
function size() {
  const r = document.getElementById('chart').getBoundingClientRect();
  return [r.width, r.height];
}
function fit(features, pad = 60) {
  const [w, h] = size();
  if (!w || !h) return;
  const b = path.bounds({ type: 'FeatureCollection', features });
  let dx = b[1][0] - b[0][0],
    dy = b[1][1] - b[0][1];
  const minSpan = 0.02;
  if (dx < minSpan) {
    b[0][0] -= minSpan / 2;
    b[1][0] += minSpan / 2;
    dx = minSpan;
  }
  if (dy < minSpan) {
    b[0][1] -= minSpan / 2;
    b[1][1] += minSpan / 2;
    dy = minSpan;
  }
  const k = Math.min(MAX_ZOOM, (w - pad * 2) / dx, (h - pad * 2) / dy);
  const t = d3.zoomIdentity
    .translate(w / 2, h / 2)
    .scale(k)
    .translate(-(b[0][0] + b[1][0]) / 2, -(b[0][1] + b[1][1]) / 2);
  svg.transition().duration(motionMs()).call(zoom.transform, t);
}
const point = coordinates => ({
  type: 'Feature',
  geometry: { type: 'Point', coordinates },
});
function fitFleet() {
  const pts = Object.values(pos).map(p => [p.lon, p.lat]);
  if (pts.length) {
    // extra point to the NE leaves room for the ship photos and labels
    const e = Math.max(...pts.map(c => c[0]));
    const n = Math.max(...pts.map(c => c[1]));
    fit([...pts, [e + 14, n + 6]].map(point), 90);
  } else
    fit(
      [
        {
          type: 'Feature',
          geometry: {
            type: 'MultiPoint',
            coordinates: [
              [-120, -40],
              [60, 65],
            ],
          },
        },
      ],
      10
    );
}
function flyTo(id) {
  const p = pos[id];
  if (!p) return;
  const [w, h] = size();
  const xy = proj([p.lon, p.lat]);
  const k = Math.max(T.k, 2500);
  svg
    .transition()
    .duration(motionMs())
    .call(
      zoom.transform,
      d3.zoomIdentity
        .translate(w / 2, h / 2)
        .scale(k)
        .translate(-xy[0], -xy[1])
    );
}

const BRG = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
function where(p) {
  let best = null;
  for (const c of PLACES) {
    if (!/city|hq/.test(c[3])) continue;
    const d = d3.geoDistance([p.lon, p.lat], [c[0], c[1]]) * 3440.065;
    if (!best || d < best.d) best = { d, c };
  }
  if (!best || best.d > 60) return 'At sea';
  const name = best.c[2].replace(' (HQ)', '');
  if (best.d < 3) return name;
  // initial bearing from the place to the vessel
  const rad = Math.PI / 180,
    l1 = best.c[1] * rad,
    l2 = p.lat * rad,
    dl = (p.lon - best.c[0]) * rad;
  const y = Math.sin(dl) * Math.cos(l2),
    x =
      Math.cos(l1) * Math.sin(l2) - Math.sin(l1) * Math.cos(l2) * Math.cos(dl);
  const b = (Math.atan2(y, x) / rad + 360) % 360;
  return `${Math.round(best.d)} nm ${BRG[Math.round(b / 45) % 8]} of ${name}`;
}

/* screen-space boxes [left, top, right, bottom] for label collision checks */
const box = el => {
  const r = el.getBoundingClientRect();
  return [r.left, r.top, r.right, r.bottom];
};
const hit = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
function hideVesselLabelClashes() {
  const els = mkG.selectAll('a.mk').nodes();
  els.forEach(e => {
    e.querySelector('text').style.display = '';
  });
  const ships = els.map(e => box(e.querySelector('image')));
  const shown = [];
  els.forEach((e, i) => {
    const t = e.querySelector('text');
    const r = box(t);
    const clash =
      ships.some((b, j) => j !== i && hit(r, b)) || shown.some(b => hit(r, b));
    if (clash) t.style.display = 'none';
    else shown.push(r);
  });
}
function declutter() {
  const boxes = [];
  mkG.selectAll('a.mk').each(function () {
    const r = box(this);
    boxes.push([r[0] - 4, r[1] - 4, r[2] + 4, r[3] + 4]);
  });
  const order = {
    ocean: 0,
    'country big': 1,
    sea: 2,
    hq: 3,
    country: 4,
    region: 5,
    city: 6,
  };
  const nodes = plG.selectAll('text.pl').nodes();
  nodes.forEach(n => (n.style.display = ''));
  nodes.sort(
    (a, b) =>
      (order[a.__data__.p[3]] ?? 9) - (order[b.__data__.p[3]] ?? 9) ||
      a.__data__.p[4] - b.__data__.p[4]
  );
  const kept = new Set();
  const cr = box(document.getElementById('chart'));
  for (const n of nodes) {
    const r = box(n);
    const b = [r[0] - 2, r[1] - 1, r[2] + 2, r[3] + 1];
    const ok =
      r[0] >= cr[0] &&
      r[2] <= cr[2] &&
      r[1] >= cr[1] &&
      r[3] <= cr[3] &&
      !boxes.some(x => hit(b, x));
    n.style.display = ok ? '' : 'none';
    if (ok) {
      boxes.push(b);
      kept.add(n.__data__.p[2]);
    }
  }
  plG
    .selectAll('circle.pl-dot')
    .style('display', d => (kept.has(d.p[2]) ? '' : 'none'));
}
function drawMarkers() {
  const [w, h] = size();
  const data = FLEET.filter(v => pos[v.id])
    .map(v => {
      const p = pos[v.id];
      const [x, y] = T.apply(proj([p.lon, p.lat]));
      return { v, p, x, y };
    })
    .sort((a, b) => (a.v.id === selected) - (b.v.id === selected) || a.y - b.y);
  const narrow = w < 560;
  const W = narrow
    ? Math.max(38, Math.min(110, 38 + Math.log2(Math.max(1, T.k / 150)) * 14))
    : Math.max(64, Math.min(170, 64 + Math.log2(Math.max(1, T.k / 150)) * 18));
  const g = mkG
    .selectAll('a.mk')
    .data(data, d => d.v.id)
    .join(enter => {
      const g = enter
        .append('a')
        .attr('class', 'mk')
        .attr('href', d => d.v.tdi)
        .attr('target', '_blank')
        .attr('rel', 'noopener')
        .attr('aria-label', d => d.v.name + ' on the TDI-Brooks website')
        .on('mouseenter', (e, d) => {
          hover = d.v.id;
          drawMarkers();
        })
        .on('mouseleave', () => {
          hover = null;
          drawMarkers();
        });
      g.append('title').text(d => 'Open ' + d.v.name + ' on tdi-bi.com');
      g.append('circle')
        .attr('class', 'halo')
        .attr('r', 7)
        .style('stroke', d => `var(${d.v.c})`);
      g.append('circle')
        .attr('class', 'body')
        .attr('r', 3.5)
        .style('fill', d => `var(${d.v.c})`);
      g.append('image')
        .attr('class', 'photo')
        .attr('href', d => d.v.photo)
        .attr('preserveAspectRatio', 'xMidYMax meet');
      g.append('text')
        .attr('class', 'mk-label')
        .attr('x', 10)
        .attr('y', 5)
        .text(d => d.v.short);
      return g;
    })
    .order();
  g.each(function (d) {
    const { v, p, x, y } = d;
    const el = d3
      .select(this)
      .attr('transform', `translate(${x},${y})`)
      .classed('sel', selected === v.id)
      .classed('stale', fresh(p.fixTime)[0] === 'bad');
    const iw = selected === v.id ? W * 1.25 : W,
      ih = iw / v.ar;
    el.select('.photo')
      .attr('width', iw)
      .attr('height', ih)
      .attr('x', -iw / 2)
      .attr('y', -ih - 4);
  });
  hideVesselLabelClashes();
  declutter();
  // callout for the selected vessel
  const co = document.getElementById('callout'),
    sd = data.find(d => d.v.id === (hover || selected));
  if (!sd || sd.x < -50 || sd.x > w + 50 || sd.y < -50 || sd.y > h + 50) {
    co.hidden = true;
  } else {
    const { v, p } = sd;
    co.innerHTML = `<div class="eyebrow">${fresh(p.fixTime)[1]}</div><div class="cname">${esc(v.name)}</div>
<div class="cline">${esc(where(p))}</div><div class="cpos">${dm(p.lat, true)} ${dm(p.lon, false)} · ${ago(p.fixTime)}</div><div class="cgo">Click the ship for the vessel page ↗</div>`;
    co.hidden = false;
    const cw = co.offsetWidth,
      ch = co.offsetHeight,
      off = W * 0.7;
    let left = sd.x + off,
      top = sd.y - ch - (W / v.ar) * 0.4;
    if (left + cw > w - 8) left = sd.x - off - cw;
    left = Math.max(8, Math.min(w - cw - 8, left));
    top = Math.max(8, Math.min(h - ch - 8, top));
    co.style.left = left + 'px';
    co.style.top = top + 'px';
  }
}

/* ---------- list ---------- */
function renderList() {
  const L = document.getElementById('list');
  L.innerHTML = FLEET.map(v => {
    const p = pos[v.id];
    const [fk, fl] = fresh(p?.fixTime);
    const mt = `https://www.marinetraffic.com/en/ais/details/ships/mmsi:${v.mmsi}`;
    const vf = `https://www.vesselfinder.com/vessels/details/${v.imo}`;
    const ms = `https://www.myshiptracking.com/vessels/mmsi-${v.mmsi}`;
    return `<div class="vessel${selected === v.id ? ' sel' : ''}" style="--c:var(${v.c})" role="button" tabindex="0" data-id="${v.id}">
<div class="vhead">
  <div class="vname">${esc(v.name)} <span class="chip ${fk}">${fl}</span></div>
  <div class="where">${p ? esc(where(p)) : 'No position yet'}</div>
</div>
<img class="thumb" src="${v.photo}" alt="">
${
  p
    ? `<dl class="facts">
  <div><dt>Position</dt><dd>${dm(p.lat, true)} ${dm(p.lon, false)}</dd></div>
  <div><dt>Last updated</dt><dd title="${utc(p.fixTime)}">${ago(p.fixTime)}</dd></div>
</dl>`
    : ''
}
<div class="ids">MMSI ${v.mmsi} · IMO ${v.imo} · ${esc(v.flag)}</div>
<div class="links"><a class="tdi" href="${v.tdi}" target="_blank" rel="noopener">TDI vessel page ↗</a><a href="${mt}" target="_blank" rel="noopener">MarineTraffic</a><a href="${vf}" target="_blank" rel="noopener">VesselFinder</a><a href="${ms}" target="_blank" rel="noopener">MyShipTracking</a></div>
</div>`;
  }).join('');
}
document.getElementById('list').addEventListener('click', e => {
  if (e.target.closest('a')) return;
  const el = e.target.closest('.vessel');
  if (el) select(el.dataset.id, true);
});
document.getElementById('list').addEventListener('keydown', e => {
  const el = e.target.closest('.vessel');
  if (el && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    select(el.dataset.id, true);
  }
});
function select(id, fly) {
  selected = id;
  renderList();
  drawMarkers();
  if (fly) flyTo(id);
}

document.getElementById('fitBtn').onclick = () => {
  selected = null;
  renderList();
  drawMarkers();
  fitFleet();
};
document.getElementById('zin').onclick = () =>
  svg.transition().duration(250).call(zoom.scaleBy, 2);
document.getElementById('zout').onclick = () =>
  svg.transition().duration(250).call(zoom.scaleBy, 0.5);
new ResizeObserver(() => {
  drawPlaces();
  drawMarkers();
}).observe(document.getElementById('chart'));

setInterval(() => {
  renderList();
  drawMarkers();
}, 60000);

renderList();
requestAnimationFrame(() => fitFleet());

/* ---------- positions feed: internal getFleetPositions API ---------- */
const POSITIONS_API = 'https://todo.tdi-bi.com/getFleetPositions';
const REFRESH_MS = 5 * 60 * 1000;
/* API response: { <api key>: { pos: { latitude, longitude }, time } } -> pos[<fleet id>] */
function readFleetPositions(j) {
  let newest = null;
  for (const v of FLEET) {
    const x = j[v.api];
    const lat = x?.pos?.latitude,
      lon = x?.pos?.longitude;
    if (typeof lat !== 'number' || typeof lon !== 'number') continue;
    pos[v.id] = { lat, lon, fixTime: x.time };
    if (x.time && (!newest || x.time > newest)) newest = x.time;
  }
  return newest;
}
let firstFit = false;
function setFeed(live, text) {
  document.getElementById('feed').innerHTML =
    `<span class="dot${live ? ' live' : ''}"></span><span>${esc(text)}</span>`;
  document.getElementById('embedBadge').textContent = text;
}
async function loadPositions() {
  try {
    const sites = FLEET.map(v => v.site).join(',');
    const r = await fetch(`${POSITIONS_API}?sites=${sites}`, {
      cache: 'no-store',
    });
    if (!r.ok) throw new Error(r.status);
    const updated = readFleetPositions(await r.json());
    setFeed(true, `Updated ${ago(updated)} (${utc(updated)})`);
    renderList();
    drawPlaces();
    drawMarkers();
    if (!firstFit) {
      firstFit = true;
      fitFleet();
    }
  } catch (e) {
    setFeed(false, "Couldn't load positions. Retrying in 5 minutes.");
  }
}
loadPositions();
setInterval(loadPositions, REFRESH_MS);
