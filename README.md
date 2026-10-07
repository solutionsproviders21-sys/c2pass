# C2Pass

C2Pass est une plateforme de préparation au **TCF Canada**, visant le niveau **C2**, pour les candidats d’Afrique centrale (Cameroun, Gabon, Congo, Tchad, RDC, RCA, Guinée Équatoriale).

Ce dépôt couvre la plateforme web décrite dans le cahier des charges (« c2pass bon.pdf », v1.0). L’application mobile est prévue après le lancement (T+3 mois) et ne fait pas partie de ce dépôt.

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
  | base | ces indicateurs, plus LanguageTool |
  | avancée | GPT-4, avec une consigne calibrée sur les critères C2 |

- **Correction de l’oral** : transcription par Whisper, puis évaluation de la transcription.
- **Correcteurs humains certifiés** pour les offres Premium Pro et Pack Réussite. Leur note remplace celle de l’IA et met à jour le score de la simulation.

### 3. Centres d’examen
- **Carte interactive** (Leaflet / OpenStreetMap) avec des filtres par pays et par statut (Ouvert, Fermé, Complet, Bientôt).
- **Fiche de chaque centre** : prochaine session, places restantes et tarif.
- **Back-office** : changement de statut en un clic, historique, et réglage de la surveillance.

### 4. Alertes en temps réel
- **Veille légale** : la page publique de chaque centre est consultée toutes les 5 à 10 minutes, en respectant robots.txt. Il n’y a ni robot de réservation, ni contournement de captcha, ni proxy.
- **Ouverture d’un centre** : quand un centre passe à « Ouvert » (par la veille ou par un administrateur), C2Pass envoie l’alerte par e-mail, SMS (Twilio), WhatsApp et dans l’application. Les abonnés prioritaires sont servis en premier, et un candidat n’est pas relancé deux fois en 6 heures.
- **Coffre-fort candidat** : les données sont chiffrées en AES-256-GCM, et chaque lecture est journalisée.
- **Assistant d’inscription** : le formulaire officiel s’ouvre dans un nouvel onglet, et le candidat copie ses informations depuis le coffre-fort. Rien n’est soumis à sa place.

## Offres

| Offre | Prix | Contenu |
|---|---|---|
| Gratuit | 0 | 5 exercices par jour, 1 simulation par mois, pas d’alertes |
| Premium Standard | 9 900 FCFA par mois | exercices illimités, 3 simulations par mois, alertes sur 3 centres, IA de base |
| Premium Pro | 19 900 FCFA par mois | simulations illimitées, alertes illimitées et prioritaires, IA avancée, correcteur humain |
| Pack Réussite | 49 900 FCFA, paiement unique | accès Pro pendant 3 mois et garantie C2 |

Les moyens de paiement sont Orange Money (Web Payment), MTN MoMo (Collection) et Stripe pour la carte bancaire, en XAF.

## Sécurité et RGPD

- **Mots de passe** : hachés avec Argon2id.
- **Sessions** : JWT valable 1 heure, avec rotation des jetons de rafraîchissement.
- **Comptes administrateurs** : la double authentification (TOTP) est obligatoire. Elle est facultative pour les autres comptes.
- **Anti-fraude** : empreinte du navigateur à la connexion et au début de chaque examen, et détection des appareils utilisés par plusieurs comptes.
- **Droits RGPD** : chaque utilisateur peut exporter ses données en JSON ou supprimer son compte (effacement, et anonymisation des paiements).
- **Journal d’audit** : accès au coffre-fort et actions des administrateurs.
- **Protection de l’API** : en-têtes Helmet, CORS restreint et limitation du débit.

## Architecture

```
packages/shared   règles TCF (barèmes, CECRL, NCLC), offres, analyse de texte : partagées par l’API et le site
apps/api          NestJS : PostgreSQL (comptes, sessions, centres, paiements), MongoDB (questions, copies, audio),
                  Redis + BullMQ (correction IA, veille, envoi des alertes), S3/MinIO (fichiers audio)
apps/web          Next.js (App Router) + Tailwind CSS
```

## Démarrage

### Avec Docker (recommandé)

```bash
cp .env.example .env               # renseigner JWT_SECRET, VAULT_KEY, POSTGRES_PASSWORD, S3_SECRET_ACCESS_KEY
docker compose up -d --build
docker compose exec api node dist/db/seed.js   # contenu de démonstration (une seule fois)
```

Le site est alors sur http://localhost:3000 et l’API sur http://localhost:4000/api/health.

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

### Comptes de démonstration

Tous les comptes ont le mot de passe `Demo1234!`.

| E-mail | Rôle |
|---|---|
| etudiant@c2pass.cm | étudiant, offre Gratuit |
| premium@c2pass.cm | étudiant Premium Pro, avec 3 simulations et des alertes |
| correcteur@c2pass.cm | correcteur humain |
| admin@c2pass.cm | administrateur ; la double authentification est configurée à la première connexion |

## Mettre en production

1. **Contenu** : remplacer le contenu de démonstration (102 questions, 8 fiches) par la banque validée par l’expert pédagogique. L’objectif est de 5 000 questions ou plus, ajoutées par l’import JSON du back-office. Ajouter les enregistrements audio des documents de compréhension orale. Sans enregistrement, la voix de synthèse du navigateur lit la transcription une seule fois.
2. **Centres** : renseigner pour chaque centre l’adresse, le téléphone, le lien d’inscription, l’URL surveillée et les motifs à détecter. Volontairement, aucune donnée non vérifiée n’est fournie.
3. **Clés des prestataires** : ajouter les clés OpenAI, LanguageTool, Twilio, WhatsApp Cloud, Orange Money, MTN MoMo, Stripe, Google et Facebook dans `.env`. Chaque service reste en mode démonstration tant que sa clé est absente.
4. **Garder la clé du coffre-fort** : sauvegarder `VAULT_KEY` hors du serveur. Une clé perdue rend les coffres-forts illisibles.
