// POST /api/gerant/pin : le gérant change son code PIN (ancien code obligatoire)
import { json, fail, isAdmin, changePin } from '../lib/core.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
  if (!(await isAdmin(req))) return fail(401, 'Non connecté');
  let b = {}; try { b = await req.json(); } catch {}
  const r = await changePin(String(b.current || ''), String(b.next || ''), !!b.stay);
  return r.status === 200 ? json({ token: r.token }) : fail(r.status, r.error, { until: r.until });
};
export const config = { path: '/api/gerant/pin' };
