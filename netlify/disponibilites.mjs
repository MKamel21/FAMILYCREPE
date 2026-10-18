// GET /api/disponibilites : réglages + charge des créneaux (aucune donnée client)
import { json, getConfig, recentOrders, busyList, paymentsEnabled } from '../lib/core.mjs';
export default async () => {
  const [cfg, orders] = await Promise.all([getConfig(), recentOrders()]);
  return json({ cfg, busy: busyList(orders), paymentsEnabled: paymentsEnabled() });
};
export const config = { path: '/api/disponibilites' };
