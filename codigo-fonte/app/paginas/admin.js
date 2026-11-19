// Administracao: aprovacao de usuarios, planos, rede publica e estado do job horario
import { doc, getDoc, getDocs, setDoc, updateDoc, collection, serverTimestamp } from '../firebase.js';
import { db } from '../fb.js';
import { S, ao } from '../dados.js';
import { $, $$, esc, ic, n, quando, toast, acao, dialogo } from '../ui.js';
import { PLANOS } from '../ciencia.js';
import { altitude } from '../meteo.js';
import { rota } from '../nav.js';

// estacoes automaticas do INMET em Mato Grosso (codigo, nome, lat, lon, altitude)
const INMET_MT = [['A901', 'Cuiaba', -15.6069, -56.0608, 184], ['A917', 'Sinop', -11.9822, -55.5661, 367], ['A904', 'Sorriso', -12.555, -55.7227, 379],
  ['A955', 'Lucas do Rio Verde', -13.0749, -55.9113, 393], ['A912', 'Campo Verde', -15.5588, -55.1794, 747], ['A923', 'Primavera do Leste', -15.5799, -54.3811, 680],
  ['A907', 'Rondonopolis', -16.4625, -54.5802, 290], ['A902', 'Tangara da Serra', -14.65, -57.4316, 440], ['A911', 'Sapezal', -13.3038, -58.7633, 105], ['A916', 'Querencia', -12.603, -52.1625, 355]];

let el; let usuarios = [];
export async function abrir(secao) {
  if (!el) {
    el = secao;
    el.innerHTML = `
      <div class="cab"><div><h1>Administracao</h1><p>Cadastros, planos, rede publica e saude do sistema.</p></div></div>
      <div class="grade g3" id="ad-num"></div>
      <div class="card mt"><div class="cab" style="margin-bottom:8px"><h3>${ic('usuario')}Usuarios</h3>
        <select id="ad-filtro" style="width:auto"><option value="pending">Aguardando aprovacao</option><option value="active">Ativos</option><option value="suspended">Suspensos</option><option value="">Todos</option></select></div>
        <div class="rolagem"><table id="ad-us"></table></div></div>
      <div class="grade g2 mt">
        <div class="card"><h3>${ic('sinal')}Rede publica</h3><div id="ad-pub"></div>
          <div class="linha-acoes mt"><button class="btn prim peq" id="ad-nova">+ Estacao publica</button><button class="btn peq" id="ad-mt">Adicionar 10 estacoes INMET de MT</button></div></div>
        <div class="card"><h3>${ic('relogio')}Atualizacao automatica</h3><div id="ad-status"></div></div>
      </div>`;
    $('#ad-filtro').addEventListener('change', tabela);
    $('#ad-nova').addEventListener('click', () => formPublica());
    $('#ad-mt').addEventListener('click', () => acao($('#ad-mt'), semearMT));
    ao('estacoes', () => rota.atual === '/admin' && publica());
  }
  await carregar();
}

async function carregar() {
  const [us, st] = await Promise.all([getDocs(collection(db, 'users')), getDoc(doc(db, 'sistema', 'status'))]);
  usuarios = us.docs.map((d) => ({ uid: d.id, ...d.data() })).sort((a, b) => ((b.criadoEm && b.criadoEm.toMillis()) || 0) - ((a.criadoEm && a.criadoEm.toMillis()) || 0));
  const pend = usuarios.filter((u) => u.status === 'pending').length;
  if (!pend && $('#ad-filtro').value === 'pending') $('#ad-filtro').value = 'active';
  $('#ad-num').innerHTML = [['Usuarios', usuarios.length, `${pend} aguardando aprovacao`], ['Estacoes', S.todas.length, `${S.todas.filter((e) => e.public).length} publicas · ${S.todas.filter((e) => e.type === 'sensor').length} sensores`], ['Propriedades', S.props.length, `${n(S.props.reduce((s, p) => s + (p.areaHa || 0), 0), 0)} ha mapeados`]]
    .map(([r, v, s]) => `<div class="card"><div class="suave">${r}</div><div class="grande-num num">${v}</div><div class="suave peq">${s}</div></div>`).join('');
  tabela(); publica();
  const s = st.exists() ? st.data() : null;
  $('#ad-status').innerHTML = s ? `
    <p>Ultima execucao <b>${quando(s.em)}</b> (${s.horaLocal ? s.horaLocal.replace('T', ' ') + 'h' : ''}) · ${s.estacoes} estacoes em ${n(s.duracaoS, 0)} s.</p>
    ${s.em && Date.now() - s.em.toMillis() > 2.5 * 3600e3 ? '<div class="aviso alto mt"><div><b>O job horario esta atrasado</b>Confira a aba Actions do repositorio no GitHub (workflow "Dados").</div></div>' : ''}
    ${(s.falhas || []).map((f) => `<div class="aviso alto mt"><div>${esc(f)}</div></div>`).join('')}
    ${(s.sensoresParados || []).map((x) => `<div class="aviso mt"><div><b>${esc(x.nome)}</b>sensor sem dados ${quando(x.ultimo)}</div></div>`).join('')}
    ${!(s.falhas || []).length && !(s.sensoresParados || []).length ? '<div class="aviso ok mt"><div><b>Tudo funcionando</b>Sem falhas na ultima atualizacao.</div></div>' : ''}`
    : '<div class="aviso info"><div><b>O job ainda nao rodou</b>Depois de configurar o GitHub, rode o workflow "Dados" em Actions (ou espere a proxima hora).</div></div>';
}

function tabela() {
  const f = $('#ad-filtro').value;
  const l = usuarios.filter((u) => !f || u.status === f);
  const selo = { pending: 'ambar', active: 'verde', suspended: 'vermelho' };
  const nomeSit = { pending: 'aguardando', active: 'ativo', suspended: 'suspenso' };
  $('#ad-us').innerHTML = l.length ? `<tr><th>Nome</th><th>E-mail</th><th>Situacao</th><th>Plano</th><th>Desde</th><th></th></tr>` + l.map((u) => `
    <tr><td><b>${esc(u.name)}</b>${u.role === 'admin' ? ' <span class="selo vermelho">admin</span>' : ''}</td><td>${esc(u.email)}</td>
    <td><span class="selo ${selo[u.status] || ''}">${nomeSit[u.status] || esc(u.status)}</span></td>
    <td><select data-plano="${esc(u.uid)}" style="width:auto">${Object.entries(PLANOS).map(([k, p]) => `<option value="${k}"${u.plan === k ? ' selected' : ''}>${p.nome}</option>`).join('')}</select></td>
    <td class="suave">${u.criadoEm ? u.criadoEm.toDate().toLocaleDateString('pt-BR') : ''}</td>
    <td><div class="linha-acoes" style="justify-content:flex-end">
      ${u.status !== 'active' ? `<button class="btn prim peq" data-st="active" data-uid="${esc(u.uid)}">Aprovar</button>` : ''}
      ${u.status !== 'suspended' && u.uid !== S.user.uid ? `<button class="btn peq perigo" data-st="suspended" data-uid="${esc(u.uid)}">Suspender</button>` : ''}
      ${u.uid !== S.user.uid ? `<button class="btn peq" data-role="${u.role === 'admin' ? 'client' : 'admin'}" data-uid="${esc(u.uid)}">${u.role === 'admin' ? 'Tirar admin' : 'Tornar admin'}</button>` : ''}
    </div></td></tr>`).join('') : '<tr><td class="vazio">Ninguem nesta situacao.</td></tr>';
  const salvar = (b, uid, dados) => acao(b, async () => { await updateDoc(doc(db, 'users', uid), { ...dados, atualizadoEm: serverTimestamp() }); toast('Usuario atualizado.'); await carregar(); });
  $$('#ad-us [data-st]').forEach((b) => b.addEventListener('click', () => salvar(b, b.dataset.uid, { status: b.dataset.st })));
  $$('#ad-us [data-role]').forEach((b) => b.addEventListener('click', () => { if (confirm('Alterar o papel deste usuario?')) salvar(b, b.dataset.uid, { role: b.dataset.role }); }));
  $$('#ad-us [data-plano]').forEach((s) => s.addEventListener('change', () => salvar(null, s.dataset.plano, { plan: s.value })));
}

function publica() {
  const pub = S.todas.filter((e) => e.public).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  $('#ad-pub').innerHTML = pub.length ? `<table>${pub.map((e) => `<tr><td><b>${esc(e.name)}</b> ${e.inmetCode ? `<span class="selo ambar">${esc(e.inmetCode)}</span>` : ''}${e.active === false ? ' <span class="selo">desligada</span>' : ''}</td>
    <td class="suave">${quando(e.ultimoDado)}</td><td><button class="btn peq" data-ed="${esc(e.id)}">Editar</button></td></tr>`).join('')}</table>` : '<p class="suave">Nenhuma estacao publica. Use o botao abaixo para comecar com as 10 estacoes INMET de Mato Grosso.</p>';
  $$('#ad-pub [data-ed]').forEach((b) => b.addEventListener('click', () => formPublica(S.todas.find((e) => e.id === b.dataset.ed))));
}

async function semearMT() {
  const existentes = new Set(S.todas.map((e) => e.id));
  let novas = 0;
  for (const [cod, nome, lat, lon, alt] of INMET_MT) {
    const id = `pub_${cod.toLowerCase()}`;
    if (existentes.has(id)) continue;
    await setDoc(doc(db, 'stations', id), { owner: null, name: nome, type: 'publica', public: true, active: true, lat, lon, elevation: alt, propertyId: null, inmetCode: cod, deviceUid: null, deviceEmail: null, criadoEm: serverTimestamp() });
    novas++;
  }
  toast(novas ? `${novas} estacoes adicionadas. Os dados chegam na proxima atualizacao horaria.` : 'As 10 estacoes ja estavam cadastradas.');
}

function formPublica(e = null) {
  dialogo(`<div class="dlg-cab"><h2>${e ? 'Editar' : 'Nova'} estacao publica</h2><button class="btn fantasma peq" data-fechar>${ic('x')}</button></div>
    <form id="pp" class="pilha"><div class="form">
      <label>Nome<input id="pp-nome" required maxlength="100" value="${esc(e && e.name)}"></label>
      <label>Codigo INMET (opcional)<input id="pp-cod" maxlength="8" value="${esc(e && e.inmetCode)}" placeholder="A901" ${e ? 'disabled' : ''}></label>
      <label>Latitude<input id="pp-lat" type="number" step="any" required value="${e ? e.lat : ''}"></label>
      <label>Longitude<input id="pp-lon" type="number" step="any" required value="${e ? e.lon : ''}"></label>
      <label>Altitude (m)<input id="pp-alt" type="number" value="${e ? e.elevation ?? '' : ''}" placeholder="automatica"></label>
      ${e ? `<label class="linha"><input type="checkbox" id="pp-ativa"${e.active !== false ? ' checked' : ''}> Ativa</label><label class="linha"><input type="checkbox" id="pp-pub"${e.public ? ' checked' : ''}> Aparece no portal</label>` : ''}
    </div><div class="linha-acoes"><button class="btn prim" id="pp-ok">Salvar</button><button type="button" class="btn" data-fechar>Cancelar</button></div></form>`, (d) => {
    $('#pp', d).addEventListener('submit', (ev) => {
      ev.preventDefault();
      acao($('#pp-ok', d), async () => {
        const lat = +$('#pp-lat', d).value; const lon = +$('#pp-lon', d).value;
        const alt = $('#pp-alt', d).value === '' ? ((await altitude(lat, lon)) ?? 0) : +$('#pp-alt', d).value;
        const base = { name: $('#pp-nome', d).value.trim(), lat, lon, elevation: alt };
        if (e) await updateDoc(doc(db, 'stations', e.id), { ...base, active: $('#pp-ativa', d).checked, public: $('#pp-pub', d).checked });
        else {
          const cod = $('#pp-cod', d).value.trim().toUpperCase() || null;
          const id = `pub_${(cod || base.name).toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '_').slice(0, 40)}`;
          await setDoc(doc(db, 'stations', id), { ...base, owner: null, type: 'publica', public: true, active: true, propertyId: null, inmetCode: cod, deviceUid: null, deviceEmail: null, criadoEm: serverTimestamp() });
        }
        d.close(); toast('Estacao salva.');
      });
    });
  });
}
