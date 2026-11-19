// Previsao (publica): qualquer ponto - estacao, localizacao do celular ou clique no mapa
/* global L */
import { estacoes, ao } from '../dados.js';
import { $, esc, ic, n, kmh, rumo, dm, semana, iconeDia, grafico, COR, acao } from '../ui.js';
import { criarMapa, ajustar, marcador } from '../mapa.js';
import { previsaoPonto } from '../meteo.js';
import { avisos, janelasPulverizacao } from '../ciencia.js';
import { rota } from '../nav.js';

let el; let mapa; let marcador_; let ponto = null;

export async function abrir(secao) {
  if (!el) { el = secao; montar(); ao('estacoes', () => rota.atual === '/previsao' && opcoes()); }
  opcoes();
  ajustar(mapa);
  const q = new URLSearchParams(location.hash.split('?')[1] || '');
  if (q.get('lat')) await carregar(+q.get('lat'), +q.get('lon'), q.get('nome') || 'Ponto escolhido');
  else if (!ponto) { const e = estacoes()[0]; if (e) await carregar(e.lat, e.lon, e.name); }
}

function montar() {
  el.innerHTML = `
    <div class="cab"><div><h1>Previsao para 7 dias</h1><p>Escolha uma estacao, use sua localizacao ou clique no mapa.</p></div></div>
    <div class="lado">
      <div class="card">
        <div class="form" style="grid-template-columns:1fr auto">
          <label>Estacao<select id="pv-est"></select></label>
          <button class="btn" id="pv-gps" style="align-self:end">${ic('alvo')}Minha localizacao</button>
        </div>
        <div id="pv-mapa" class="mapa baixo mt"></div>
      </div>
      <div class="card" id="pv-agora"><div class="esqueleto" style="height:120px"></div></div>
    </div>
    <div id="pv-corpo"></div>`;
  mapa = criarMapa($('#pv-mapa'), { zoom: 5 });
  mapa.on('click', (e) => carregar(e.latlng.lat, e.latlng.lng, `Ponto ${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}`));
  $('#pv-est').addEventListener('change', (e) => { const x = estacoes().find((s) => s.id === e.target.value); if (x) carregar(x.lat, x.lon, x.name); });
  $('#pv-gps').addEventListener('click', () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((p) => carregar(p.coords.latitude, p.coords.longitude, 'Sua localizacao'), () => alert('Nao foi possivel obter sua localizacao.'), { timeout: 10000 });
  });
}

function opcoes() {
  const v = $('#pv-est').value;
  $('#pv-est').innerHTML = '<option value="">Escolha...</option>' + estacoes().map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  $('#pv-est').value = v;
}

async function carregar(lat, lon, nome) {
  ponto = { lat, lon, nome };
  if (marcador_) marcador_.remove();
  marcador_ = marcador([lat, lon]).addTo(mapa);
  mapa.setView([lat, lon], Math.max(mapa.getZoom(), 7));
  await acao(null, async () => {
    const p = await previsaoPonto(lat, lon);
    if (ponto.lat !== lat) return;
    const c = p.current || {}; const d = p.daily;
    const av = avisos(d); const jan = janelasPulverizacao(p.hourly);
    $('#pv-agora').innerHTML = `<h3>${esc(nome)}</h3>
      <div class="grande-num num">${n(c.temperature_2m, 0)}<small> °C agora</small></div>
      <p class="suave">UR ${n(c.relative_humidity_2m, 0)}% · vento ${kmh(c.wind_speed_10m)} km/h ${rumo(c.wind_direction_10m)} · ${lat.toFixed(3)}, ${lon.toFixed(3)}</p>
      <div class="metricas mt" style="grid-template-columns:repeat(2,minmax(0,1fr))">
        <div class="metrica"><div class="r">Chuva na semana</div><div class="v num">${n(av.chuva7, 0)}<small> mm</small></div></div>
        <div class="metrica"><div class="r">ETo na semana</div><div class="v num">${n(av.eto7, 0)}<small> mm</small></div></div>
      </div>`;
    $('#pv-corpo').innerHTML = `
      <div class="card mt"><div class="dias7">${d.time.map((t, i) => `
        <div class="dia"><div class="d">${semana(t)} ${dm(t)}</div><div class="ic">${iconeDia(d.precipitation_sum[i], d.precipitation_probability_max[i], d.temperature_2m_max[i])}</div>
        <div><span class="mx">${n(d.temperature_2m_max[i], 0)}°</span> <span class="mn">${n(d.temperature_2m_min[i], 0)}°</span></div>
        <div class="ch">${n(d.precipitation_sum[i], 0)} mm · ${d.precipitation_probability_max[i] ?? '–'}%</div>
        <div class="suave peq">ETo ${n(d.et0_fao_evapotranspiration[i])}</div></div>`).join('')}</div>
        <div class="graf mt"><canvas id="pv-graf"></canvas></div></div>
      <div class="grade g2 mt">
        <div class="card"><h3>${ic('escudo')}Avisos</h3>${av.itens.map((x) => `<div class="aviso ${x.nivel === 'alto' ? 'alto' : ''}"><div><b>${esc(x.titulo)}</b>${esc(x.texto)}</div></div>`).join('') || '<div class="aviso ok"><div><b>Sem alertas</b>Nenhum risco de geada, calor extremo, chuva forte ou deficit previsto.</div></div>'}</div>
        <div class="card"><h3>${ic('vento')}Janelas de pulverizacao (48 h)</h3>${jan.map((j) => `<div class="aviso ok"><div><b>${semana(j.de.slice(0, 10))} ${dm(j.de)} das ${j.de.slice(11, 13)}h as ${String(+j.ate.slice(11, 13) + 1).padStart(2, '0')}h</b>${j.horas} h com vento 3–10 km/h, ate 30 °C, UR acima de 55% e sem chuva</div></div>`).join('') || '<p class="suave">Nenhuma janela favoravel nas proximas 48 horas.</p>'}</div>
      </div>`;
    grafico($('#pv-graf'), { type: 'bar', data: { labels: d.time.map((t) => `${semana(t)} ${dm(t)}`), datasets: [
      { label: 'Chuva (mm)', data: d.precipitation_sum, backgroundColor: COR.chuva, yAxisID: 'y' },
      { label: 'ETo (mm)', data: d.et0_fao_evapotranspiration, backgroundColor: COR.eto, yAxisID: 'y' },
      { type: 'line', label: 'Maxima (°C)', data: d.temperature_2m_max, borderColor: COR.max, backgroundColor: COR.max, yAxisID: 'y1', tension: 0.3 },
      { type: 'line', label: 'Minima (°C)', data: d.temperature_2m_min, borderColor: COR.min, backgroundColor: COR.min, yAxisID: 'y1', tension: 0.3 },
    ] }, options: { scales: { y: { min: 0, title: { display: true, text: 'mm' } }, y1: { position: 'right', grid: { display: false }, title: { display: true, text: '°C' } } } } });
  });
}
