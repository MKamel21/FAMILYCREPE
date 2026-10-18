// GET /api/statut?id=... : état d'une commande (après le retour de SumUp)
import { json, fail, getOrder, syncPayment, publicView } from '../lib/core.mjs';
export default async (req) => {
  const o = await getOrder(new URL(req.url).searchParams.get('id'));
  if (!o) return fail(404, 'Commande introuvable');
  return json({ order: publicView(await syncPayment(o)) });
};
export const config = { path: '/api/statut' };
