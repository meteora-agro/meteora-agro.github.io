// Inicio (publico): rede de estacoes, condicoes agora, mapa, previsao e chamada para o cadastro
/* global L */
import { S, ao, horas, logado } from '../dados.js';
import { $, $$, esc, ic, n, kmh, rumo, quando, corTemp, LEGENDA_TEMP, dmh, semana, dm, iconeDia, grafico, COR } from '../ui.js';
import { criarMapa, ajustar, pino } from '../mapa.js';
import { rota } from '../nav.js';

let el; let mapa; let camada; let sel = null;
try { sel = localStorage.getItem('estacaoPublica'); } catch { /* */ }

export function abrir(secao) {
  if (!el) { el = secao; montar(); ao('estacoes', () => rota.atual === '/' && desenhar()); }
  ajustar(mapa);
  desenhar();
}

function montar() {
  el.innerHTML = `
    <div class="heroi">
      <div>
        <h1>O tempo da sua lavoura, hora a hora</h1>
        <p>Rede publica de estacoes em Mato Grosso com previsao, evapotranspiracao (ETo), avisos de geada e chuva forte e as melhores horas para pulverizar.</p>
        <select id="in-sel" aria-label="Estacao"></select>
      </div>
      <div class="agora" id="in-agora"></div>
    </div>
    <div class="kpis" id="in-kpis"></div>
    <div class="lado">
      <div>
        <div id="in-mapa" class="mapa"></div>
        <div class="legenda mt">Temperatura agora: ${LEGENDA_TEMP.map(([t, l]) => `<i style="background:${corTemp(t)}"></i>${l}`).join(' ')} °C</div>
      </div>
      <div id="in-det"></div>
    </div>
    <h2 class="mt" style="margin-top:28px">Estacoes da rede</h2>
    <div class="lista-est mt" id="in-lista"></div>
    <h2 style="margin-top:28px">Na sua propriedade</h2>
    <p class="suave">Crie a conta gratis, desenhe o contorno da fazenda e acompanhe o ponto exato da sua lavoura.</p>
    <div class="recursos mt">
      ${[['painel', 'Painel da fazenda', 'Temperatura, chuva e vento no ponto da lavoura, com estacao propria ou virtual.', '/painel'],
    ['gota', 'Irrigacao', 'ETc da sua cultura e fase (Kc FAO-56) menos a chuva efetiva: a lamina a repor.', '/irrigacao'],
    ['folha', 'Contorno e talhoes', 'Desenhe o limite no satelite ou importe GeoJSON/KML. Area calculada na hora.', '/fazenda'],
    ['doc', 'Relatorio semanal', 'Resumo da semana, previsao e janelas de pulverizacao, pronto para imprimir ou salvar em PDF.', '/relatorio']]
    .map(([i, t, d, r]) => `<div class="recurso" data-login="${esc(t)}" data-destino="${r}" data-aba="criar"><div class="ic">${ic(i)}</div><h3>${t}</h3><p class="suave peq">${d}</p></div>`).join('')}
    </div>
    <div class="chamada"><div><h3>Comece agora, sem custo</h3><p class="suave">Plano gratis com 1 propriedade e 2 estacoes. Sem cartao.</p></div>
      <button class="btn prim" data-login="Crie sua conta" data-aba="criar">Criar conta gratis</button></div>`;
  mapa = criarMapa($('#in-mapa'), { zoom: 6 });
  camada = L.layerGroup().addTo(mapa);
  $('#in-sel').addEventListener('change', (e) => selecionar(e.target.value, true));
}

function desenhar() {
  const est = [...S.publicas].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  if (!sel || !est.some((e) => e.id === sel)) sel = (est.find((e) => e.atual) || est[0] || {}).id || null;
  $('#in-sel').innerHTML = est.map((e) => `<option value="${esc(e.id)}"${e.id === sel ? ' selected' : ''}>${esc(e.name)}</option>`).join('') || '<option>Nenhuma estacao ainda</option>';

  const com = est.filter((e) => e.atual && e.atual.temp != null);
  const media = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const maxPor = (f) => est.filter((e) => f(e) != null).sort((a, b) => f(b) - f(a))[0];
  const quente = maxPor((e) => e.atual && e.atual.temp); const chuvosa = maxPor((e) => e.chuva24h); const ventosa = maxPor((e) => e.atual && e.atual.wind);
  const etos = est.map((e) => e.ontem && e.ontem.eto).filter((v) => v != null);
  $('#in-kpis').innerHTML = [
    ['term', 'Temperatura media', `${n(media(com.map((e) => e.atual.temp)))}<small> °C</small>`, quente ? `maxima ${n(quente.atual.temp)} °C em ${quente.name}` : ''],
    ['gota', 'Maior chuva em 24 h', `${n(chuvosa && chuvosa.chuva24h)}<small> mm</small>`, chuvosa ? chuvosa.name : ''],
    ['sol', 'ETo media (ontem)', `${n(media(etos))}<small> mm</small>`, 'FAO-56 Penman-Monteith'],
    ['vento', 'Vento mais forte', `${kmh(ventosa && ventosa.atual.wind)}<small> km/h</small>`, ventosa ? ventosa.name : ''],
    ['sinal', 'Estacoes', `${est.length}`, `${com.length} com dados recentes`],
  ].map(([i, r, v, s]) => `<div class="kpi"><div class="r">${ic(i)}${r}</div><div class="v num">${v}</div><div class="s">${esc(s)}</div></div>`).join('');

  camada.clearLayers();
  est.forEach((e) => pino(e, { sel: e.id === sel }).on('click', () => selecionar(e.id)).addTo(camada));
  if (est.length && !desenhar.enquadrado) { mapa.fitBounds(L.latLngBounds(est.map((e) => [e.lat, e.lon])), { padding: [30, 30], maxZoom: 8 }); desenhar.enquadrado = true; }

  $('#in-lista').innerHTML = est.map((e) => `
    <div class="est-item${e.id === sel ? ' sel' : ''}" data-id="${esc(e.id)}">
      <span class="n">${esc(e.name)}</span><span class="t num" style="color:${corTemp(e.atual && e.atual.temp)}">${n(e.atual && e.atual.temp, 0)}°</span>
      <span class="suave peq">${n(e.chuva24h)} mm · ${quando(e.ultimoDado)}</span>
    </div>`).join('') || '<div class="vazio">A rede publica ainda nao tem estacoes. O administrador cadastra as estacoes INMET em Admin.</div>';
  $$('#in-lista .est-item').forEach((x) => x.addEventListener('click', () => selecionar(x.dataset.id, true)));
  detalhe();
}

function selecionar(id, voar) {
  sel = id;
  try { localStorage.setItem('estacaoPublica', id); } catch { /* */ }
  const e = S.publicas.find((x) => x.id === id);
  if (voar && e) mapa.flyTo([e.lat, e.lon], Math.max(mapa.getZoom(), 8), { duration: 0.6 });
  desenhar();
}

let ultimoGrafico = '';
async function detalhe() {
  const e = S.publicas.find((x) => x.id === sel);
  if (!e) { $('#in-det').innerHTML = ''; $('#in-agora').innerHTML = ''; return; }
  const a = e.atual || {};
  $('#in-agora').innerHTML = `<div class="t num">${n(a.temp, 0)}°</div><div class="l">${esc(e.name)} · ${quando(e.ultimoDado)}</div>
    <div class="l">UR ${n(a.rh, 0)}% · vento ${kmh(a.wind)} km/h ${rumo(a.dir)} · chuva 24 h ${n(e.chuva24h)} mm</div>`;
  const p = e.previsao || {};
  $('#in-det').innerHTML = `
    <div class="card">
      <h3>${esc(e.name)} ${e.inmetCode ? `<span class="selo ambar">INMET ${esc(e.inmetCode)}</span>` : ''}</h3>
      <div class="metricas" style="grid-template-columns:repeat(3,minmax(0,1fr))">
        ${[['Umidade', `${n(a.rh, 0)}<small>%</small>`], ['Vento', `${kmh(a.wind)}<small> km/h</small>`], ['Chuva 24 h', `${n(e.chuva24h)}<small> mm</small>`],
    ['Min / max 24 h', `${n(e.tmin24h, 0)}/${n(e.tmax24h, 0)}<small>°</small>`], ['ETo ontem', `${n(e.ontem && e.ontem.eto)}<small> mm</small>`], ['Orvalho', `${n(a.dew, 0)}<small>°</small>`]]
    .map(([r, v]) => `<div class="metrica"><div class="r">${r}</div><div class="v num">${v}</div></div>`).join('')}
      </div>
      <div class="graf baixo mt"><canvas id="in-graf"></canvas></div>
      <p class="suave peq">Fonte: ${esc(a.fonte || '–')} · ${a.hora ? dmh(a.hora) : ''}</p>
    </div>
    ${(p.dias || []).length ? `<div class="card"><h3>${ic('nuvem')}Proximos 7 dias</h3><div class="dias7">${p.dias.map((d) => `
      <div class="dia"><div class="d">${semana(d.data)} ${dm(d.data)}</div><div class="ic">${iconeDia(d.chuva, d.prob, d.tmax)}</div>
      <div><span class="mx">${n(d.tmax, 0)}°</span> <span class="mn">${n(d.tmin, 0)}°</span></div><div class="ch">${n(d.chuva, 0)} mm</div></div>`).join('')}</div>
      ${(p.itens || []).map((x) => `<div class="aviso ${x.nivel === 'alto' ? 'alto' : ''} mt"><div><b>${esc(x.titulo)}</b>${esc(x.texto)}</div></div>`).join('')}
    </div>` : ''}
    ${logado() ? '' : '<div class="card"><p>Quer esses dados no ponto exato da sua lavoura?</p><button class="btn prim mt" data-login="Para acompanhar a sua fazenda" data-aba="criar">Comecar gratis</button></div>'}`;
  const chave = `${e.id}|${e.ultimoDado && e.ultimoDado.toMillis()}`;
  const h = await horas(e.id, 48).catch(() => []);
  if (sel !== e.id) return;
  ultimoGrafico = chave;
  grafico($('#in-graf'), {
    type: 'bar',
    data: { labels: h.map((x) => dmh(x.hora)), datasets: [
      { type: 'line', label: 'Temperatura (°C)', data: h.map((x) => x.temp), borderColor: COR.temp, backgroundColor: COR.temp, pointRadius: 0, tension: 0.35, yAxisID: 'y' },
      { label: 'Chuva (mm)', data: h.map((x) => x.rain ?? 0), backgroundColor: COR.chuva, yAxisID: 'y1' },
    ] },
    options: { scales: { x: { ticks: { maxTicksLimit: 6 } }, y: { position: 'left' }, y1: { position: 'right', min: 0, suggestedMax: 4, grid: { display: false } } } },
  });
  void ultimoGrafico;
}
