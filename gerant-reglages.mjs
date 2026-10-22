// POST /api/gerant/reglages : capacité et horaires
import { json, fail, isAdmin, setConfig } from '../lib/core.mjs';
export default async (req) => {
  if (!(await isAdmin(req))) return fail(401, 'Non connecté');
  let b = {}; try { b = await req.json(); } catch {}
  return json({ cfg: await setConfig(b) });
};
export const config = { path: '/api/gerant/reglages' };
