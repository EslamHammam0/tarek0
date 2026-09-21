import { firebaseConfig } from './config.js';
import { $, $$, esc, num, digits, round, money, today, fd, toast } from './util.js';

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth(), db = firebase.database();
const S = { clients: {}, orders: {}, payments: {}, prices: {}, filter: 'debt', q: '', cid: null };
const METHODS = ['كاش', 'فودافون كاش', 'إنستاباي', 'تحويل بنكي'];
const dlg = $('#dlg');
let offs = [];

/* ---------- بيانات ---------- */
const list = o => Object.entries(o).filter(([, v]) => !v.deleted).map(([id, v]) => ({ id, ...v }));
const ordersOf = c => list(S.orders).filter(o => o.clientId === c);
const paysOf = c => list(S.payments).filter(p => p.clientId === c);
const log = (a, d) => db.ref('log').push({ t: Date.now(), u: auth.currentUser?.email || '', a, d: d || '' });

// الرصيد = مجموع الفواتير - مجموع التحصيلات. عمر الدين بطريقة الأقدم أولاً (FIFO).
function stat(cid) {
  const os = ordersOf(cid).sort((a, b) => (a.date < b.date ? -1 : 1));
  const billed = os.reduce((s, o) => s + num(o.total), 0);
  const paid = paysOf(cid).reduce((s, p) => s + num(p.amount), 0);
  let pool = paid, oldest = null;
  for (const o of os) { const t = num(o.total); if (pool >= t) pool -= t; else { oldest = o.date; break; } }
  const age = oldest && billed > paid ? Math.floor((Date.now() - new Date(oldest)) / 864e5) : null;
  return { billed, paid, bal: round(billed - paid), age };
}

function live(path, key) {
  const r = db.ref(path);
  r.on('value', s => { S[key] = s.val() || {}; render(); if (dlg.open && dlg.dataset.v === 'st') showStatement(S.cid); },
    e => toast(e.message, 'err'));
  offs.push(() => r.off());
}

/* ---------- الشاشة الرئيسية ---------- */
function render() {
  const all = list(S.clients).map(c => ({ c, s: stat(c.id) }));
  const q = S.q.toLowerCase();
  const rows = all.filter(({ c, s }) =>
    (S.filter !== 'office' || c.clientType === 'مكتب') &&
    (S.filter !== 'debt' || s.bal > 0.005) &&
    (!q || (c.name + ' ' + c.phone).toLowerCase().includes(q))
  ).sort((a, b) => b.s.bal - a.s.bal);
  const T = all.reduce((t, { s }) => ({ b: t.b + s.billed, p: t.p + s.paid, late: t.late + (s.age > 15 && s.bal > 0 ? 1 : 0) }), { b: 0, p: 0, late: 0 });
  $('#stats').innerHTML = `<div>الفواتير<b>${money(T.b)}</b></div><div>المحصّل<b>${money(T.p)}</b></div>
    <div>المتبقي<b>${money(T.b - T.p)}</b></div><div>متأخرون +15 يوم<b class="${T.late ? 'neg' : ''}">${T.late}</b></div>`;
  $('#clients tbody').innerHTML = rows.map(({ c, s }) => `<tr>
    <td>${esc(c.name)}</td><td>${esc(c.phone)}</td><td>${esc(c.clientType)}</td><td>${money(s.billed)}</td>
    <td class="${s.bal > 0 ? 'neg' : ''}">${money(s.bal)}</td><td class="${s.age > 15 ? 'neg' : ''}">${s.age == null ? '-' : s.age + ' يوم'}</td>
    <td><button data-a="open" data-id="${c.id}">كشف الحساب</button><button class="ghost" data-a="editc" data-id="${c.id}">تعديل</button><button class="ghost" data-a="delc" data-id="${c.id}">حذف</button></td></tr>`
  ).join('') || '<tr><td colspan="7">لا توجد نتائج. أضف عميلاً أو غيّر الفلتر.</td></tr>';
}

/* ---------- النوافذ ---------- */
function openDlg(html, v = '') { dlg.innerHTML = html; dlg.dataset.v = v; if (!dlg.open) dlg.showModal(); }
const closeBtn = '<button class="ghost noprint" data-a="close">إغلاق</button>';

function clientForm(id) {
  const c = id ? S.clients[id] : {};
  openDlg(`<h3>${id ? 'تعديل عميل' : 'إضافة عميل'}</h3>
    <input id="f_n" placeholder="اسم العميل" value="${esc(c.name)}">
    <input id="f_p" placeholder="رقم الهاتف (11 رقماً)" inputmode="tel" value="${esc(c.phone)}">
    <select id="f_t"><option ${c.clientType === 'فرد' ? '' : 'selected'}>مكتب</option><option ${c.clientType === 'فرد' ? 'selected' : ''}>فرد</option></select>
    <div class="row"><button data-a="savec" data-id="${id || ''}">حفظ العميل</button>${closeBtn}</div>`, 'f');
}

function showStatement(id) {
  const c = S.clients[id]; if (!c) return;
  S.cid = id;
  const rec = [...ordersOf(id).map(o => ({ k: 'o', d: o.date, o })), ...paysOf(id).map(p => ({ k: 'p', d: p.date, p }))]
    .sort((a, b) => (a.d < b.d ? -1 : 1));
  let bal = 0;
  const rows = rec.map(r => {
    if (r.k === 'o') {
      bal += num(r.o.total);
      const det = (r.o.items || []).map(i => `${esc(i.desc)}${i.l ? ` ${i.l}×${i.w}م` : ''} ×${i.qty}`).join('، ');
      return `<tr><td>${fd(r.d)}</td><td>فاتورة #${r.o.no || ''}<br><small>${det}${r.o.discount ? ` (خصم ${money(r.o.discount)})` : ''}</small></td>
        <td>${money(r.o.total)}</td><td>-</td><td>${money(bal)}</td>
        <td class="noprint"><button class="ghost" data-a="delrec" data-t="orders" data-id="${r.o.id}">حذف</button></td></tr>`;
    }
    bal -= num(r.p.amount);
    return `<tr class="in"><td>${fd(r.d)}</td><td>تحصيل (${esc(r.p.method || 'كاش')})<br><small>${esc(r.p.note)}</small></td>
      <td>-</td><td>${money(r.p.amount)}</td><td>${money(bal)}</td>
      <td class="noprint"><button class="ghost" data-a="delrec" data-t="payments" data-id="${r.p.id}">حذف</button></td></tr>`;
  }).join('') || '<tr><td colspan="6">لا توجد حركات بعد. أنشئ أول فاتورة.</td></tr>';
  openDlg(`<h3>كشف حساب: ${esc(c.name)} — ${esc(c.phone)}</h3>
    <div class="row noprint"><button data-a="newinv">+ فاتورة</button><button data-a="newpay">تحصيل</button>
    <button data-a="print" class="ghost">طباعة</button><button data-a="wa" class="ghost">واتساب</button>${closeBtn}</div>
    <div class="scroll"><table><thead><tr><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الرصيد</th><th class="noprint"></th></tr></thead><tbody>${rows}</tbody></table></div>
    <h3>المتبقي: <span class="${bal > 0 ? 'neg' : ''}">${money(bal)}</span> جنيه</h3>
    <small>مطبعة طارق أبوهمام — للتواصل: 01008110848</small>`, 'st');
}

/* ---------- فاتورة متعددة البنود ---------- */
const itemRow = () => `<div class="item"><select class="i_m"><option value="">الخامة…</option>${list(S.prices).map(p => `<option value="${esc(p.price)}">${esc(p.name)}</option>`).join('')}</select>
  <input class="i_d" placeholder="الوصف"><input class="i_l" placeholder="طول م" inputmode="decimal"><input class="i_w" placeholder="عرض م" inputmode="decimal">
  <input class="i_q" placeholder="العدد" value="1" inputmode="numeric"><input class="i_p" placeholder="السعر" inputmode="decimal"><b class="i_t">0.00</b>
  <button class="ghost" data-a="delrow">✖</button></div>`;

function invForm() {
  openDlg(`<h3>فاتورة جديدة — ${esc(S.clients[S.cid].name)}</h3><small>اترك الطول والعرض فارغين للبنود بالقطعة (سعر × عدد)</small>
    <div id="items">${itemRow()}</div><button class="ghost" data-a="addrow">+ بند</button>
    <div class="row"><input id="i_d" placeholder="خصم (جنيه)" inputmode="decimal" style="width:30%"><input id="i_dep" placeholder="عربون مدفوع" inputmode="decimal" style="width:30%">
    <select id="i_pm" style="width:30%">${METHODS.map(m => `<option>${m}</option>`).join('')}</select></div>
    <h3>الإجمالي: <span id="i_sum">0.00</span> جنيه</h3>
    <div class="row"><button data-a="saveinv">حفظ الفاتورة</button><button class="ghost" data-a="back">رجوع</button></div>`, 'inv');
}

function calc() {
  let sub = 0;
  $$('.item').forEach(r => {
    const l = num($('.i_l', r).value), w = num($('.i_w', r).value);
    const t = round((l && w ? l * w : 1) * num($('.i_q', r).value) * num($('.i_p', r).value));
    $('.i_t', r).textContent = money(t); r.dataset.t = t; sub += t;
  });
  const disc = num($('#i_d').value), total = Math.max(0, round(sub - disc));
  $('#i_sum').textContent = money(total);
  return { sub: round(sub), disc, total };
}

async function saveInv() {
  const { sub, disc, total } = calc();
  const items = $$('.item').map(r => ({
    desc: $('.i_d', r).value.trim(), l: num($('.i_l', r).value) || null, w: num($('.i_w', r).value) || null,
    qty: num($('.i_q', r).value), price: num($('.i_p', r).value), total: num(r.dataset.t)
  })).filter(i => i.desc && i.total > 0);
  if (!items.length) return toast('أضف بنداً واحداً على الأقل بوصف وسعر', 'err');
  const dep = num($('#i_dep').value);
  const no = (await db.ref('meta/invoiceNo').transaction(n => (n || 1000) + 1)).snapshot.val();
  await db.ref('orders').push({ no, clientId: S.cid, date: today(), items, subtotal: sub, discount: disc, total, createdAt: Date.now() });
  if (dep > 0) await db.ref('payments').push({ clientId: S.cid, amount: dep, method: $('#i_pm').value, date: today(), note: 'عربون فاتورة #' + no });
  log('فاتورة #' + no, S.clients[S.cid].name + ' - ' + money(total));
  toast('تم حفظ الفاتورة #' + no); showStatement(S.cid);
}

/* ---------- التحصيل والأسعار ---------- */
function payForm() {
  openDlg(`<h3>تحصيل من ${esc(S.clients[S.cid].name)}</h3>
    <input id="p_a" placeholder="المبلغ بالجنيه" inputmode="decimal">
    <select id="p_m">${METHODS.map(m => `<option>${m}</option>`).join('')}</select>
    <input id="p_n" placeholder="ملاحظة (اختياري)">
    <div class="row"><button data-a="savepay">تحصيل</button><button class="ghost" data-a="back">رجوع</button></div>`, 'pay');
}

function pricesForm() {
  openDlg(`<h3>قائمة أسعار الخامات (سعر المتر أو القطعة)</h3>
    ${list(S.prices).map(p => `<div class="row"><b style="flex:1">${esc(p.name)}</b><span>${money(p.price)}</span><button class="ghost" data-a="delprice" data-id="${p.id}">حذف</button></div>`).join('') || '<p>لا توجد خامات. أضف أولها بالأسفل.</p>'}
    <div class="row"><input id="x_n" placeholder="اسم الخامة" style="flex:2"><input id="x_p" placeholder="السعر" inputmode="decimal" style="flex:1">
    <button data-a="addprice">إضافة</button>${closeBtn}</div>`, 'pr');
}

/* ---------- استيراد بيانات النظام القديم (مرة واحدة) ---------- */
async function migrate() {
  if ((await db.ref('meta/migrated').once('value')).val()) return toast('تم الاستيراد من قبل', 'err');
  if (!confirm('استيراد الفواتير والتحصيلات من النظام القديم؟ لا تكرر هذه العملية.')) return;
  const old = (await db.ref('invoices').once('value')).val() || {}; let n = 0;
  for (const [cid, recs] of Object.entries(old)) for (const r of Object.values(recs)) {
    if (r.isPayment) await db.ref('payments').push({ clientId: cid, amount: num(r.amount), method: 'كاش', date: r.date || today(), note: r.desc || '', legacy: true });
    else {
      const no = (await db.ref('meta/invoiceNo').transaction(x => (x || 1000) + 1)).snapshot.val(), t = num(r.total);
      await db.ref('orders').push({ no, clientId: cid, date: r.date || today(), legacy: true, subtotal: t, discount: 0, total: t,
        items: [{ desc: r.desc || '', l: num(r.length) || null, w: num(r.width) || null, qty: num(r.qty) || 1, price: num(r.price), total: t }] });
    }
    n++;
  }
  await db.ref('meta/migrated').set(true); toast(`تم استيراد ${n} سجل`);
}

/* ---------- الأوامر ---------- */
const A = {
  close: () => dlg.close(),
  out: () => auth.signOut(),
  newc: () => clientForm(),
  editc: id => clientForm(id),
  savec: async id => {
    const name = $('#f_n').value.trim(), phone = digits($('#f_p').value), clientType = $('#f_t').value;
    if (!name || phone.length !== 11) return toast('الاسم مطلوب ورقم الهاتف 11 رقماً', 'err');
    if (list(S.clients).some(c => c.name === name && c.id !== id)) return toast('هذا العميل موجود مسبقاً', 'err');
    if (id) await db.ref('clients/' + id).update({ name, phone, clientType });
    else await db.ref('clients').push({ name, phone, clientType, createdAt: Date.now() });
    log(id ? 'تعديل عميل' : 'إضافة عميل', name); dlg.close(); toast('تم حفظ العميل');
  },
  delc: async id => {
    if (!confirm('حذف العميل؟ تبقى بياناته محفوظة في قاعدة البيانات.')) return;
    await db.ref('clients/' + id).update({ deleted: true, deletedAt: Date.now() }); log('حذف عميل', S.clients[id].name); toast('تم الحذف');
  },
  open: id => showStatement(id),
  back: () => showStatement(S.cid),
  newinv: () => invForm(),
  addrow: () => { $('#items').insertAdjacentHTML('beforeend', itemRow()); },
  delrow: (_, b) => { if ($$('.item').length > 1) { b.closest('.item').remove(); calc(); } },
  saveinv: () => saveInv().catch(e => toast(e.message, 'err')),
  newpay: () => payForm(),
  savepay: async () => {
    const amount = num($('#p_a').value); if (amount <= 0) return toast('أدخل مبلغاً صحيحاً', 'err');
    await db.ref('payments').push({ clientId: S.cid, amount, method: $('#p_m').value, date: today(), note: $('#p_n').value.trim() });
    log('تحصيل', S.clients[S.cid].name + ' - ' + money(amount)); toast('تم التحصيل'); showStatement(S.cid);
  },
  delrec: async (id, b) => {
    if (!confirm('حذف هذا السجل؟ يبقى محفوظاً في قاعدة البيانات.')) return;
    await db.ref(b.dataset.t + '/' + id).update({ deleted: true, deletedAt: Date.now() }); log('حذف ' + b.dataset.t, id); toast('تم الحذف');
  },
  print: () => window.print(),
  wa: () => {
    const c = S.clients[S.cid], s = stat(S.cid);
    const t = `مرحباً ${c.name}\nكشف حساب مطبعة طارق أبوهمام\nإجمالي الفواتير: ${money(s.billed)}\nالمدفوع: ${money(s.paid)}\nالمتبقي: ${money(s.bal)} جنيه\nشكراً لتعاملكم معنا`;
    window.open(`https://wa.me/20${c.phone.replace(/^0/, '')}?text=${encodeURIComponent(t)}`, '_blank');
  },
  prices: () => pricesForm(),
  addprice: async () => {
    const name = $('#x_n').value.trim(), price = num($('#x_p').value);
    if (!name || price <= 0) return toast('أدخل اسم الخامة وسعرها', 'err');
    await db.ref('prices').push({ name, price }); setTimeout(pricesForm, 250);
  },
  delprice: async id => { await db.ref('prices/' + id).update({ deleted: true }); setTimeout(pricesForm, 250); },
  migrate: () => migrate().catch(e => toast(e.message, 'err'))
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-a]');
  if (b) return A[b.dataset.a]?.(b.dataset.id, b);
  const f = e.target.closest('[data-f]');
  if (f) { S.filter = f.dataset.f; $$('.tabs button').forEach(x => x.classList.toggle('on', x === f)); render(); }
});
dlg.addEventListener('input', e => {
  if (dlg.dataset.v !== 'inv') return;
  if (e.target.matches('.i_m') && e.target.value) {
    const r = e.target.closest('.item');
    $('.i_d', r).value = e.target.selectedOptions[0].text; $('.i_p', r).value = e.target.value;
  }
  calc();
});
$('#q').addEventListener('input', e => { S.q = e.target.value.trim(); render(); });
$('#lb').addEventListener('click', () =>
  auth.signInWithEmailAndPassword($('#lu').value.trim(), $('#lp').value)
    .catch(() => toast('البريد أو كلمة المرور غير صحيحة', 'err')));

/* ---------- الجلسة ---------- */
auth.onAuthStateChanged(u => {
  $('#login').hidden = !!u; $('#app').hidden = !u;
  offs.forEach(f => f()); offs = [];
  if (u) ['clients', 'orders', 'payments', 'prices'].forEach(k => live(k, k));
  else { Object.assign(S, { clients: {}, orders: {}, payments: {}, prices: {}, cid: null }); dlg.open && dlg.close(); $('#lp').value = ''; }
});
