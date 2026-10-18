// GET /api/gerant/commandes : liste des commandes pour l'espace gérant
import { json, fail, isAdmin, recentOrders, getConfig, syncPayment, paymentsEnabled } from '../lib/core.mjs';
export default async (req) => {
  if (!isAdmin(req)) return fail(401, 'Non connecté');
  let orders = await recentOrders();
  // Filet de sécurité si un webhook SumUp s'est perdu : on revérifie les paiements récents en attente
  const pending = orders.filter((o) => o.status === 'paiement_en_cours' && Date.now() - Date.parse(o.createdAt) < 40 * 60000).slice(0, 5);
  await Promise.all(pending.map(syncPayment));
  orders = orders.filter((o) => !['paiement_en_cours', 'paiement_echoue'].includes(o.status));
  return json({ orders, cfg: await getConfig(), paymentsEnabled: paymentsEnabled() });
};
export const config = { path: '/api/gerant/commandes' };
