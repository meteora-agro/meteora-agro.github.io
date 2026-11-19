// Painel do produtor: condicoes da estacao escolhida, 48 h, previsao, avisos e janelas
/* global L */
import { S, ao, estacoes, estacao, propriedade, horas } from '../dados.js';
import { $, esc, ic, n, kmh, rumo, quando, dm, dmh, semana, iconeDia, grafico, COR } from '../ui.js';
import { criarMapa, ajustar, pino, contorno } from '../mapa.js';
import { rota } from '../nav.js';

let el; let sid = null; let mini;
export const lembrar = (id) => { sid = id; try { localStorage.setItem('estacaoPainel', id); } catch { /* */ } };
try { sid = localStorage.getItem('estacaoPainel'); } catch { /* */ }

export function abrir(secao) {
  if (!el) { el = secao; ao('estacoes', () => rota.atual === '/painel' && desenhar()); }
  desenhar();
}

const tipo = (e) => (e.type === 'sensor' ? '<span class="selo azul">sensor proprio</span>' : e.type === 'virtual' ? '<span class="selo">virtual (modelo)</span>' : '<span class="selo verde">rede publica</span>');

async function desenhar() {
  const lista = estacoes();
  if (!lista.length) {
    el.innerHTML = `<div class="card vazio"><h2>Vamos montar sua fazenda</h2><p>Cadastre a propriedade e uma estacao (virtual, sem equipamento, ou com sensor proprio).</p><a class="btn prim" href="#/fazenda">Ir para Fazenda</a></div>`;
    return;
  }
  const minhas = lista.filter((e) => e.owner && S.user && e.owner === S.user.uid);
  if (!sid || !estacao(sid)) sid = (minhas[0] || lista[0]).id;
  const e = estacao(sid);
  const a = e.atual || {}; const p = e.previsao || {}; const prop = e.propertyId ? propriedade(e.propertyId) : null;
  const atrasado = e.type === 'sensor' && (!e.ultimoDado || Date.now() - e.ultimoDado.toMillis() > 30 * 60e3);
  el.innerHTML = `
    <div class="cab">
      <div><h1>${esc(e.name)}</h1><p>${tipo(e)} ${prop ? `· ${esc(prop.name)}${prop.crop ? ' · ' + esc(prop.crop) : ''}` : ''} · atualizado ${quando(e.ultimoDado)}</p></div>
      <select id="pn-sel" style="width:auto;max-width:320px">${lista.map((x) => `<option value="${esc(x.id)}"${x.id === sid ? ' selected' : ''}>${esc(x.name)}${x.public ? ' (rede publica)' : ''}</option>`).join('')}</select>
    </div>
    ${atrasado ? `<div class="aviso alto"><div><b>A estacao de campo nao envia dados ${e.ultimoDado ? quando(e.ultimoDado) : 'ainda'}</b>Confira energia, internet e o agente Meteora Edge no Raspberry.</div></div>` : ''}
    ${!minhas.length && !e.owner ? '<div class="aviso info"><div><b>Voce esta vendo uma estacao da rede publica</b>Cadastre a sua em <a href="#/fazenda">Fazenda</a> para ter o ponto exato da lavoura.</div></div>' : ''}
    <div class="metricas">
      ${[['Temperatura', `${n(a.temp)}<small> °C</small>`, `min ${n(e.tmin24h, 0)}° · max ${n(e.tmax24h, 0)}° (24 h)`],
    ['Umidade', `${n(a.rh, 0)}<small> %</small>`, `ponto de orvalho ${n(a.dew)} °C`],
    ['Vento', `${kmh(a.wind)}<small> km/h</small>`, a.dir != null ? `de ${rumo(a.dir)} (${n(a.dir, 0)}°)` : 'sem anemometro'],
    ['Chuva 24 h', `${n(e.chuva24h)}<small> mm</small>`, e.ontem ? `ontem ${n(e.ontem.chuva)} mm (${e.ontem.fonteChuva})` : ''],
    ['ETo ontem', `${n(e.ontem && e.ontem.eto)}<small> mm</small>`, e.ontem ? `balanco ${n(e.ontem.balanco)} mm` : 'calculado apos 1 dia completo'],
    ['Graus-dia ontem', `${n(e.ontem && e.ontem.gd)}<small> °C·d</small>`, 'base 10 °C'],
    ['Pressao', `${n(a.p, 0)}<small> hPa</small>`, ''],
    ['Radiacao', `${n(a.rad, 0)}<small> W/m²</small>`, a.hora ? `leitura ${dmh(a.hora)}` : '']]
    .map(([r, v, s]) => `<div class="metrica"><div class="r">${r}</div><div class="v num">${v}</div><div class="s">${s}</div></div>`).join('')}
    </div>
    <div class="grade g2 mt">
      <div class="card"><h3>${ic('term')}Temperatura e umidade · 48 h</h3><div class="graf"><canvas id="pn-g1"></canvas></div></div>
      <div class="card"><h3>${ic('gota')}Chuva e vento · 48 h</h3><div class="graf"><canvas id="pn-g2"></canvas></div></div>
    </div>
    <div class="card mt"><h3>${ic('nuvem')}Proximos 7 dias ${p.em ? `<span class="suave peq">· atualizado ${quando(p.em)}</span>` : ''}</h3>
      ${(p.dias || []).length ? `<div class="dias7">${p.dias.map((d) => `<div class="dia"><div class="d">${semana(d.data)} ${dm(d.data)}</div><div class="ic">${iconeDia(d.chuva, d.prob, d.tmax)}</div>
        <div><span class="mx">${n(d.tmax, 0)}°</span> <span class="mn">${n(d.tmin, 0)}°</span></div><div class="ch">${n(d.chuva, 0)} mm · ${d.prob ?? '–'}%</div><div class="suave peq">ETo ${n(d.eto)}</div></div>`).join('')}</div>
        <p class="suave peq mt">Semana: chuva ${n(p.chuva7, 0)} mm, ETo ${n(p.eto7, 0)} mm.</p>` : '<p class="suave">A previsao aparece na proxima atualizacao horaria.</p>'}
    </div>
    <div class="grade g3 mt">
      <div class="card"><h3>${ic('escudo')}Avisos</h3>${(p.itens || []).map((x) => `<div class="aviso ${x.nivel === 'alto' ? 'alto' : ''}"><div><b>${esc(x.titulo)}</b>${esc(x.texto)}</div></div>`).join('') || '<div class="aviso ok"><div><b>Tudo tranquilo</b>Sem riscos previstos para os proximos dias.</div></div>'}</div>
      <div class="card"><h3>${ic('vento')}Pulverizacao</h3>${(p.janelas || []).map((j) => `<div class="aviso ok"><div><b>${semana(j.de.slice(0, 10))} ${j.de.slice(11, 13)}h–${String(+j.ate.slice(11, 13) + 1).padStart(2, '0')}h</b>${j.horas} h favoraveis</div></div>`).join('') || '<p class="suave">Sem janela favoravel nas proximas 48 h.</p>'}</div>
      <div class="card"><h3>${ic('folha')}Local</h3><div id="pn-mini" class="mapa baixo" style="height:200px"></div></div>
    </div>`;
  $('#pn-sel').addEventListener('change', (ev) => { lembrar(ev.target.value); desenhar(); });

  if (mini) mini.remove();
  mini = criarMapa($('#pn-mini'), { centro: [e.lat, e.lon], zoom: 13, base: 'Satelite' });
  pino(e).addTo(mini);
  const c = prop && contorno(prop);
  if (c) { c.addTo(mini); mini.fitBounds(c.getBounds(), { padding: [10, 10] }); }
  ajustar(mini);

  const h = await horas(e.id, 48).catch(() => []);
  if (sid !== e.id || !document.body.contains($('#pn-g1'))) return;
  const rot = h.map((x) => dmh(x.hora));
  grafico($('#pn-g1'), { type: 'line', data: { labels: rot, datasets: [
    { label: 'Temperatura (°C)', data: h.map((x) => x.temp), borderColor: COR.temp, backgroundColor: COR.temp, pointRadius: 0, tension: 0.35, yAxisID: 'y' },
    { label: 'Umidade (%)', data: h.map((x) => x.rh), borderColor: COR.ur, backgroundColor: COR.ur, pointRadius: 0, tension: 0.35, yAxisID: 'y1' },
  ] }, options: { scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { position: 'left', title: { display: true, text: '°C' } }, y1: { position: 'right', min: 0, max: 100, grid: { display: false }, title: { display: true, text: '%' } } } } });
  grafico($('#pn-g2'), { type: 'bar', data: { labels: rot, datasets: [
    { label: 'Chuva (mm)', data: h.map((x) => x.rain ?? 0), backgroundColor: COR.chuva, yAxisID: 'y' },
    { type: 'line', label: 'Vento (km/h)', data: h.map((x) => (x.wind != null ? +(x.wind * 3.6).toFixed(1) : null)), borderColor: COR.vento, backgroundColor: COR.vento, pointRadius: 0, tension: 0.35, yAxisID: 'y1' },
  ] }, options: { scales: { x: { ticks: { maxTicksLimit: 8 } }, y: { position: 'left', min: 0, suggestedMax: 4, title: { display: true, text: 'mm' } }, y1: { position: 'right', min: 0, grid: { display: false }, title: { display: true, text: 'km/h' } } } } });
  void L;
}
