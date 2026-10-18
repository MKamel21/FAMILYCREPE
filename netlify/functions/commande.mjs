// POST /api/commande : création d'une commande (liquide ou carte via SumUp)
import { json, fail, priceItem, orderTotal, crepesOf, getConfig, recentOrders, checkPickup, newOrderId,
  nextNumber, saveOrder, publicView, paymentsEnabled, createCheckout, indexCheckout } from '../lib/core.mjs';

export default async (req) => {
  if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
  let b; try { b = await req.json(); } catch { return fail(400, 'Requête invalide'); }

  const name = String(b?.customer?.name || '').trim().slice(0, 60);
  const phone = String(b?.customer?.phone || '').trim().slice(0, 25);
  const mode = b?.customer?.mode === 'surplace' ? 'surplace' : 'emporter';
  const pay = b?.pay === 'card' ? 'card' : 'cash';
  if (!name) return fail(400, 'Indique ton nom.');
  if (!/^[0-9+ /.]{8,25}$/.test(phone)) return fail(400, 'Indique un numéro de téléphone valide.');
  if (!Array.isArray(b.items) || !b.items.length || b.items.length > 30) return fail(400, 'Panier vide ou invalide.');

  let items; try { items = b.items.map(priceItem); } catch (e) { return fail(400, e.message); }
  const total = orderTotal(items);
  const order = {
    id: newOrderId(), createdAt: new Date().toISOString(), items, total,
    student: items.some((i) => i.type === 'etudiant'),
    customer: { name, phone, mode }, note: String(b.note || '').trim().slice(0, 300),
    pickup: null, status: 'attente_paiement', payment: { method: pay, paid: false },
  };

  if (pay === 'card') {
    if (!paymentsEnabled()) return fail(503, 'Le paiement en ligne n’est pas disponible pour le moment. Choisis le paiement au comptoir.');
    const pickup = Number(b.pickup);
    const [cfg, orders] = await Promise.all([getConfig(), recentOrders()]);
    const err = checkPickup(orders, cfg, pickup, crepesOf(items));
    if (err === 'slot_full') return fail(409, 'Ce créneau vient d’être pris. On t’a proposé le suivant disponible.', { code: 'slot_full' });
    if (err) return fail(400, err, { code: 'slot_invalid' });
    order.pickup = pickup; order.status = 'paiement_en_cours';
    order.num = await nextNumber();
    await saveOrder(order); // réserve le créneau pendant le paiement
    try {
      const c = await createCheckout(order, new URL(req.url).origin);
      order.payment.checkoutId = c.id; order.payment.checkoutUrl = c.hosted_checkout_url;
      if (!c.hosted_checkout_url) throw new Error('SumUp n’a pas renvoyé de page de paiement');
      await saveOrder(order); await indexCheckout(c.id, order.id);
    } catch (e) {
      console.error('SumUp createCheckout', e.message);
      order.status = 'paiement_echoue'; order.payment.error = e.message; await saveOrder(order);
      return fail(502, 'Le paiement en ligne a rencontré un problème. Réessaie ou choisis le paiement au comptoir.');
    }
    return json({ id: order.id, checkoutUrl: order.payment.checkoutUrl });
  }

  order.num = await nextNumber();
  await saveOrder(order);
  return json({ order: publicView(order) });
};
export const config = { path: '/api/commande' };
