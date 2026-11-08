import { Controller, Get, Inject } from '@nestjs/common';
import type { Db } from 'mongodb';
import type pg from 'pg';
import { Roles } from '../../common/auth.js';
import { CONFIG, type Config } from '../../config.js';
import { MONGO, PG } from '../../infra/tokens.js';

/** A processor of personal data, active when its keys are set on this server. */
interface Processor {
  name: string;
  role: string;
  active: boolean;
  /** Outside the region of the data subjects (Central Africa). */
  transfer: boolean;
}

/**
 * Register of processing activities (RGPD art. 30, cahier des charges p. 18). The activities describe what the code
 * actually does; the processors and the counts come from this server, so the register stays true as the platform grows.
 */
@Controller('admin/gdpr')
@Roles('admin')
export class GdprRegisterController {
  constructor(
    @Inject(PG) private readonly pool: pg.Pool,
    @Inject(MONGO) private readonly mongo: Db,
    @Inject(CONFIG) private readonly config: Config,
  ) {}

  @Get('register')
  async register() {
    const c = this.config;
    const p = (name: string, role: string, active: unknown, transfer = true): Processor => ({ name, role, active: !!active, transfer });
    const email = p('Service d’envoi d’e-mails (SMTP)', 'envoi des e-mails', c.NOTIFICATIONS_MODE === 'live' && c.SMTP_URL);
    const storage = p('Stockage de fichiers S3', 'stockage des enregistrements et attestations', c.S3_ENDPOINT && !c.S3_ENDPOINT.includes('s3:8333'));

    const count = async (sql: string) => Number((await this.pool.query<{ n: string }>(sql)).rows[0].n);
    const [accounts, vaults, alerts, payments, refunds, fraud, audit, leads] = await Promise.all([
      count(`SELECT count(*) AS n FROM users WHERE status <> 'deleted'`),
      count('SELECT count(*) AS n FROM candidate_vault'),
      count('SELECT count(*) AS n FROM session_alerts'),
      count('SELECT count(*) AS n FROM payments'),
      count('SELECT count(*) AS n FROM refund_requests WHERE attestation_key IS NOT NULL'),
      count('SELECT count(*) AS n FROM fraud_signals'),
      count('SELECT count(*) AS n FROM audit_logs'),
      count('SELECT count(DISTINCT lower(email)) AS n FROM leads'),
    ]);
    const [writings, recordings] = await Promise.all([
      this.mongo.collection('writing_submissions').estimatedDocumentCount(),
      this.mongo.collection('audio_files').estimatedDocumentCount(),
    ]);

    const activities = [
      {
        id: 'accounts', name: 'Gestion des comptes', purpose: 'Créer et gérer le compte, authentifier, contacter l’utilisateur.',
        legalBasis: 'Exécution du contrat (conditions d’utilisation)',
        subjects: 'Candidats, correcteurs, administrateurs',
        data: 'Nom, prénom, e-mail, pays, ville, téléphone et WhatsApp (facultatifs), mot de passe haché (Argon2id), secret de double authentification chiffré, identifiant Google ou Facebook',
        processors: [email, p('Google', 'connexion avec Google (si choisie)', c.GOOGLE_CLIENT_ID), p('Facebook (Meta)', 'connexion avec Facebook (si choisie)', c.FACEBOOK_APP_ID)],
        retention: 'Tant que le compte existe ; effacement à la suppression du compte (bouton du profil)',
        security: 'HTTPS, mots de passe Argon2id, double authentification obligatoire des administrateurs, jetons de session renouvelés et révocables',
        records: accounts,
      },
      {
        id: 'training', name: 'Préparation et correction', purpose: 'Entraînement, simulations d’examen, correction automatique et humaine, suivi de la progression.',
        legalBasis: 'Exécution du contrat',
        subjects: 'Candidats',
        data: 'Réponses, copies écrites, enregistrements de la voix, transcriptions, scores',
        processors: [
          p('OpenAI', 'correction avancée et transcription de l’oral (sans le nom)', c.OPENAI_API_KEY),
          p('LanguageTool', 'vérification grammaticale (sans le nom)', c.LANGUAGETOOL_URL),
          p('TextRazor', 'analyse du sujet des copies (sans le nom)', c.TEXTRAZOR_API_KEY),
          storage,
        ],
        retention: 'Tant que le compte existe ; effacement à la suppression du compte',
        security: 'Enregistrements chiffrés au repos (S3 SSE-C), accès des correcteurs limité aux copies qui leur sont confiées',
        records: writings + recordings,
      },
      {
        id: 'vault', name: 'Coffre-fort candidat', purpose: 'Garder les informations utiles à l’inscription officielle au TCF, que le candidat recopie lui-même.',
        legalBasis: 'Consentement (le candidat choisit ce qu’il y enregistre)',
        subjects: 'Candidats',
        data: 'Informations d’identité et d’inscription choisies par le candidat (pièce d’identité, adresse…)',
        processors: [],
        retention: 'Jusqu’à leur suppression par le candidat ou la suppression du compte',
        security: 'Chiffrement AES-256-GCM, chaque lecture et écriture est journalisée',
        records: vaults,
      },
      {
        id: 'alerts', name: 'Alertes d’ouverture des sessions', purpose: 'Prévenir le candidat quand un centre ouvre les inscriptions.',
        legalBasis: 'Consentement (centres et canaux choisis par le candidat)',
        subjects: 'Candidats',
        data: 'Centres suivis, canaux choisis, numéro de téléphone, abonnement aux notifications du navigateur',
        processors: [
          p('Twilio', 'SMS', c.TWILIO_ACCOUNT_SID), p('Meta WhatsApp Business', 'messages WhatsApp', c.WHATSAPP_TOKEN),
          p('Services de notification des navigateurs (Google, Apple, Mozilla)', 'notifications', c.VAPID_PUBLIC_KEY), email,
        ],
        retention: 'Jusqu’à la suppression de l’alerte ou du compte',
        security: 'Désinscription en un clic, journal des envois',
        records: alerts,
      },
      {
        id: 'payments', name: 'Paiements, remboursements et garantie C2', purpose: 'Encaisser les offres, rembourser, traiter la garantie C2.',
        legalBasis: 'Exécution du contrat ; obligation légale de conservation comptable',
        subjects: 'Candidats',
        data: 'Offre, montant, moyen de paiement, numéro Mobile Money, motif de remboursement, attestation officielle du TCF (garantie C2)',
        processors: [
          p('Orange Money', 'paiement', c.ORANGE_MONEY_CLIENT_ID, false), p('MTN Mobile Money', 'paiement', c.MTN_MOMO_API_USER, false),
          p('CinetPay', 'paiement', c.CINETPAY_API_KEY, false), p('Stripe', 'paiement par carte', c.STRIPE_SECRET_KEY),
        ],
        retention: 'Paiements : durée légale comptable, anonymisés à la suppression du compte. Attestations et motifs : effacés à la suppression du compte',
        security: 'Aucune donnée de carte conservée ; notifications des prestataires revérifiées auprès d’eux ; décisions des administrateurs journalisées',
        records: payments + refunds,
      },
      {
        id: 'security', name: 'Sécurité et prévention de la fraude', purpose: 'Protéger les comptes, garantir des conditions d’examen loyales, tracer les accès sensibles.',
        legalBasis: 'Intérêt légitime (sécurité du service et loyauté des simulations)',
        subjects: 'Tous les utilisateurs',
        data: 'Adresse IP, empreinte technique du navigateur, sorties de page pendant un examen, journal d’audit',
        processors: [],
        retention: 'Signaux de fraude : effacés à la suppression du compte. Journal d’audit : conservé, adresses IP effacées à la suppression du compte',
        security: 'Consultation réservée aux administrateurs',
        records: fraud + audit,
      },
      {
        id: 'waitlist', name: 'Liste d’attente et bêta privée', purpose: 'Prévenir les personnes intéressées de l’ouverture et leur envoyer une invitation.',
        legalBasis: 'Consentement (inscription volontaire sur la page d’accueil)',
        subjects: 'Prospects',
        data: 'E-mail, pays, code d’invitation envoyé',
        processors: [email],
        retention: '3 ans après l’inscription sur la liste (effacement automatique), ou plus tôt sur demande',
        security: 'Effacement à la demande depuis le back-office, et à la suppression du compte créé avec la même adresse',
        records: leads,
      },
      {
        id: 'backups', name: 'Sauvegardes', purpose: 'Pouvoir restaurer le service après un incident.',
        legalBasis: 'Intérêt légitime (continuité et sécurité du service)',
        subjects: 'Tous les utilisateurs',
        data: 'Copie de l’ensemble des données ci-dessus',
        processors: [p('Stockage de sauvegardes hors site (S3)', 'copie chiffrée hors du serveur', !!process.env.BACKUP_S3_BUCKET)],
        retention: '14 jours sur le serveur ; hors site selon la règle de cycle de vie du stockage',
        security: 'Chiffrées (AES-256) avec une phrase secrète gardée hors du serveur ; test de restauration chaque mois',
        records: null,
      },
    ];
    return { generatedAt: new Date(), activities };
  }
}
