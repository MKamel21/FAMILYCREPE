# FC Family Crêpe — mise en ligne avec paiement SumUp

## Ce qu'il y a dans ce dossier

| Dossier / fichier | Rôle |
|---|---|
| `public/index.html` | Site client (menu, panier, commande) |
| `public/gerant.html` | Espace gérant (code PIN, commandes, ka-ching) |
| `netlify/functions/` | Le serveur : commandes, paiement SumUp, accès gérant |
| `netlify/lib/core.mjs` | Prix, créneaux, sécurité, appels SumUp |
| `netlify/lib/menu.mjs` | Prix du menu (généré depuis le site) |
| `netlify.toml`, `package.json` | Configuration Netlify |

Les commandes sont stockées en ligne (Netlify Blobs) : elles arrivent sur
n'importe quel appareil du gérant. Les prix sont recalculés par le serveur,
la clé SumUp et le code PIN ne sont jamais dans les pages.

## ⚠️ Le glisser-déposer (Netlify Drop) ne suffit plus

Le site a maintenant des fonctions serveur : il faut déployer par **GitHub**
(recommandé) ou par le **Netlify CLI**.

### Option A — GitHub (recommandé)
1. Crée un dépôt GitHub **privé** (ex. `fc-family-crepe`) et envoie-y tout ce dossier.
2. Sur Netlify : **Add new site → Import an existing project → GitHub** → choisis le dépôt.
3. Laisse les réglages proposés (ils viennent de `netlify.toml`) → **Deploy**.
4. Ensuite, chaque `git push` met le site à jour tout seul.

### Option B — Netlify CLI (sans GitHub)
```bash
npm install -g netlify-cli
netlify login
cd fc-family-crepe          # ce dossier
npm install
netlify deploy --prod       # choisis/crée le site quand il le demande
```

## Variables d'environnement (obligatoire)

Netlify → ton site → **Site configuration → Environment variables → Add a variable** :

| Nom | Valeur | Remarque |
|---|---|---|
| `ADMIN_PIN` | 4 chiffres, ex. `4821` | Code de l'espace gérant. **Pas 1234.** |
| `SUMUP_API_KEY` | la clé secrète SumUp | Jamais dans le code ni dans un chat |
| `SUMUP_MERCHANT_CODE` | le code marchand (commence par M) | |
| `SESSION_SECRET` | une longue phrase au hasard | Facultatif, renforce les connexions gérant |

Après avoir ajouté ou modifié une variable : **Deploys → Trigger deploy → Deploy site**.

Sans `SUMUP_API_KEY` / `SUMUP_MERCHANT_CODE`, le site marche quand même :
l'option « payer en ligne » affiche « bientôt disponible » et seul le
paiement au comptoir est proposé.

## Tester avant d'ouvrir
1. Ouvre `https://ton-site.netlify.app/gerant.html`, connecte-toi avec le PIN,
   coche « Rester connecté », touche l'écran pour activer le son.
2. Sur un autre téléphone : passe une commande **au comptoir** → le gérant
   doit la recevoir avec le ka-ching. Cherche son numéro → « Paiement reçu ».
3. Passe une commande **en ligne** de faible montant (ex. une crêpe au sucre, 3 €)
   avec ta vraie carte → page SumUp → paie → reviens sur le site.
   La commande doit apparaître « 💳 Payée en ligne » chez le gérant
   et le paiement dans le compte SumUp du propriétaire.
4. Le propriétaire rembourse ce paiement test depuis son compte SumUp.

## Changer le code PIN
Netlify → Environment variables → modifie `ADMIN_PIN` → redéploie.
Tous les appareils devront retaper le nouveau code.

## Bancontact / Apple Pay
Les cartes fonctionnent dès que la clé est en place. Pour Bancontact et
Apple Pay sur la page de paiement SumUp, le propriétaire doit demander
leur activation à SumUp (formulaire de contact SumUp).
