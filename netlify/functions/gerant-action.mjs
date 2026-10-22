// POST /api/gerant/action : encaisser, changer le statut
import { json, fail, isAdmin, getOrder, saveOrder, recentOrders, getConfig, nextFreeSlot, crepesOf } from '../lib/core.mjs';
const STATUSES = ['attente_paiement', 'nouvelle', 'preparation', 'prete', 'terminee', 'annulee'];
export default async (req) => {
  if (!(await isAdmin(req))) return fail(401, 'Non connecté');
  let b = {}; try { b = await req.json(); } catch {}
  const o = await getOrder(b.id);
  if (!o || ['paiement_en_cours', 'paiement_echoue'].includes(o.status)) return fail(404, 'Commande introuvable');

  if (b.action === 'encaisser') {
    if (o.payment.paid) return fail(400, 'Déjà payée');
    const [cfg, orders] = await Promise.all([getConfig(), recentOrders()]);
    o.payment = { method: 'cash', paid: true, paidAt: new Date().toISOString() };
    o.pickup = nextFreeSlot(orders.filter((x) => x.id !== o.id), cfg, crepesOf(o.items));
    o.status = 'preparation';
  } else if (b.action === 'statut' && STATUSES.includes(b.status)) {
    if (!o.payment.paid && !['attente_paiement', 'annulee'].includes(b.status)) return fail(400, 'Commande non payée');
    if (o.payment.paid && b.status === 'attente_paiement') return fail(400, 'Commande déjà payée');
    o.status = b.status;
  } else return fail(400, 'Action inconnue');

  await saveOrder(o);
  return json({ order: o });
};
export const config = { path: '/api/gerant/action' };
