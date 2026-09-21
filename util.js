export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ar = s => String(s ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
export const num = v => { const n = parseFloat(ar(v)); return isNaN(n) ? 0 : n; };
export const digits = s => ar(s).replace(/\D/g, '');
export const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
export const money = n => round(n).toLocaleString('en-US', {minimumFractionDigits: 2});
export const today = () => new Date().toISOString().slice(0, 10);
export const fd = d => { const x = new Date(d); return isNaN(x) ? '-' : x.toLocaleDateString('ar-EG'); };
export function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.textContent = msg; if (type === 'err') el.className = 'err';
  $('#toasts').append(el); setTimeout(() => el.remove(), 2800);
}
