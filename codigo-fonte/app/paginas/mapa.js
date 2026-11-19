// Mapa (publico): estacoes, propriedades do usuario, vento animado e Windy
/* global L */
import { S, ao, estacoes } from '../dados.js';
import { $, $$, esc, n, kmh, rumo, quando, dmh } from '../ui.js';
import { criarMapa, ajustar, pino, contorno, camadaVento } from '../mapa.js';
import { rota } from '../nav.js';

let el; let mapa; let gEst; let gProp; let vento = null; let modo = 'estacoes'; let timer;

export function abrir(secao) {
  if (!el) {
    el = secao; montar();
    ao('estacoes', () => rota.atual === '/mapa' && desenhar());
    ao('props', () => rota.atual === '/mapa' && desenhar());
  }
  ajustar(mapa);
  desenhar();
}

function montar() {
  el.innerHTML = `
    <div class="cab"><div><h1>Mapa</h1><p>Estacoes, sua propriedade e o vento previsto para as proximas 48 horas.</p></div></div>
    <div class="ferramentas-mapa">
      <div class="grupo" id="mp-modo"><button data-m="estacoes" class="on">Estacoes</button><button data-m="vento">Vento animado</button><button data-m="windy">Windy</button></div>
      <span id="mp-hora" hidden class="linha-acoes"><input type="range" min="0" max="47" value="0" id="mp-h" style="width:200px"> <b id="mp-hl">agora</b> <span class="suave peq" id="mp-info"></span></span>
    </div>
    <div id="mp-mapa" class="mapa alto"></div>
    <iframe id="windy" title="Windy" hidden loading="lazy"></iframe>`;
  gEst = L.layerGroup(); gProp = L.featureGroup();
  mapa = criarMapa($('#mp-mapa'), { camadas: { Estacoes: gEst, Propriedades: gProp } });
  gEst.addTo(mapa); gProp.addTo(mapa);
  $$('#mp-modo button').forEach((b) => b.addEventListener('click', () => trocar(b.dataset.m)));
  $('#mp-h').addEventListener('input', () => {
    const h = +$('#mp-h').value;
    $('#mp-hl').textContent = h ? `daqui a ${h} h` : 'agora';
    clearTimeout(timer); timer = setTimeout(carregarVento, 350);
  });
}

function desenhar() {
  gEst.clearLayers(); gProp.clearLayers();
  estacoes().forEach((e) => pino(e).bindPopup(`<b>${esc(e.name)}</b><br>${n(e.atual && e.atual.temp)} °C · UR ${n(e.atual && e.atual.rh, 0)}%<br>
    vento ${kmh(e.atual && e.atual.wind)} km/h ${rumo(e.atual && e.atual.dir)} · chuva 24 h ${n(e.chuva24h)} mm<br>
    <span style="opacity:.7">${quando(e.ultimoDado)}${e.atual && e.atual.hora ? ' · ' + dmh(e.atual.hora) : ''}</span><br>
    <a href="#/previsao?lat=${e.lat}&lon=${e.lon}&nome=${encodeURIComponent(e.name)}">Previsao deste ponto</a>`).addTo(gEst));
  S.props.forEach((p) => { const c = contorno(p); if (c) c.addTo(gProp); });
}

async function trocar(m) {
  modo = m;
  $$('#mp-modo button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  $('#mp-mapa').hidden = m === 'windy'; $('#windy').hidden = m !== 'windy'; $('#mp-hora').hidden = m !== 'vento';
  if (m === 'windy') {
    const c = mapa.getCenter();
    $('#windy').src = `https://embed.windy.com/embed2.html?lat=${c.lat.toFixed(2)}&lon=${c.lng.toFixed(2)}&zoom=6&level=surface&overlay=wind&product=ecmwf&menu=&message=true&type=map&location=coordinates&metricWind=km%2Fh&metricTemp=%C2%B0C`;
    return;
  }
  ajustar(mapa);
  if (m === 'vento') await carregarVento();
  else if (vento) { mapa.removeLayer(vento); vento = null; }
}

async function carregarVento() {
  if (modo !== 'vento') return;
  $('#mp-info').textContent = 'carregando...';
  try {
    const nova = await camadaVento(mapa, +$('#mp-h').value);
    if (vento) mapa.removeLayer(vento);
    vento = nova.addTo(mapa);
    const t = new Date(nova.info.quando + ':00Z');
    $('#mp-info').textContent = `${t.toLocaleString('pt-BR', { timeZone: 'America/Cuiaba', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · maximo ${kmh(nova.info.max)} km/h · Open-Meteo`;
  } catch (x) { $('#mp-info').textContent = x.message; }
}
