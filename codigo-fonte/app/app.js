// Meteora Agro - casca do app: login, navegacao e rotas
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, updateProfile } from './firebase.js';
import { rota as estadoRota, ir, pedirLogin, trocarAba } from './nav.js';
import { auth, EMULADOR } from './fb.js';
import { S, ao, pronto, logado, ativo, admin, criarPerfil } from './dados.js';
import { $, $$, ic, mensagemErro, toast } from './ui.js';

// tema salvo (claro/escuro/automatico)
try { const t = localStorage.getItem('tema'); if (t) document.documentElement.dataset.tema = t; } catch { /* sem armazenamento */ }

// ------------------------------------------------------------------ rotas
const ROTAS = [
  { r: '/', nome: 'Inicio', ic: 'casa', mod: 'inicio', pub: true, inf: true },
  { r: '/mapa', nome: 'Mapa', ic: 'mapa', mod: 'mapa', pub: true, inf: true },
  { r: '/previsao', nome: 'Previsao', ic: 'nuvem', mod: 'previsao', pub: true, inf: true },
  { r: '/painel', nome: 'Painel', ic: 'painel', mod: 'painel', inf: true, motivo: 'Para ver o painel da sua fazenda' },
  { r: '/historico', nome: 'Historico', ic: 'relogio', mod: 'historico', motivo: 'Para consultar o historico' },
  { r: '/irrigacao', nome: 'Irrigacao', ic: 'gota', mod: 'irrigacao', motivo: 'Para calcular a irrigacao da sua cultura' },
  { r: '/relatorio', nome: 'Relatorio', ic: 'doc', mod: 'relatorio', motivo: 'Para gerar o relatorio da semana' },
  { r: '/fazenda', nome: 'Fazenda', ic: 'folha', mod: 'fazenda', motivo: 'Para cadastrar sua propriedade' },
  { r: '/admin', nome: 'Admin', ic: 'escudo', mod: 'admin', adm: true },
  { r: '/conta', nome: 'Mais', ic: 'mais', mod: 'conta', pub: true, oculto: true },
  { r: '/aguardando', nome: 'Aguardando', mod: 'aguardando', oculto: true },
];
const modulos = {};
const PAGINAS = {
  inicio: () => import('./paginas/inicio.js'), mapa: () => import('./paginas/mapa.js'), previsao: () => import('./paginas/previsao.js'),
  painel: () => import('./paginas/painel.js'), historico: () => import('./paginas/historico.js'), irrigacao: () => import('./paginas/irrigacao.js'),
  relatorio: () => import('./paginas/relatorio.js'), fazenda: () => import('./paginas/fazenda.js'), admin: () => import('./paginas/admin.js'),
  conta: () => import('./paginas/conta.js'), aguardando: () => import('./paginas/aguardando.js'),
};
let atual = null;

function montarMenus() {
  const vis = ROTAS.filter((x) => !x.oculto && (!x.adm || admin()));
  $('#nav').innerHTML = vis.map((x) => `<a href="#${x.r}" data-r="${x.r}">${x.nome}${!x.pub && !ativo() ? ic('cadeado', 'i cad') : ''}</a>`).join('');
  $('#barra-inf').innerHTML = [...ROTAS.filter((x) => x.inf), ROTAS.find((x) => x.r === '/conta')]
    .map((x) => `<a href="#${x.r}" data-r="${x.r}">${ic(x.ic)}<span>${x.nome}</span></a>`).join('');
  marcarAtivo();
}
function marcarAtivo() {
  $$('[data-r]').forEach((a) => a.classList.toggle('ativo', a.dataset.r === atual || (atual && atual !== '/' && a.dataset.r === '/conta' && !ROTAS.find((x) => x.r === atual).inf && window.innerWidth <= 860)));
}


async function rotear() {
  const caminho = (location.hash.slice(1) || '/').split('?')[0];
  let rota = ROTAS.find((x) => x.r === caminho) || ROTAS[0];
  if (!rota.pub) {
    if (!logado()) { pedirLogin(rota.motivo || 'Area restrita'); if (atual) { history.replaceState(null, '', '#' + atual); return; } rota = ROTAS[0]; }
    else if (!ativo() && rota.r !== '/aguardando') { ir('/aguardando'); return; }
    else if (rota.adm && !admin()) rota = ROTAS.find((x) => x.r === '/painel');
  }
  if (rota.r === '/aguardando' && ativo()) { ir('/painel'); return; }
  atual = rota.r; estadoRota.atual = atual;
  $$('.pagina').forEach((s) => s.classList.toggle('ativa', s.dataset.pagina === rota.r));
  marcarAtivo();
  window.scrollTo(0, 0);
  try {
    const m = modulos[rota.mod] ||= await PAGINAS[rota.mod]();
    await m.abrir($(`.pagina[data-pagina="${rota.r}"]`));
  } catch (e) { console.error(e); toast(mensagemErro(e), true); }
}
window.addEventListener('hashchange', rotear);

// ------------------------------------------------------------------ login e cadastro
const dlg = $('#dlg-auth');
$$('.abas button', dlg).forEach((b) => b.addEventListener('click', () => trocarAba(b.dataset.aba)));
$$('[data-fechar]', dlg).forEach((b) => b.addEventListener('click', () => dlg.close()));
$('#btn-entrar').addEventListener('click', () => pedirLogin());
$('#btn-conta').addEventListener('click', () => ir('/conta'));
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-login]');
  if (!el) return;
  ev.preventDefault();
  if (logado()) { ir(el.dataset.destino || '/painel'); return; }
  pedirLogin(el.dataset.login, el.dataset.aba || 'entrar');
});

$('#f-entrar').addEventListener('submit', async (ev) => {
  ev.preventDefault(); $('#en-erro').textContent = '';
  try {
    await signInWithEmailAndPassword(auth, $('#en-email').value.trim(), $('#en-senha').value);
    dlg.close();
    if (!atual || atual === '/') ir('/painel'); else rotear();
  } catch (e) { $('#en-erro').textContent = mensagemErro(e); }
});
$('#en-esqueci').addEventListener('click', async (ev) => {
  ev.preventDefault();
  const email = $('#en-email').value.trim();
  if (!email) { $('#en-erro').textContent = 'Digite seu e-mail acima.'; return; }
  try { await sendPasswordResetEmail(auth, email); toast('Enviamos um link para criar uma nova senha.'); } catch (e) { $('#en-erro').textContent = mensagemErro(e); }
});
$('#f-criar').addEventListener('submit', async (ev) => {
  ev.preventDefault(); $('#cr-erro').textContent = '';
  try {
    const nome = $('#cr-nome').value.trim();
    const { user } = await createUserWithEmailAndPassword(auth, $('#cr-email').value.trim(), $('#cr-senha').value);
    await Promise.all([criarPerfil(user, nome), updateProfile(user, { displayName: nome })]);
    dlg.close();
    ir('/aguardando');
  } catch (e) { $('#cr-erro').textContent = mensagemErro(e); }
});

// ------------------------------------------------------------------ reacoes ao estado
function cabecalho() {
  $('#btn-entrar').hidden = logado();
  $('#btn-conta').hidden = !logado();
  if (logado()) $('#btn-conta').textContent = ((S.perfil && S.perfil.name) || S.user.email || '?').trim()[0].toUpperCase();
  montarMenus();
}
let chaveAnterior = '';
ao('perfil', () => {
  cabecalho();
  const chave = `${S.user && S.user.uid}|${S.perfil && S.perfil.status}|${S.perfil && S.perfil.role}`;
  if (chave !== chaveAnterior) {
    if (chaveAnterior && S.perfil && S.perfil.status === 'active' && atual === '/aguardando') toast('Cadastro aprovado! Bem-vindo.');
    chaveAnterior = chave;
    if (S.pronto) rotear();
  }
});

// ------------------------------------------------------------------ inicio
await pronto;
S.pronto = true;
if (EMULADOR) document.title += ' · emulador';
cabecalho();
$('#abertura').remove();
await rotear();
if ('serviceWorker' in navigator && !EMULADOR && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
