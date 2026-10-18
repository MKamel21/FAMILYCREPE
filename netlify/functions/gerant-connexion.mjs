// POST /api/gerant/connexion : vérifie le code PIN (variable ADMIN_PIN sur Netlify)
import { json, fail, login } from '../lib/core.mjs';
export default async (req) => {
  if (req.method !== 'POST') return fail(405, 'Méthode non autorisée');
  let b = {}; try { b = await req.json(); } catch {}
  const r = await login(String(b.pin || ''), !!b.stay);
  return r.status === 200 ? json({ token: r.token }) : fail(r.status, r.error, { until: r.until });
};
export const config = { path: '/api/gerant/connexion' };
