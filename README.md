# C2Pass

C2Pass est une plateforme de préparation au **TCF Canada**, visant le niveau **C2**, pour les candidats d’Afrique centrale (Cameroun, Gabon, Congo, Tchad, RDC, RCA, Guinée Équatoriale).

Ce dépôt couvre la plateforme web décrite dans le cahier des charges (« c2pass bon.pdf », v1.0). L’application mobile native est prévue après le lancement (T+3 mois). D’ici là, le site s’installe sur l’écran d’accueil d’un téléphone comme une application (icône, plein écran, page hors connexion, notifications).

> Ce projet est indépendant de la plateforme de location et de suivi de véhicules, qui vit dans un autre dossier.

## Les 4 modules

### 1. Espace étudiant
- **Comptes** : inscription par e-mail, Google ou Facebook.
- **Tableau de bord** :
  - progression vers C2 pour chaque compétence (radar, courbe d’évolution, CECRL, NCLC) ;
  - quotas de l’offre ;
  - prochaine session dans le pays du candidat ;
  - conseil du jour.
- **Entraînement thématique** : CO, CE, EE et EO, avec un filtre par niveau de A1 à C2. Chaque réponse est corrigée immédiatement avec son explication, et chaque piège est expliqué. Des fiches de méthode sont incluses.
- **Simulateur en conditions réelles** :
  - mêmes sections que l’examen : CO 39 questions en 35 min, CE 39 en 60 min, EE 3 tâches en 60 min, EO 3 tâches en 12 min ;
  - chronomètre verrouillé côté serveur ;
  - écoute unique ;
  - aucun retour en arrière ;
  - plein écran ;
  - copier-coller bloqué ;
  - sorties de page journalisées ;
  - enregistrement de la voix (MediaRecorder) ;
  - score sur 100–699 et sur 20.

### 2. Contenu pédagogique et IA C2
- **Banque de questions** stockée dans MongoDB, gérée depuis le back-office : création, import JSON et ajout d’audio studio.
- **Correction de l’écrit**, selon le niveau d’IA de l’offre :

  | Niveau d’IA | Ce qui est utilisé |
  |---|---|
  | aucune | indicateurs textuels : diversité lexicale (MATTR), connecteurs C1–C2, structures complexes, longueur des phrases |
  | base | ces indicateurs, plus LanguageTool (grammaire, orthographe) et TextRazor (le texte traite-t-il le sujet ? un hors-sujet perd 3 points) |
  | avancée | GPT-4, avec une consigne calibrée sur les critères C2 |

- **Correction de l’oral** : transcription par Whisper, puis évaluation de la transcription. L’enregistrement est compressé dans le navigateur (Opus 32 kbit/s, environ 1 Mo pour 5 minutes) et renvoyé seul si la connexion coupe. Si le micro est refusé, absent ou occupé, le candidat voit pourquoi et peut envoyer un enregistrement fait avec son téléphone.
- **Correcteurs humains certifiés** pour les offres Premium Pro et Pack Réussite. Leur note remplace celle de l’IA et met à jour le score de la simulation.

### 3. Centres d’examen
- **Carte interactive** (Leaflet / OpenStreetMap) avec des filtres par pays et par statut (Ouvert, Fermé, Complet, Bientôt).
- **Fiche de chaque centre** : prochaine session, places restantes et tarif.
- **Back-office** : changement de statut en un clic, historique, et réglage de la surveillance.

### 4. Alertes en temps réel
- **Veille légale** : la page publique de chaque centre est consultée toutes les 5 à 10 minutes, en respectant robots.txt. Il n’y a ni robot de réservation, ni contournement de captcha, ni proxy.
- **Ouverture d’un centre** : quand un centre passe à « Ouvert » (par la veille ou par un administrateur), C2Pass envoie l’alerte par e-mail, SMS (Twilio), WhatsApp, dans l’application, et en notification du navigateur sur chaque téléphone ou ordinateur où le candidat l’a activée (Web Push, même site fermé). Les abonnés prioritaires sont servis en premier, et un candidat n’est pas relancé deux fois en 6 heures.
- **Coffre-fort candidat** : les données sont chiffrées en AES-256-GCM, et chaque lecture est journalisée.
- **Assistant d’inscription** : le formulaire officiel s’ouvre dans un nouvel onglet, et le candidat copie ses informations depuis le coffre-fort. Rien n’est soumis à sa place.

## Offres

| Offre | Prix | Contenu |
|---|---|---|
| Gratuit | 0 | 5 exercices par jour, 1 simulation par mois, pas d’alertes |
| Premium Standard | 9 900 FCFA par mois | exercices illimités, 3 simulations par mois, alertes sur 3 centres, IA de base |
| Premium Pro | 19 900 FCFA par mois | simulations illimitées, alertes illimitées et prioritaires, IA avancée, correcteur humain |
| Pack Réussite | 49 900 FCFA, paiement unique | accès Pro pendant 3 mois et garantie C2 |

Les moyens de paiement sont Orange Money (Web Payment), MTN MoMo (Collection), CinetPay (agrégateur : paiement de secours si un opérateur est en panne, et Moov, Wave et les autres opérateurs Mobile Money de la région) et Stripe pour la carte bancaire, en XAF. Le formulaire de paiement ne propose que les moyens dont les clés sont renseignées.

- **Remboursements** : depuis son profil, l’élève demande le remboursement d’un paiement sous 7 jours s’il n’a pas utilisé l’offre (ni simulation, ni correction humaine). La **garantie C2** du Pack Réussite se demande entre 3 et 9 mois après l’achat, après au moins 3 simulations complètes, avec l’attestation officielle du TCF en pièce jointe. L’administrateur accepte ou refuse chaque demande (page *Paiements & remboursements*), et peut aussi rembourser directement. Un paiement remboursé rend l’offre gratuite. Le remboursement d’argent lui-même se fait chez le prestataire (Orange Money, MTN, Stripe).
- **Rappel de renouvellement** : un e-mail part 3 jours avant la fin d’une offre, une seule fois par échéance.
- **Journal d’audit** : créations de compte, sécurité (double authentification, mots de passe, jeton volé), accès au coffre-fort, offres activées, remboursements, export et effacement RGPD, et actions des administrateurs, consultables et filtrables dans le back-office.
- **Bêta privée et liste d’attente** : la page d’accueil recueille les adresses intéressées. Avec `SIGNUP_MODE=invite` (dans `ops/site.env`), un compte ne se crée qu’avec un code d’invitation. Le back-office (*Bêta & liste d’attente*) envoie un code personnel aux adresses choisies de la liste, ou crée des codes à plusieurs places pour un groupe (école, partenaire), et suit leur utilisation.
- **Registre RGPD** : le back-office affiche et imprime le registre des traitements (finalités, bases légales, données, prestataires réellement branchés, durées de conservation, sécurité). Les adresses de la liste d’attente sont effacées après 3 ans.
- **CAC et LTV** : sur la page Indicateurs, l’administrateur saisit ses dépenses marketing par mois et par canal ; la page calcule le coût d’acquisition d’un client payant, ce qu’un client rapporte et leur rapport.

## Sécurité et RGPD

- **Mots de passe** : hachés avec Argon2id. Un mot de passe oublié se réinitialise par un lien reçu par e-mail, valable 60 minutes et utilisable une seule fois ; la réinitialisation ferme toutes les sessions ouvertes.
- **Sessions** : JWT valable 1 heure, avec rotation des jetons de rafraîchissement. Un jeton déjà remplacé qui revient (vol) ferme toutes les sessions du compte.
- **Comptes administrateurs** : la double authentification (TOTP) est obligatoire. Elle est facultative pour les autres comptes, demande le mot de passe pour être activée et ne peut pas être remplacée une fois active.
- **Connexion Google / Facebook** : liée au navigateur qui l’a lancée (pas de connexion forcée par un lien piégé). Si un compte du même e-mail n’avait jamais prouvé son adresse, son mot de passe et ses sessions sont annulés à la première connexion par Google ou Facebook.
- **Examen** : pendant une simulation, ses questions ne peuvent pas être corrigées ni réécoutées depuis l’entraînement ; une simulation abandonnée ne montre les corrigés que des sections terminées.
- **Paiements** : en production, l’API refuse de démarrer en mode sandbox (offres activées sans paiement) sauf autorisation explicite `ALLOW_SANDBOX_PAYMENTS=true`, réservée à un serveur de démonstration. Un moyen de paiement sans clés est refusé, jamais gratuit. Au plus 3 paiements Mobile Money en attente par candidat.
- **Correcteurs** : une note rendue est définitive, et personne ne corrige sa propre copie.
- **Anti-fraude** : empreinte du navigateur à la connexion et au début de chaque examen, et détection des appareils utilisés par plusieurs comptes.
- **Droits RGPD** : chaque utilisateur peut exporter ses données en JSON ou supprimer son compte : effacement des données, des copies, des simulations et des fichiers audio eux-mêmes, et anonymisation des paiements.
- **Journal d’audit** : accès au coffre-fort et actions des administrateurs.
- **Adresse e-mail** : un lien de confirmation (valable 48 heures, 3 envois par heure au plus) est envoyé à l’inscription. Tant que l’adresse n’est pas confirmée, le compte peut s’entraîner mais ne peut ni payer ni s’abonner aux alertes.
- **Protection de l’API** : en-têtes Helmet, CORS restreint et limitation du débit (inscription, connexion, paiement, rafraîchissement, formulaires). La connexion est aussi limitée par compte : 10 échecs en 15 minutes bloquent le compte visé, quelle que soit l’adresse IP. Les compteurs sont gardés dans Redis et donc partagés entre plusieurs serveurs d’API.
- **Veille des centres** : les motifs saisis par les administrateurs sont exécutés avec une limite de 250 ms, pour qu’un motif mal écrit ne bloque pas l’API.
- **Protection du site** : politique de sécurité du contenu (CSP) qui interdit les scripts et connexions vers d’autres sites.

## Architecture

```
packages/shared   règles TCF (barèmes, CECRL, NCLC), offres, analyse de texte : partagées par l’API et le site
apps/api          NestJS : PostgreSQL (comptes, sessions, centres, paiements), MongoDB (questions, copies, audio),
                  Redis + BullMQ (correction IA, veille, envoi des alertes), stockage S3 (fichiers audio)
apps/web          Next.js (App Router) + Tailwind CSS
```

## Démarrage

### Avec Docker (recommandé)

```bash
cp .env.example .env               # renseigner JWT_SECRET, VAULT_KEY, POSTGRES_PASSWORD, S3_SECRET_ACCESS_KEY, S3_SSE_KEY
docker compose up -d --build
docker compose exec -e SEED_DEMO_ACCOUNTS=true api node dist/db/seed.js   # contenu et comptes de démonstration (une seule fois)
```

Le site est alors sur http://localhost:3000 et l’API sur http://localhost:4000/api/health.

La pile complète (PostgreSQL, MongoDB, Redis, stockage S3 SeaweedFS, API, site) a été lancée ainsi et le parcours complet a été testé dans un navigateur : inscription, entraînement, simulation, paiement, alertes, back-office, enregistrement oral stocké dans S3. Les images MinIO n’étant plus publiées sur Docker Hub, le stockage S3 local utilise SeaweedFS. En production, on peut aussi pointer `S3_ENDPOINT` vers AWS S3 ou Cloudflare R2.

Derrière un proxy d’entreprise qui intercepte le HTTPS, `npm ci` échoue pendant la construction des images : il faut ajouter le certificat du proxy aux images (`NODE_EXTRA_CA_CERTS`).

### En développement

Prérequis : Node 22, PostgreSQL 16, MongoDB 7. Redis est facultatif : sans lui, les tâches s’exécutent en ligne.

```bash
npm install
createdb c2pass_tcf                # base de données c2pass_tcf, utilisateur c2pass / c2pass par défaut
npm run build
npm run db:seed
npm run dev -w @c2pass/api         # :4000
npm run dev -w @c2pass/web         # :3000
npm test                           # tests de l’API et de la logique TCF
```

L’intégration continue (`.github/workflows/ci.yml`) lance à chaque push la vérification des types, les tests et la construction, puis construit les images Docker.

### Comptes de démonstration

Tous les comptes ont le mot de passe `Demo1234!`. Ils ne sont pas créés quand `NODE_ENV=production` (sauf `SEED_DEMO_ACCOUNTS=true`, pour un serveur de démonstration).

| E-mail | Rôle |
|---|---|
| etudiant@c2pass.cm | étudiant, offre Gratuit |
| premium@c2pass.cm | étudiant Premium Pro, avec 3 simulations et des alertes |
| correcteur@c2pass.cm | correcteur humain |
| admin@c2pass.cm | administrateur ; la double authentification est configurée à la première connexion |

## Mettre en production

### Installation en un script (recommandé)

Sur un serveur neuf Ubuntu 24.04 avec 4 Go de mémoire (par exemple Hetzner CX22 ou un VPS OVH), en root :

```bash
curl -fsSL https://raw.githubusercontent.com/solutionsproviders21-sys/c2pass/main/ops/install.sh -o install.sh
ADMIN_EMAIL=vous@exemple.com ADMIN_PASSWORD='un mot de passe de 12 caractères ou plus' bash install.sh
```

On peut aussi coller `ops/install.sh`, variables remplies, dans le champ « User data / Cloud config » à la création du serveur. Le script installe Docker, génère les secrets dans `/opt/c2pass/.env`, lance le site en HTTPS, charge la banque de questions et crée le premier administrateur. Sans nom de domaine, le site répond sur `https://<ip-avec-tirets>.sslip.io`.

Ensuite, le serveur se met à jour seul : toutes les 10 minutes, il récupère la branche `main` de GitHub et reconstruit ce qui a changé (`ops/update.sh`). Les réglages publics (domaine, identité légale) se changent dans `ops/site.env`, dans le dépôt. Les secrets (clés des prestataires, `SMTP_URL`) restent dans le `.env` du serveur. La sauvegarde des bases tourne chaque nuit.

### Déploiement manuel

Sur un serveur Linux avec Docker, et un nom de domaine dont l’enregistrement DNS pointe vers ce serveur :

```bash
cp .env.example .env     # DOMAIN, secrets, identité légale (LEGAL_*), clés des prestataires, NOTIFICATIONS_MODE=live + SMTP_URL
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose exec api node dist/db/seed.js                                   # banque de questions de départ, sans comptes de démonstration
docker compose exec api node dist/db/create-admin.js admin@exemple.cm Prénom Nom   # affiche un mot de passe à usage unique
```

- **HTTPS** : Caddy (`ops/Caddyfile`) obtient et renouvelle seul le certificat Let’s Encrypt, sert le site et l’API sur le même domaine et redirige `www`. Seuls les ports 80 et 443 sont ouverts ; PostgreSQL, MongoDB, Redis, le stockage S3, l’API et le site ne sont pas joignables de l’extérieur.
- **E-mails** : `NOTIFICATIONS_MODE=live` et un `SMTP_URL` valide sont indispensables, sinon les liens de confirmation d’adresse et de mot de passe oublié ne partent pas (ils sont seulement écrits dans le journal de l’API).
- **Pages légales** : mentions légales, CGU et politique de confidentialité sont en ligne (`/mentions-legales`, `/conditions`, `/confidentialite`). L’identité de la société (`LEGAL_*`) est à renseigner avant la construction des images ; tant qu’elle manque, ces pages affichent « [à compléter] ». Les CGU proposent par défaut un remboursement sous 7 jours si l’offre n’a pas été utilisée et aucun renouvellement automatique : à faire valider par un juriste.
- **Référencement** : `robots.txt`, `sitemap.xml` et les aperçus de partage (Open Graph) utilisent `DOMAIN`. Les espaces privés ne sont pas indexés.
- **Sauvegardes** : chaque nuit, `ops/backup.sh` sauvegarde PostgreSQL, MongoDB et les fichiers stockés (enregistrements, attestations) dans `backups/AAAAMMJJ-HHMMSS/`, chiffrés avec `BACKUP_PASSPHRASE`, et garde 14 jours. Avec `BACKUP_S3_BUCKET` (AWS S3, Cloudflare R2, Backblaze B2…), chaque sauvegarde est aussi copiée hors du serveur. Le 1er de chaque mois, `ops/restore-test.sh` restaure la dernière sauvegarde dans des conteneurs jetables et vérifie son contenu (`backups/restore-test.log`). `ops/restore.sh <dossier>` restaure une sauvegarde sur le site.
- **Journaux** : chaque service garde au plus 50 Mo de journaux (`docker compose logs`). Les services redémarrent seuls après une panne ou un redémarrage du serveur.

### Avant l’ouverture

1. **Contenu** : remplacer le contenu de démonstration (102 questions, 8 fiches) par la banque validée par l’expert pédagogique. L’objectif est de 5 000 questions ou plus, ajoutées par l’import JSON du back-office. Ajouter les enregistrements audio des documents de compréhension orale. Sans enregistrement, la voix de synthèse du navigateur lit la transcription une seule fois.
2. **Centres** : renseigner pour chaque centre l’adresse, le téléphone, le lien d’inscription, l’URL surveillée et les motifs à détecter. Volontairement, aucune donnée non vérifiée n’est fournie.
3. **Clés des prestataires** : ajouter les clés OpenAI, LanguageTool, Twilio, WhatsApp Cloud, Orange Money, MTN MoMo, CinetPay, Stripe, Google et Facebook dans `.env`, ainsi que les clés VAPID des notifications (`npx web-push generate-vapid-keys`). Chaque service reste en mode démonstration tant que sa clé est absente, sauf les paiements : en `PAYMENTS_MODE=live`, un moyen de paiement sans clés est simplement indisponible.
4. **Garder les clés** : copier `VAULT_KEY`, `S3_SSE_KEY` et `BACKUP_PASSPHRASE` hors du serveur. Une clé perdue rend les coffres-forts, les enregistrements ou les sauvegardes illisibles.
