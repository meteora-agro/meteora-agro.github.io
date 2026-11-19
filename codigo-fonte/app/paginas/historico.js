// Historico diario: graficos, tabela e CSV
import { ao, estacoes, estacao, resumos, plano, admin } from '../dados.js';
import { $, esc, n, dm, dma, grafico, COR, baixarCsv, acao } from '../ui.js';
import { diasAtras } from '../ciencia.js';
import { rota } from '../nav.js';

let el; let ultimo = [];
const VARS = {
  temp: { nome: 'Temperatura', tipo: 'line', series: [['Maxima (°C)', 'tmax', COR.max], ['Media (°C)', 'tavg', COR.temp], ['Minima (°C)', 'tmin', COR.min]] },
  chuva: { nome: 'Chuva', tipo: 'bar', series: [['Chuva (mm)', 'chuva', COR.chuva]] },
  eto: { nome: 'ETo', tipo: 'bar', series: [['ETo (mm)', 'eto', COR.eto]] },
  balanco: { nome: 'Balanco hidrico', tipo: 'bar', series: [['Chuva - ETo (mm)', 'balanco', COR.saldo]] },
  gd: { nome: 'Graus-dia', tipo: 'bar', series: [['Graus-dia (°C·d)', 'gd', COR.temp]] },
  ur: { nome: 'Umidade', tipo: 'line', series: [['UR media (%)', 'ur', COR.ur]] },
};

export function abrir(secao) {
  if (!el) {
    el = secao;
    el.innerHTML = `
      <div class="cab"><div><h1>Historico</h1><p>Resumos diarios calculados toda hora pelo Meteora (dias completos).</p></div></div>
      <div class="card">
        <div class="form">
          <label>Estacao<select id="hi-est"></select></label>
          <label>De<input type="date" id="hi-ini"></label>
          <label>Ate<input type="date" id="hi-fim"></label>
          <label>Variavel<select id="hi-var">${Object.entries(VARS).map(([k, v]) => `<option value="${k}">${v.nome}</option>`).join('')}</select></label>
        </div>
        <div class="linha-acoes mt"><button class="btn prim" id="hi-ok">Consultar</button><button class="btn" id="hi-csv">Baixar CSV</button><span class="suave peq" id="hi-aviso"></span></div>
      </div>
      <div class="card mt"><div class="graf alto"><canvas id="hi-graf"></canvas></div><div id="hi-tot" class="linha-acoes mt"></div></div>
      <div class="card mt rolagem"><table id="hi-tab"></table></div>`;
    $('#hi-ini').value = diasAtras(30); $('#hi-fim').value = diasAtras(1);
    $('#hi-ok').addEventListener('click', () => acao($('#hi-ok'), consultar));
    $('#hi-var').addEventListener('change', grafar);
    $('#hi-csv').addEventListener('click', csv);
    ao('estacoes', () => rota.atual === '/historico' && opcoes());
  }
  opcoes();
  return consultar();
}

function opcoes() {
  const v = $('#hi-est').value;
  $('#hi-est').innerHTML = estacoes().map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join('');
  if (v && estacao(v)) $('#hi-est').value = v;
}

async function consultar() {
  const e = estacao($('#hi-est').value);
  if (!e) return;
  const lim = admin() ? 3650 : plano().historicoDias;
  if ($('#hi-ini').value < diasAtras(lim)) $('#hi-ini').value = diasAtras(lim);
  $('#hi-aviso').textContent = admin() ? '' : `Plano ${plano().nome}: ate ${lim} dias de historico.`;
  ultimo = await resumos(e.id, $('#hi-ini').value, $('#hi-fim').value);
  grafar();
  const s = (c) => ultimo.reduce((a, d) => a + (d[c] || 0), 0);
  $('#hi-tot').innerHTML = ultimo.length ? [['Dias', ultimo.length, ''], ['Chuva', n(s('chuva')), 'mm'], ['ETo', n(s('eto')), 'mm'], ['Balanco', n(s('chuva') - s('eto')), 'mm'], ['Graus-dia', n(s('gd'), 0), '°C·d']]
    .map(([r, v, u]) => `<span class="selo">${r}: <b>${v}</b> ${u}</span>`).join('') : '';
  $('#hi-tab').innerHTML = ultimo.length ? `<tr><th>Data</th><th class="n">Min</th><th class="n">Max</th><th class="n">UR</th><th class="n">Vento m/s</th><th class="n">Chuva</th><th class="n">ETo</th><th class="n">Balanco</th><th class="n">GD</th><th>Fonte da chuva</th></tr>`
    + ultimo.slice().reverse().map((d) => `<tr><td>${dma(d.data)}</td><td class="n">${n(d.tmin)}</td><td class="n">${n(d.tmax)}</td><td class="n">${n(d.ur, 0)}</td><td class="n">${n(d.vento)}</td><td class="n">${n(d.chuva)}</td><td class="n">${n(d.eto)}</td><td class="n">${n(d.balanco)}</td><td class="n">${n(d.gd)}</td><td>${esc(d.fonteChuva)}</td></tr>`).join('')
    : '<tr><td class="vazio">Sem dias completos no periodo. Estacoes novas ganham 30 dias de historico na primeira atualizacao.</td></tr>';
}

function grafar() {
  const v = VARS[$('#hi-var').value];
  grafico($('#hi-graf'), { type: v.tipo, data: { labels: ultimo.map((d) => dm(d.data)), datasets: v.series.map(([l, c, cor]) => ({ label: l, data: ultimo.map((d) => d[c]), borderColor: cor, backgroundColor: cor, pointRadius: 2, tension: 0.3 })) } });
}

function csv() {
  if (!ultimo.length) return;
  const cols = ['data', 'tmin', 'tmax', 'tavg', 'ur', 'vento', 'chuva', 'eto', 'balanco', 'gd', 'fonteChuva', 'horas'];
  baixarCsv(`meteora_${$('#hi-est').value}_${$('#hi-ini').value}_${$('#hi-fim').value}.csv`, cols, ultimo.map((d) => cols.map((c) => d[c])));
}
