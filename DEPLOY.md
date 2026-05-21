# Atelier by Richard — Maturation App
## Guide de déploiement (en 4 étapes)

---

## Étape 1 — Créer la base de données Supabase

1. Allez sur **[supabase.com](https://supabase.com)** et créez un compte gratuit.
2. Cliquez **"New project"** → choisissez un nom (ex: `atelier-maturation`) et un mot de passe.
3. Attendez ~2 minutes que le projet soit prêt.
4. Dans le menu à gauche, cliquez **SQL Editor**.
5. Cliquez **"New query"**, copiez-collez tout le contenu du fichier `supabase/schema.sql`, puis cliquez **Run** ▶.
   - Vous devriez voir "Success" — les 5 tables et les 20 produits sont créés.

### Récupérer vos clés API

Dans le menu Supabase : **Settings → API**

- Copiez **Project URL** → c'est votre `VITE_SUPABASE_URL`
- Copiez **anon / public** key → c'est votre `VITE_SUPABASE_ANON_KEY`

---

## Étape 2 — Configurer GitHub

1. Créez un compte sur **[github.com](https://github.com)** si vous n'en avez pas.
2. Créez un nouveau dépôt : **New repository** → nommez-le `atelier-maturation` → **Create**.
3. Sur votre Mac, ouvrez le **Terminal** (dans Applications → Utilitaires).
4. Naviguez vers le dossier de l'app :
   ```
   cd "/Users/richard/Documents/Claude/Projects/STOCK MANAGEMENT SOFTWARE/maturation-app"
   ```
5. Initialisez Git et poussez le code :
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/VOTRE_NOM/atelier-maturation.git
   git push -u origin main
   ```
   (Remplacez `VOTRE_NOM` par votre nom d'utilisateur GitHub)

---

## Étape 3 — Déployer sur Vercel

1. Allez sur **[vercel.com](https://vercel.com)** → créez un compte (connectez-vous avec GitHub).
2. Cliquez **"Add New Project"** → importez votre dépôt `atelier-maturation`.
3. **Configuration du projet :**
   - Framework Preset : **Vite** (détecté automatiquement)
   - Root Directory : laissez vide (ou `.`)
4. **Variables d'environnement** (cliquez "Environment Variables") :
   - `VITE_SUPABASE_URL` → collez votre URL Supabase
   - `VITE_SUPABASE_ANON_KEY` → collez votre clé anon
5. Cliquez **Deploy**.
6. Après ~1 minute, Vercel vous donne une URL du type `atelier-maturation.vercel.app`.

**L'application est en ligne !** Accessible depuis Safari sur iPhone, iPad et Mac.

---

## Étape 4 — Développement local (optionnel)

Si vous voulez tester en local sur votre Mac :

1. Installez **Node.js** depuis [nodejs.org](https://nodejs.org) (version LTS).
2. Dans le Terminal, dans le dossier `maturation-app` :
   ```
   cp .env.example .env.local
   ```
3. Éditez `.env.local` (avec TextEdit) et renseignez vos clés Supabase.
4. Installez les dépendances et lancez :
   ```
   npm install
   npm run dev
   ```
5. Ouvrez **http://localhost:5173** dans Safari.

---

## Mises à jour futures

Pour mettre à jour l'application après une modification de code :

```
cd "/Users/richard/Documents/Claude/Projects/STOCK MANAGEMENT SOFTWARE/maturation-app"
git add .
git commit -m "Description de la modification"
git push
```

Vercel redéploie automatiquement en ~1 minute.

---

## Structure du projet

```
maturation-app/
├── supabase/
│   └── schema.sql          ← Base de données (20 produits inclus)
├── src/
│   ├── lib/
│   │   ├── calculations.js ← Formules de maturation
│   │   └── supabase.js     ← Connexion base de données
│   ├── pages/
│   │   ├── Dashboard.jsx   ← Tableau de bord
│   │   ├── Pigs.jsx        ← Réceptions de porcs
│   │   ├── PigDetail.jsx   ← Détail d'un porc
│   │   ├── StockOut.jsx    ← Sorties de stock
│   │   ├── Forecast.jsx    ← Prévisions
│   │   └── Settings.jsx    ← Paramètres / Produits
│   ├── components/
│   │   └── Layout.jsx      ← Navigation
│   ├── App.jsx
│   ├── main.jsx
│   └── index.css
├── .env.example            ← Modèle pour vos clés API
├── package.json
├── vite.config.js
└── tailwind.config.js
```

---

## En cas de problème

- **Erreur de connexion dans l'app** : vérifiez que `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY` sont corrects dans les variables Vercel.
- **"Relation does not exist"** : relancez le `schema.sql` dans l'éditeur SQL de Supabase.
- **Page blanche** : ouvrez Safari → Développement → Afficher la console JavaScript pour voir l'erreur.
