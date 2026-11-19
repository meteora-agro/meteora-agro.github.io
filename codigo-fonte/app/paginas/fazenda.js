// Fazenda: propriedades (com contorno) e estacoes (virtual ou sensor com login proprio)
/* global L */
import {
  initializeApp, deleteApp, getAuth, connectAuthEmulator, setPersistence, inMemoryPersistence, createUserWithEmailAndPassword,
  doc, setDoc, updateDoc, deleteDoc, writeBatch, collection, getDocs, serverTimestamp,
} from '../firebase.js';
import { db, config, EMULADOR } from '../fb.js';
import { S, ao, admin, plano, proximaVaga, propriedade, minhasEstacoes } from '../dados.js';
import { $, $$, esc, ic, n, quando, toast, acao, dialogo } from '../ui.js';
import { criarMapa, ajustar, pino, contorno, Desenho, marcador } from '../mapa.js';
import { resumoContorno, CULTURAS } from '../ciencia.js';
import { altitude } from '../meteo.js';
import { rota } from '../nav.js';

let el; let mapa; let gProp; let gEst;

export function abrir(secao) {
  if (!el) {
    el = secao;
    el.innerHTML = `
      <div class="cab"><div><h1>Minha fazenda</h1><p>Cadastre a propriedade com o contorno e as estacoes que acompanham a lavoura.</p></div>
        <div class="linha-acoes"><button class="btn prim" id="fz-nova-p">+ Propriedade</button><button class="btn" id="fz-nova-e">+ Estacao</button></div></div>
      <div class="barra-plano" id="fz-plano"></div>
      <div id="fz-mapa" class="mapa medio"></div>
      <h2 class="mt" style="margin-top:24px">Propriedades</h2>
      <div class="grade gauto mt" id="fz-props"></div>
      <h2 style="margin-top:24px">Estacoes</h2>
      <div class="card mt rolagem"><table id="fz-est"></table></div>
      <div class="card mt"><h3>${ic('sinal')}Estacao virtual ou sensor proprio?</h3>
        <p class="suave"><b>Virtual</b>: o Meteora calcula o tempo no ponto exato com o modelo meteorologico, sem equipamento. <b>Sensor</b>: um Raspberry Pi com sensores na fazenda envia as medicoes pelo agente Meteora Edge; o login da estacao aparece uma unica vez ao criar.</p></div>`;
    gProp = L.featureGroup(); gEst = L.layerGroup();
    mapa = criarMapa($('#fz-mapa'), { base: 'Satelite', camadas: { Propriedades: gProp, Estacoes: gEst } });
    gProp.addTo(mapa); gEst.addTo(mapa);
    $('#fz-nova-p').addEventListener('click', () => formPropriedade());
    $('#fz-nova-e').addEventListener('click', () => formEstacao());
    ao('props', () => rota.atual === '/fazenda' && desenhar());
    ao('estacoes', () => rota.atual === '/fazenda' && desenhar());
  }
  ajustar(mapa);
  desenhar(true);
}

function desenhar(enquadrar) {
  const p = plano(); const uid = S.user.uid;
  const props = S.props; const ests = minhasEstacoes();
  $('#fz-plano').innerHTML = admin()
    ? `${ic('escudo')}<span>Administrador: vendo <b>${props.length}</b> propriedades e <b>${ests.length}</b> estacoes de todos os produtores.</span>`
    : `${ic('folha')}<span>Plano <b>${p.nome}</b>: ${props.filter((x) => x.owner === uid).length} de ${p.propriedades} propriedade(s) · ${ests.length} de ${p.estacoes} estacao(oes).</span>`;

  gProp.clearLayers(); gEst.clearLayers();
  props.forEach((x) => { const c = contorno(x); if (c) c.addTo(gProp); });
  ests.forEach((e) => pino(e).bindPopup(`<b>${esc(e.name)}</b><br>${quando(e.ultimoDado)}`).addTo(gEst));
  if (enquadrar) {
    const b = L.latLngBounds([]);
    if (gProp.getLayers().length) b.extend(gProp.getBounds());
    ests.forEach((e) => b.extend([e.lat, e.lon]));
    if (b.isValid()) mapa.fitBounds(b, { padding: [30, 30], maxZoom: 15 });
  }

  $('#fz-props').innerHTML = props.map((x) => `
    <div class="card">
      <h3>${ic('folha')}${esc(x.name)}</h3>
      <p class="suave">${esc(x.crop || 'cultura nao informada')}${x.plantio ? ` · plantio ${x.plantio.split('-').reverse().join('/')}` : ''}</p>
      <p class="suave">${esc(x.city || '')}${x.state ? '/' + esc(x.state) : ''} ${x.areaHa ? `· <b>${n(x.areaHa)} ha</b>` : '· sem contorno'}</p>
      <div class="linha-acoes mt"><button class="btn peq" data-ver="${esc(x.id)}">Ver no mapa</button><button class="btn peq" data-ed="${esc(x.id)}">Editar</button><button class="btn peq perigo" data-ex="${esc(x.id)}">Excluir</button></div>
    </div>`).join('') || `<div class="card vazio">Nenhuma propriedade ainda.<br><button class="btn prim" id="fz-vazio-p">Cadastrar a primeira</button></div>`;
  $('#fz-vazio-p')?.addEventListener('click', () => formPropriedade());
  $$('#fz-props [data-ver]').forEach((b) => b.addEventListener('click', () => { const c = contorno(propriedade(b.dataset.ver)); if (c) { mapa.fitBounds(c.getBounds(), { padding: [30, 30] }); window.scrollTo({ top: 0, behavior: 'smooth' }); } else toast('Essa propriedade ainda nao tem contorno.'); }));
  $$('#fz-props [data-ed]').forEach((b) => b.addEventListener('click', () => formPropriedade(propriedade(b.dataset.ed))));
  $$('#fz-props [data-ex]').forEach((b) => b.addEventListener('click', () => excluirPropriedade(propriedade(b.dataset.ex), b)));

  $('#fz-est').innerHTML = ests.length ? `<tr><th>Estacao</th><th>Tipo</th><th>Propriedade</th><th>Ultimo dado</th><th class="n">Temp.</th><th></th></tr>` + ests.map((e) => {
    const parado = e.type === 'sensor' && (!e.ultimoDado || Date.now() - e.ultimoDado.toMillis() > 30 * 60e3);
    return `<tr><td><b>${esc(e.name)}</b>${e.active === false ? ' <span class="selo">desligada</span>' : ''}</td>
      <td>${e.type === 'sensor' ? '<span class="selo azul">sensor</span>' : '<span class="selo">virtual</span>'}</td>
      <td>${esc((propriedade(e.propertyId) || {}).name || '–')}</td>
      <td>${parado ? `<span class="selo vermelho">${quando(e.ultimoDado)}</span>` : quando(e.ultimoDado)}</td><td class="n">${n(e.atual && e.atual.temp)}</td>
      <td><div class="linha-acoes" style="justify-content:flex-end"><a class="btn peq" href="#/painel" data-painel="${esc(e.id)}">Painel</a><button class="btn peq" data-ed="${esc(e.id)}">Editar</button>${e.type === 'sensor' ? `<button class="btn peq" data-chave="${esc(e.id)}">Novo login</button>` : ''}<button class="btn peq perigo" data-ex="${esc(e.id)}">Excluir</button></div></td></tr>`;
  }).join('') : `<tr><td class="vazio">Nenhuma estacao. <button class="btn prim peq" id="fz-vazio-e">Criar estacao</button></td></tr>`;
  $('#fz-vazio-e')?.addEventListener('click', () => formEstacao());
  $$('#fz-est [data-painel]').forEach((a) => a.addEventListener('click', () => { try { localStorage.setItem('estacaoPainel', a.dataset.painel); } catch { /* */ } }));
  $$('#fz-est [data-ed]').forEach((b) => b.addEventListener('click', () => formEstacao(ests.find((e) => e.id === b.dataset.ed))));
  $$('#fz-est [data-chave]').forEach((b) => b.addEventListener('click', () => novoLogin(ests.find((e) => e.id === b.dataset.chave), b)));
  $$('#fz-est [data-ex]').forEach((b) => b.addEventListener('click', () => excluirEstacao(ests.find((e) => e.id === b.dataset.ex), b)));
}

// ------------------------------------------------------------------ propriedade
function formPropriedade(x = null) {
  const id = x ? x.id : proximaVaga('p');
  if (!id) { toast(`Seu plano permite ${plano().propriedades} propriedade(s). Fale com o administrador para ampliar.`, true); return; }
  let desenho;
  dialogo(`
    <div class="dlg-cab"><h2>${x ? 'Editar' : 'Nova'} propriedade</h2><button class="btn fantasma peq" data-fechar>${ic('x')}</button></div>
    <form id="pf" class="pilha">
      <div class="form">
        <label>Nome<input id="pf-nome" required maxlength="100" value="${esc(x && x.name)}"></label>
        <label>Cultura<input id="pf-cult" maxlength="60" list="pf-culturas" value="${esc(x && x.crop)}" placeholder="Soja, milho..."><datalist id="pf-culturas">${Object.values(CULTURAS).map((c) => `<option value="${c.nome}">`).join('')}</datalist></label>
        <label>Data de plantio<input type="date" id="pf-plantio" value="${esc(x && x.plantio)}"></label>
        <label>Municipio<input id="pf-cid" maxlength="60" value="${esc(x && x.city)}"></label>
        <label>UF<input id="pf-uf" maxlength="2" value="${esc((x && x.state) || 'MT')}"></label>
        <label class="largo">Observacoes<input id="pf-obs" maxlength="500" value="${esc(x && x.notes)}"></label>
      </div>
      <div class="desenho"><b>Contorno:</b>
        <button type="button" class="btn peq prim" id="dz-ini">Desenhar</button><button type="button" class="btn peq" id="dz-desf">Desfazer</button>
        <button type="button" class="btn peq" id="dz-fim">Concluir</button><button type="button" class="btn peq" id="dz-limpar">Limpar</button>
        <button type="button" class="btn peq" id="dz-colar">Importar GeoJSON/KML</button>
        <span class="suave peq" id="dz-area">Toque nos cantos da area no mapa; duplo toque para fechar.</span></div>
      <textarea id="dz-txt" rows="4" hidden placeholder="Cole o GeoJSON ou KML e clique fora da caixa"></textarea>
      <div id="pf-mapa" class="mapa" style="height:380px"></div>
      <div class="linha-acoes"><button class="btn prim" id="pf-salvar">Salvar</button><button type="button" class="btn" data-fechar>Cancelar</button></div>
    </form>`, (d) => {
    const m = criarMapa($('#pf-mapa', d), { base: 'Satelite', zoom: 6 });
    S.props.filter((p) => !x || p.id !== x.id).forEach((p) => { const c = contorno(p, { cor: '#5aa7ef', popup: false }); if (c) c.addTo(m); });
    desenho = new Desenho(m, (g, ha) => { $('#dz-area', d).textContent = g ? `Area: ${n(ha)} ha · ${g.coordinates[0].length - 1} vertices` : 'Toque nos cantos da area no mapa; duplo toque para fechar.'; });
    ajustar(m);
    setTimeout(() => {
      if (x && x.boundary) desenho.carregar(x.boundary);
      else { const e = minhasEstacoes()[0]; if (e) m.setView([e.lat, e.lon], 14); else if (navigator.geolocation) navigator.geolocation.getCurrentPosition((p) => m.setView([p.coords.latitude, p.coords.longitude], 14), () => {}, { timeout: 8000 }); }
    }, 120);
    $('#dz-ini', d).addEventListener('click', () => desenho.iniciar());
    $('#dz-desf', d).addEventListener('click', () => desenho.desfazer());
    $('#dz-fim', d).addEventListener('click', () => desenho.parar());
    $('#dz-limpar', d).addEventListener('click', () => desenho.limpar());
    $('#dz-colar', d).addEventListener('click', () => { $('#dz-txt', d).hidden = false; $('#dz-txt', d).focus(); });
    $('#dz-txt', d).addEventListener('change', () => { if (desenho.carregar($('#dz-txt', d).value)) toast('Contorno importado.'); else toast('Nao reconheci esse GeoJSON/KML.', true); });
    $('#pf', d).addEventListener('submit', (ev) => {
      ev.preventDefault();
      acao($('#pf-salvar', d), async () => {
        desenho.parar();
        const g = desenho.geojson();
        let boundary = g ? JSON.stringify(g) : null;
        // preserva talhoes de um FeatureCollection importado se o limite nao mudou
        if (x && x.boundary && g) { try { const o = JSON.parse(x.boundary); if (o.type === 'FeatureCollection') { const lim = o.features.find((f) => f.properties && f.properties.tipo === 'limite'); if (lim && JSON.stringify(lim.geometry.coordinates) === JSON.stringify(g.coordinates)) boundary = x.boundary; } } catch { /* */ } }
        const r = boundary ? resumoContorno(boundary) : { areaHa: null, lat: null, lon: null };
        const dados = {
          owner: x ? x.owner : S.user.uid, name: $('#pf-nome', d).value.trim(), crop: $('#pf-cult', d).value.trim() || null, plantio: $('#pf-plantio', d).value || null,
          city: $('#pf-cid', d).value.trim() || null, state: $('#pf-uf', d).value.trim().toUpperCase().slice(0, 2) || null, notes: $('#pf-obs', d).value.trim() || null,
          boundary, areaHa: r.areaHa, lat: r.lat, lon: r.lon, atualizadoEm: serverTimestamp(),
        };
        if (!x) dados.criadoEm = serverTimestamp();
        await setDoc(doc(db, 'properties', id), dados, { merge: true });
        d.close();
        toast(x ? 'Propriedade atualizada.' : `Propriedade criada${r.areaHa ? ` com ${n(r.areaHa)} ha` : ''}.`);
      });
    });
  });
}

async function excluirPropriedade(x, btn) {
  if (!confirm(`Excluir a propriedade "${x.name}"? As estacoes continuam, sem propriedade.`)) return;
  await acao(btn, async () => {
    const b = writeBatch(db);
    minhasEstacoes().filter((e) => e.propertyId === x.id).forEach((e) => b.update(doc(db, 'stations', e.id), { propertyId: null }));
    b.delete(doc(db, 'properties', x.id));
    await b.commit();
    toast('Propriedade excluida.');
  });
}

// ------------------------------------------------------------------ estacao
/** cria o login proprio da estacao de campo num app Firebase separado (nao derruba a sessao do produtor) */
async function criarLoginEstacao() {
  const aux = initializeApp(config, `estacao-${Date.now()}`);
  try {
    const a = getAuth(aux);
    if (EMULADOR) connectAuthEmulator(a, `http://${location.hostname}:9099`, { disableWarnings: true });
    await setPersistence(a, inMemoryPersistence);
    const r = (k) => Array.from(crypto.getRandomValues(new Uint8Array(k)), (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
    const email = `estacao-${r(10)}@estacoes.meteora-agro.app`; const senha = r(24);
    const c = await createUserWithEmailAndPassword(a, email, senha);
    return { uid: c.user.uid, email, senha };
  } finally { await deleteApp(aux); }
}
function mostrarLogin(sid, login) {
  const conf = `# /etc/meteora/edge.conf  (guarde com cuidado: e a senha da estacao)\nMETEORA_PROJETO=${config.projectId}\nMETEORA_API_KEY=${config.apiKey}\nMETEORA_ESTACAO=${sid}\nMETEORA_EMAIL=${login.email}\nMETEORA_SENHA=${login.senha}\n`;
  dialogo(`<div class="dlg-cab"><h2>Login da estacao de campo</h2><button class="btn fantasma peq" data-fechar>${ic('x')}</button></div>
    <div class="segredo"><b>Esta senha aparece so agora.</b> Copie para o Raspberry (arquivo <code>/etc/meteora/edge.conf</code>) ou baixe o arquivo.
    <pre id="lg-conf">${esc(conf)}</pre>
    <div class="linha-acoes"><button class="btn prim" id="lg-copiar">Copiar</button><button class="btn" id="lg-baixar">Baixar edge.conf</button><button class="btn" data-fechar>Ja guardei</button></div></div>
    <p class="suave peq mt">No Raspberry: <code>sudo ./instalar.sh</code> (pasta edge do projeto) e cole este arquivo. A estacao comeca a aparecer em ate 5 minutos.</p>`, (d) => {
    $('#lg-copiar', d).addEventListener('click', async () => { try { await navigator.clipboard.writeText(conf); toast('Copiado.'); } catch { toast('Selecione o texto e copie.', true); } });
    $('#lg-baixar', d).addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([conf], { type: 'text/plain' })); a.download = 'edge.conf'; a.click(); });
  });
}

function formEstacao(e = null) {
  const id = e ? e.id : proximaVaga('e');
  if (!id) { toast(`Seu plano permite ${plano().estacoes} estacao(oes). Fale com o administrador para ampliar.`, true); return; }
  let m; let marc;
  dialogo(`
    <div class="dlg-cab"><h2>${e ? 'Editar' : 'Nova'} estacao</h2><button class="btn fantasma peq" data-fechar>${ic('x')}</button></div>
    <form id="ef" class="pilha">
      <div class="form">
        <label>Nome<input id="ef-nome" required maxlength="100" value="${esc(e && e.name)}" placeholder="Sede, Talhao 3..."></label>
        <label>Tipo<select id="ef-tipo">
          <option value="virtual"${e && e.type === 'virtual' ? ' selected' : ''}>Virtual (modelo no ponto, sem equipamento)</option>
          <option value="sensor"${e && e.type === 'sensor' ? ' selected' : ''}>Sensor proprio (Raspberry + Meteora Edge)</option></select></label>
        <label>Propriedade<select id="ef-prop"><option value="">(nenhuma)</option>${S.props.filter((p) => admin() || p.owner === S.user.uid).map((p) => `<option value="${esc(p.id)}"${e && e.propertyId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
        <label>Latitude<input id="ef-lat" type="number" step="any" required value="${e ? e.lat : ''}"></label>
        <label>Longitude<input id="ef-lon" type="number" step="any" required value="${e ? e.lon : ''}"></label>
        <label>Altitude (m)<input id="ef-alt" type="number" step="1" value="${e ? e.elevation ?? '' : ''}" placeholder="automatica"></label>
        ${e ? `<label class="linha"><input type="checkbox" id="ef-ativa"${e.active !== false ? ' checked' : ''}> Estacao ativa</label>` : ''}
      </div>
      <p class="suave peq">Toque no mapa para posicionar a estacao.</p>
      <div id="ef-mapa" class="mapa" style="height:320px"></div>
      <div class="linha-acoes"><button class="btn prim" id="ef-salvar">Salvar</button><button type="button" class="btn" data-fechar>Cancelar</button></div>
    </form>`, (d) => {
    m = criarMapa($('#ef-mapa', d), { base: 'Satelite', zoom: 6 });
    S.props.forEach((p) => { const c = contorno(p, { popup: false }); if (c) c.addTo(m); });
    const marcar = async (la, lo, auto) => {
      if (marc) marc.remove();
      marc = marcador([la, lo]).addTo(m);
      if (auto) { $('#ef-lat', d).value = la.toFixed(5); $('#ef-lon', d).value = lo.toFixed(5); const alt = await altitude(la, lo); if (alt != null) $('#ef-alt', d).value = alt; }
    };
    m.on('click', (ev) => marcar(ev.latlng.lat, ev.latlng.lng, true));
    $('#ef-prop', d).addEventListener('change', () => { const p = propriedade($('#ef-prop', d).value); if (p && p.lat != null) { m.setView([p.lat, p.lon], 14); if (!$('#ef-lat', d).value) marcar(p.lat, p.lon, true); } });
    ajustar(m);
    setTimeout(() => {
      if (e) { marcar(e.lat, e.lon); m.setView([e.lat, e.lon], 14); return; }
      const p = S.props.find((x) => x.lat != null);
      if (p) { m.setView([p.lat, p.lon], 14); $('#ef-prop', d).value = p.id; }
    }, 120);
    $('#ef', d).addEventListener('submit', (ev) => {
      ev.preventDefault();
      acao($('#ef-salvar', d), async () => {
        const lat = +$('#ef-lat', d).value; const lon = +$('#ef-lon', d).value;
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new Error('Latitude/longitude invalidas.');
        let alt = $('#ef-alt', d).value === '' ? await altitude(lat, lon) : +$('#ef-alt', d).value;
        if (!Number.isFinite(alt)) alt = 0;
        const tipo = $('#ef-tipo', d).value;
        const dados = { name: $('#ef-nome', d).value.trim(), lat, lon, elevation: alt, propertyId: $('#ef-prop', d).value || null };
        let login = null;
        if (e) {
          dados.active = $('#ef-ativa', d).checked;
          if (!e.public) dados.type = tipo;
          if (tipo === 'sensor' && !e.deviceUid) { login = await criarLoginEstacao(); dados.deviceUid = login.uid; dados.deviceEmail = login.email; }
          await updateDoc(doc(db, 'stations', id), dados);
        } else {
          if (tipo === 'sensor') login = await criarLoginEstacao();
          await setDoc(doc(db, 'stations', id), {
            ...dados, owner: S.user.uid, type: tipo, public: false, active: true, inmetCode: null,
            deviceUid: login ? login.uid : null, deviceEmail: login ? login.email : null, criadoEm: serverTimestamp(),
          });
        }
        d.close();
        if (login) mostrarLogin(id, login);
        else toast(e ? 'Estacao atualizada.' : 'Estacao criada. Os dados (com 30 dias de historico) chegam na proxima atualizacao horaria.');
      });
    });
  });
}

async function novoLogin(e, btn) {
  if (!confirm('Criar um novo login para esta estacao? O login antigo para de funcionar.')) return;
  await acao(btn, async () => {
    const login = await criarLoginEstacao();
    await updateDoc(doc(db, 'stations', e.id), { deviceUid: login.uid, deviceEmail: login.email });
    mostrarLogin(e.id, login);
  });
}

async function excluirEstacao(e, btn) {
  if (!confirm(`Excluir "${e.name}" e todo o historico dela? Nao da para desfazer.`)) return;
  await acao(btn, async () => {
    const dias = await getDocs(collection(db, 'stations', e.id, 'dias'));
    for (let i = 0; i < dias.docs.length; i += 400) { const b = writeBatch(db); dias.docs.slice(i, i + 400).forEach((x) => b.delete(x.ref)); await b.commit(); }
    await deleteDoc(doc(db, 'stations', e.id));
    toast('Estacao excluida.');
  });
}
