// Mapas: bases sem chave de API, pinos, contornos, vento animado e ferramenta de desenho
/* global L */
import { corTemp, esc, n } from './ui.js';
import { gradeVento } from './meteo.js';
import { areaHa } from './ciencia.js';

const escuro = () => (document.documentElement.dataset.tema === 'escuro') || (!document.documentElement.dataset.tema && matchMedia('(prefers-color-scheme: dark)').matches);

export function bases() {
  return {
    Mapa: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap', className: escuro() ? 'tiles-escuro' : '' }),
    Satelite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Imagens &copy; Esri' }),
    Relevo: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: '&copy; Esri' }),
  };
}

export function criarMapa(el, { centro = [-13.4, -55.6], zoom = 6, base = 'Mapa', camadas = {} } = {}) {
  const m = L.map(el, { zoomControl: true, attributionControl: true }).setView(centro, zoom);
  const b = bases();
  b[base].addTo(m);
  m.controle = L.control.layers(b, camadas, { position: 'topright' }).addTo(m);
  L.control.scale({ imperial: false, position: 'bottomright' }).addTo(m);
  return m;
}
/** recalcula o tamanho (mapas criados em abas escondidas) */
export const ajustar = (m) => m && setTimeout(() => m.invalidateSize(), 60);

export function pino(e, { sel = false, texto } = {}) {
  const t = e.atual && e.atual.temp;
  const rot = texto ?? (t != null ? `${Math.round(t)}°` : '–');
  return L.marker([e.lat, e.lon], {
    title: e.name, riseOnHover: true,
    icon: L.divIcon({ className: '', iconSize: [0, 0], html: `<span class="pino${sel ? ' sel' : ''}" style="background:${corTemp(t)}">${esc(rot)}</span>` }),
  });
}

/** marcador de ponto (sem depender de imagens externas) */
export const marcador = (ll) => L.marker(ll, { icon: L.divIcon({ className: '', iconSize: [0, 0], html: '<span class="alfinete"></span>' }) });

export function contorno(p, { cor = '#43a047', popup = true } = {}) {
  if (!p.boundary) return null;
  let geo; try { geo = JSON.parse(p.boundary); } catch { return null; }
  const c = L.geoJSON(geo, {
    style: (f) => {
      const lim = !f.properties || !f.properties.tipo || f.properties.tipo === 'limite';
      return { color: (f.properties && f.properties.cor) || cor, weight: lim ? 3 : 2, fillOpacity: lim ? 0.08 : 0.2 };
    },
    onEachFeature: (f, l) => {
      const pr = f.properties || {};
      if (pr.nome && pr.tipo && pr.tipo !== 'limite') l.bindTooltip(`${esc(pr.nome)}${pr.cultura ? ' · ' + esc(pr.cultura) : ''}`, { permanent: true, direction: 'center', className: 'rotulo-talhao' });
    },
  });
  if (popup) c.bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.crop || '')}${p.areaHa ? ` · ${n(p.areaHa)} ha` : ''}`);
  return c;
}

/** Camada de vento animado (leaflet-velocity) com dados do Open-Meteo em volta do centro do mapa */
export async function camadaVento(m, hora = 0) {
  const c = m.getCenter();
  const g = await gradeVento(c.lat, c.lng, { hora });
  const camada = L.velocityLayer({
    displayValues: true,
    displayOptions: { velocityType: 'Vento', position: 'bottomleft', emptyString: 'sem dados', speedUnit: 'k/h', angleConvention: 'meteoCW' },
    data: g.campo, maxVelocity: Math.max(8, g.max), velocityScale: 0.012, particleMultiplier: 1 / 220, lineWidth: 2,
    colorScale: ['#3288bd', '#66c2a5', '#abdda4', '#e6f598', '#fee08b', '#fdae61', '#f46d43', '#d53e4f'],
  });
  camada.info = g;
  return camada;
}

/** Desenho de poligono: clique adiciona vertice, duplo clique fecha. Resultado em GeoJSON ([lon, lat]). */
export class Desenho {
  constructor(m, aoMudar) { this.m = m; this.aoMudar = aoMudar; this.pts = []; this.grupo = L.layerGroup().addTo(m); }
  iniciar() {
    this.parar();
    this.ativo = true; this.m.doubleClickZoom.disable(); this.m.getContainer().style.cursor = 'crosshair';
    this.fc = (e) => {
      const px = (p) => this.m.latLngToContainerPoint(p).distanceTo(e.containerPoint);
      const n = this.pts.length;
      // clique repetido no ultimo vertice (duplo clique) ou no primeiro vertice fecha o poligono
      if (n && px(this.pts[n - 1]) < 6) { if (n >= 3) this.parar(); return; }
      if (n >= 3 && px(this.pts[0]) < 10) { this.parar(); return; }
      this.pts.push([e.latlng.lat, e.latlng.lng]); this.desenhar();
    };
    this.fd = () => this.parar();
    this.m.on('click', this.fc).on('dblclick', this.fd);
  }
  parar() {
    if (!this.ativo) return;
    this.ativo = false; this.m.off('click', this.fc).off('dblclick', this.fd);
    this.m.doubleClickZoom.enable(); this.m.getContainer().style.cursor = '';
    this.pts = this.pts.filter((p, i, a) => !i || Math.abs(p[0] - a[i - 1][0]) + Math.abs(p[1] - a[i - 1][1]) > 1e-7);
    this.desenhar();
  }
  desfazer() { this.pts.pop(); this.desenhar(); }
  limpar() { this.pts = []; this.desenhar(); }
  geojson() {
    if (this.pts.length < 3) return null;
    const anel = this.pts.map(([la, lo]) => [+lo.toFixed(6), +la.toFixed(6)]);
    return { type: 'Polygon', coordinates: [[...anel, anel[0]]] };
  }
  carregar(texto) {
    try {
      let g = typeof texto === 'string' ? texto.trim() : texto;
      if (typeof g === 'string' && g.startsWith('<')) { // KML: primeiro <coordinates>
        const m = g.match(/<coordinates>([\s\S]*?)<\/coordinates>/i);
        g = { type: 'Polygon', coordinates: [m[1].trim().split(/\s+/).map((c) => c.split(',').slice(0, 2).map(Number))] };
      } else if (typeof g === 'string') g = JSON.parse(g);
      if (g.type === 'FeatureCollection') g = (g.features.find((f) => f.properties && f.properties.tipo === 'limite') || g.features[0]).geometry;
      if (g.type === 'Feature') g = g.geometry;
      const anel = g.type === 'MultiPolygon' ? g.coordinates[0][0] : g.coordinates[0];
      this.pts = anel.slice(0, -1).map(([lo, la]) => [la, lo]);
      this.desenhar();
      if (this.pts.length >= 3) this.m.fitBounds(L.latLngBounds(this.pts), { padding: [30, 30] });
      return this.pts.length >= 3;
    } catch { return false; }
  }
  desenhar() {
    this.grupo.clearLayers();
    if (this.pts.length) {
      (this.pts.length >= 3 ? L.polygon(this.pts, { color: '#f9a825', weight: 3, fillOpacity: 0.15 }) : L.polyline(this.pts, { color: '#f9a825', dashArray: '5 5', weight: 3 })).addTo(this.grupo);
      this.pts.forEach((p) => L.circleMarker(p, { radius: 5, color: '#fff', weight: 2, fillColor: '#f9a825', fillOpacity: 1 }).addTo(this.grupo));
    }
    const g = this.geojson();
    if (this.aoMudar) this.aoMudar(g, g ? areaHa(g.coordinates[0]) : 0);
  }
}
