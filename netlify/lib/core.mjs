// ============================================================
// FC Family Crêpe — logique serveur partagée
// (prix, créneaux, stockage, sécurité, SumUp)
// ============================================================
import { getStore } from '@netlify/blobs';
import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { MENU } from './menu.mjs';

// ---------- Réponses ----------
export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
export const fail = (status, error, extra = {}) => json({ error, ...extra }, status);

// ---------- Stockage (Netlify Blobs) ----------
export const db = () => getStore({ name: 'fc-family-crepe', consistency: 'strong' });

const TZ = 'Europe/Brussels';
const dayKeyUTC = (t) => new Date(t).toISOString().slice(0, 10).replace(/-/g, '');
export const brusselsDay = (t = Date.now()) =>
  new Intl.DateTimeFormat('fr-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t));
export const brusselsHHMM = (t) =>
  new Intl.DateTimeFormat('fr-FR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(t));

export const newOrderId = () => `${dayKeyUTC(Date.now())}-${randomBytes(9).toString('hex')}`;
const orderKey = (id) => `orders/${id.slice(0, 8)}/${id}`;
export const isValidId = (id) => typeof id === 'string' && /^\d{8}-[a-f0-9]{18}$/.test(id);

export async function getOrder(id) { return isValidId(id) ? db().get(orderKey(id), { type: 'json' }) : null; }
export async function saveOrder(o) { await db().setJSON(orderKey(o.id), o); return o; }

// Commandes des 2 derniers jours (suffisant pour un fast-food : retraits aujourd'hui / demain)
export async function recentOrders(days = 2) {
  const store = db(), out = [];
  for (let d = 0; d < days; d++) {
    const prefix = `orders/${dayKeyUTC(Date.now() - d * 86400000)}/`;
    const { blobs } = await store.list({ prefix });
    const got = await Promise.all(blobs.map((b) => store.get(b.key, { type: 'json' })));
    out.push(...got.filter(Boolean));
  }
  return out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Numéro de commande lisible, remis à 001 chaque jour
export async function nextNumber() {
  const store = db(), key = `meta/counter-${brusselsDay()}`;
  const cur = (await store.get(key, { type: 'json' })) || { n: 0 };
  const n = cur.n + 1;
  await store.setJSON(key, { n });
  return String(n).padStart(3, '0');
}

// ---------- Réglages ----------
export const DEFAULT_CFG = { cap: 3, open: '11:00', close: '22:00', step: 10 };
export async function getConfig() {
  const c = await db().get('meta/config', { type: 'json' });
  return { ...DEFAULT_CFG, ...(c || {}), step: 10 };
}
export async function setConfig({ cap, open, close }) {
  const t = /^([01]\d|2[0-3]):[0-5]\d$/;
  const c = {
    cap: Math.max(1, Math.min(20, parseInt(cap) || 3)),
    open: t.test(open) ? open : DEFAULT_CFG.open,
    close: t.test(close) ? close : DEFAULT_CFG.close,
  };
  await db().setJSON('meta/config', c);
  return { ...c, step: 10 };
}

// ---------- Prix (recalculés côté serveur : le client ne peut pas tricher) ----------
const find = (list, id) => list.find((x) => x.id === id);
const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const arr = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, 20) : []);

export function priceItem(spec) {
  if (!spec || typeof spec !== 'object') throw new Error('Article invalide');
  const qty = Math.max(1, Math.min(20, parseInt(spec.qty) || 1));
  const type = spec.type, opts = [];
  let base, unit, removed = [], ingredients = [];

  if (type === 'salee') {
    base = find(MENU.SALEES, spec.id); if (!base) throw new Error('Crêpe inconnue');
    unit = base.price; ingredients = base.ing;
    if (base.gratinIncl) opts.push('Gratinée avec merguez (incluse)');
    else {
      const g = find(MENU.GRATIN, spec.gratin || 'none'); if (!g) throw new Error('Gratinage inconnu');
      unit += g.price; if (g.id !== 'none') opts.push(g.name);
    }
    for (const s of MENU.SUPP_SALE) if (arr(spec.supps).includes(s.id)) { unit += s.price; opts.push(s.name); }
    const sauces = arr(spec.sauces).filter((s) => MENU.SAUCES.includes(s));
    if (sauces.length) opts.push('Sauce en plus : ' + sauces.join(', '));
  } else if (type === 'sucree' || type === 'shake') {
    base = find(type === 'sucree' ? MENU.SUCREES : MENU.SHAKES, spec.id); if (!base) throw new Error('Article inconnu');
    unit = base.price;
    if (type === 'shake' && spec.chantilly) { unit += 0.5; opts.push('Chantilly'); }
    const tops = MENU.TOPPINGS.filter((t) => arr(spec.tops).includes(t.id));
    tops.forEach((t) => (unit += t.price));
    if (tops.length) opts.push('Toppings : ' + tops.map((t) => t.name).join(', '));
  } else if (type === 'etudiant') {
    const crepe = find(MENU.SALEES, spec.crepe);
    if (!crepe || !['soso', 'mj'].includes(crepe.id)) throw new Error('Menu étudiant invalide');
    const drink = MENU.BOISSONS.includes(spec.drink) ? spec.drink : MENU.BOISSONS[0];
    base = { name: 'Menu étudiant' }; unit = 10; ingredients = crepe.ing;
    opts.push('Crêpe : ' + crepe.name, 'Crêpe Nutella', 'Boisson : ' + drink);
  } else throw new Error('Type d’article inconnu');

  removed = arr(spec.removed).filter((i) => ingredients.includes(i));
  unit = Math.round(unit * 100) / 100;
  return { type, name: base.name, qty, unit, options: opts, removed, note: str(spec.note, 200) };
}

export const crepesOf = (items) => items.reduce((s, i) => s + i.qty * ({ etudiant: 2, shake: 0 }[i.type] ?? 1), 0);
export const orderTotal = (items) => Math.round(items.reduce((s, i) => s + i.unit * i.qty, 0) * 100) / 100;

// ---------- Créneaux ----------
const PAY_TIMEOUT = 35 * 60000; // une session SumUp dure 30 min
export function isActive(o, now = Date.now()) {
  if (!o.pickup || ['terminee', 'annulee', 'paiement_echoue'].includes(o.status)) return false;
  if (o.status === 'paiement_en_cours') return now - Date.parse(o.createdAt) < PAY_TIMEOUT;
  return true;
}
export function busyList(orders, now = Date.now()) {
  return orders.filter((o) => isActive(o, now)).map((o) => ({ pickup: o.pickup, crepes: crepesOf(o.items) }));
}
function loadMap(busy, cfg) {
  const st = cfg.step * 60000, load = {};
  for (const b of busy) {
    let rem = b.crepes, t = b.pickup, k = 0;
    while (rem > 0 && k++ < 40) { const tk = Math.min(Math.max(0, cfg.cap - (load[t] || 0)), rem); load[t] = (load[t] || 0) + tk; rem -= tk; t -= st; }
  }
  return load;
}
const firstSlot = (cfg, now) => { const st = cfg.step * 60000; return Math.ceil((now + st) / st) * st; };
function fits(load, cfg, t, need, now) {
  const st = cfg.step * 60000, first = firstSlot(cfg, now);
  if (cfg.cap - (load[t] || 0) <= 0) return false; // créneau complet : le client prend le suivant
  let rem = need, u = t;
  while (rem > 0 && u >= first) { rem -= Math.max(0, cfg.cap - (load[u] || 0)); u -= st; }
  return rem <= 0;
}
export function checkPickup(orders, cfg, pickup, need, now = Date.now()) {
  const st = cfg.step * 60000;
  if (!Number.isFinite(pickup) || pickup % st !== 0) return 'Créneau invalide';
  if (pickup < firstSlot(cfg, now) || pickup > now + 2 * 86400000) return 'Créneau dépassé';
  const hm = brusselsHHMM(pickup), [oh, om] = cfg.open.split(':').map(Number);
  const openPlus = `${String(oh + Math.floor((om + cfg.step) / 60)).padStart(2, '0')}:${String((om + cfg.step) % 60).padStart(2, '0')}`;
  if (hm < openPlus || hm > cfg.close) return 'En dehors des heures d’ouverture';
  if (!fits(loadMap(busyList(orders, now), cfg), cfg, pickup, need, now)) return 'slot_full';
  return null;
}
export function nextFreeSlot(orders, cfg, need, now = Date.now()) {
  const st = cfg.step * 60000, load = loadMap(busyList(orders, now), cfg);
  for (let t = firstSlot(cfg, now), i = 0; i < 300; t += st, i++) if (fits(load, cfg, t, need, now)) return t;
  return firstSlot(cfg, now);
}

// ---------- Vue publique d'une commande (sans nom ni téléphone) ----------
export const publicView = (o) => ({
  id: o.id, num: o.num, status: o.status, pickup: o.pickup, total: o.total, student: !!o.student,
  customer: { mode: o.customer.mode },
  payment: { method: o.payment.method, paid: !!o.payment.paid },
  checkoutUrl: o.status === 'paiement_en_cours' ? o.payment.checkoutUrl : undefined,
});

// ---------- Accès gérant : code PIN vérifié ici, jamais dans la page ----------
const pinConfigured = () => /^\d{4}$/.test(process.env.ADMIN_PIN || '');
const secret = () => `${process.env.ADMIN_PIN}|${process.env.SESSION_SECRET || process.env.SUMUP_API_KEY || 'fc'}`;
const sign = (exp) => createHmac('sha256', secret()).update(`fc-admin:${exp}`).digest('hex');
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export async function login(pin, stay) {
  if (!pinConfigured()) return { status: 500, error: 'Le code PIN (ADMIN_PIN) n’est pas encore configuré sur Netlify.' };
  const store = db(), lock = (await store.get('meta/lock', { type: 'json' })) || { fails: 0, until: 0 };
  if (lock.until > Date.now()) return { status: 429, error: 'Trop d’essais.', until: lock.until };
  if (!safeEq(pin, process.env.ADMIN_PIN)) {
    lock.fails = (lock.fails || 0) + 1;
    if (lock.fails >= 8) { lock.fails = 0; lock.until = Date.now() + 10 * 60000; }
    await store.setJSON('meta/lock', lock);
    return { status: 401, error: 'Code PIN incorrect.', until: lock.until > Date.now() ? lock.until : undefined };
  }
  await store.setJSON('meta/lock', { fails: 0, until: 0 });
  const exp = Date.now() + (stay ? 30 : 1) * 86400000;
  return { status: 200, token: `${exp}.${sign(exp)}` };
}
export function isAdmin(req) {
  if (!pinConfigured()) return false;
  const tok = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const [exp, sig] = tok.split('.');
  return Number(exp) > Date.now() && !!sig && safeEq(sig, sign(exp));
}

// ---------- SumUp ----------
const SUMUP = process.env.SUMUP_API_BASE || 'https://api.sumup.com';
export const paymentsEnabled = () => !!(process.env.SUMUP_API_KEY && process.env.SUMUP_MERCHANT_CODE);
async function sumup(path, init = {}) {
  const r = await fetch(SUMUP + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.SUMUP_API_KEY}`, ...(init.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`SumUp ${r.status}: ${body.message || body.error_code || JSON.stringify(body).slice(0, 200)}`);
  return body;
}
export function createCheckout(order, origin) {
  return sumup('/v0.1/checkouts', {
    method: 'POST',
    body: JSON.stringify({
      checkout_reference: order.id,
      amount: order.total,
      currency: 'EUR',
      merchant_code: process.env.SUMUP_MERCHANT_CODE,
      description: `FC Family Crêpe - commande N° ${order.num}`,
      redirect_url: `${origin}/?commande=${order.id}`,
      return_url: `${origin}/api/sumup-webhook`,
      hosted_checkout: { enabled: true },
    }),
  });
}
const getCheckout = (id) => sumup(`/v0.1/checkouts/${encodeURIComponent(id)}`);

// Vérifie l'état du paiement directement chez SumUp (source de vérité)
export async function syncPayment(o) {
  if (!o || o.status !== 'paiement_en_cours' || !o.payment.checkoutId || !paymentsEnabled()) return o;
  let c; try { c = await getCheckout(o.payment.checkoutId); } catch { return o; }
  const amountOk = Math.abs(Number(c.amount) - o.total) < 0.005 && c.currency === 'EUR';
  if (c.status === 'PAID' && amountOk) {
    o.status = 'nouvelle'; o.payment.paid = true; o.payment.paidAt = new Date().toISOString();
    o.payment.transactionCode = c.transaction_code || (c.transactions && c.transactions[0] && c.transactions[0].transaction_code) || null;
    await saveOrder(o);
  } else if (c.status === 'EXPIRED' || (c.status === 'FAILED' && Date.now() - Date.parse(o.createdAt) > PAY_TIMEOUT)) {
    o.status = 'paiement_echoue'; await saveOrder(o);
  }
  return o;
}
export async function indexCheckout(checkoutId, orderId) { await db().setJSON(`checkouts/${checkoutId}`, { orderId }); }
export async function orderByCheckout(checkoutId) {
  if (typeof checkoutId !== 'string' || !/^[\w-]{6,64}$/.test(checkoutId)) return null;
  const ref = await db().get(`checkouts/${checkoutId}`, { type: 'json' });
  return ref ? getOrder(ref.orderId) : null;
}
