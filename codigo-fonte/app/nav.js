// Navegacao compartilhada pelas paginas (sem await no topo, para nao travar imports)
import { signOut } from './firebase.js';
import { auth } from './fb.js';
import { $, $$, toast } from './ui.js';

export const rota = { atual: null };
export const ir = (r) => { location.hash = '#' + r; };

export function trocarAba(aba) {
  const dlg = $('#dlg-auth');
  $$('.abas button', dlg).forEach((b) => b.classList.toggle('on', b.dataset.aba === aba));
  $('#f-entrar').hidden = aba !== 'entrar';
  $('#f-criar').hidden = aba !== 'criar';
}
export function pedirLogin(motivo = '', aba = 'entrar') {
  const dlg = $('#dlg-auth');
  $('#auth-motivo').hidden = !motivo;
  $('#auth-motivo').textContent = motivo ? `${motivo}, entre ou crie sua conta gratis.` : '';
  trocarAba(aba);
  if (!dlg.open) dlg.showModal();
}
export async function sair() { await signOut(auth); ir('/'); toast('Voce saiu da conta.'); }
