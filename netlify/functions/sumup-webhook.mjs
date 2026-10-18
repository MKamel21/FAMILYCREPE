// POST /api/sumup-webhook : SumUp prévient qu'un paiement a changé.
// On ne fait pas confiance au contenu : on revérifie le statut directement chez SumUp.
import { json, orderByCheckout, syncPayment } from '../lib/core.mjs';
export default async (req) => {
  let b = {}; try { b = await req.json(); } catch {}
  const o = await orderByCheckout(b.id || b.checkout_id);
  if (o) await syncPayment(o);
  return json({ ok: true });
};
export const config = { path: '/api/sumup-webhook' };
