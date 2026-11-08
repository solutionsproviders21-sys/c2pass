import type { Metadata } from 'next';
import { H2, LegalPage, List } from '@/components/legal-page';
import { LEGAL } from '@/lib/legal';

export const metadata: Metadata = { title: 'Politique de confidentialité', alternates: { canonical: '/confidentialite' } };

export default function Privacy() {
  return (
    <LegalPage title="Politique de confidentialité">
      <p>
        Cette politique explique quelles données C2Pass collecte, pourquoi, combien de temps elles sont gardées et comment exercer vos droits.
        Responsable du traitement : {LEGAL.company}, {LEGAL.address}. Contact : <a className="underline" href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>.
      </p>
      <H2>Données collectées et usages</H2>
      <List>
        <li><strong>Compte</strong> : nom, prénom, e-mail, pays, ville, téléphone et WhatsApp (facultatifs), mot de passe (stocké sous forme hachée, jamais en clair). Pour gérer votre compte et vous contacter.</li>
        <li><strong>Préparation</strong> : réponses, copies écrites, enregistrements de votre voix pendant l’expression orale, scores. Pour vous corriger, suivre votre progression et, selon l’offre, permettre la correction par un correcteur humain.</li>
        <li><strong>Coffre-fort candidat</strong> : informations utiles à l’inscription au TCF (pièce d’identité, adresse…) que vous choisissez d’y enregistrer. Elles sont chiffrées (AES-256-GCM) et chaque consultation est journalisée. Nous ne les transmettons à personne : c’est vous qui les copiez dans le formulaire officiel.</li>
        <li><strong>Alertes</strong> : centres suivis et canaux choisis (e-mail, SMS, WhatsApp, notifications). Pour vous prévenir de l’ouverture des inscriptions.</li>
        <li><strong>Paiements</strong> : offre, montant, moyen de paiement, numéro Mobile Money utilisé. Aucune donnée de carte n’est conservée par C2Pass.</li>
        <li><strong>Sécurité et prévention de la fraude</strong> : adresse IP, empreinte technique du navigateur, sorties de page pendant un examen, journal des actions sensibles.</li>
      </List>
      <H2>Sous-traitants</H2>
      <p>Selon les fonctions utilisées, certaines données sont transmises aux prestataires suivants, uniquement pour rendre le service :</p>
      <List>
        <li>OpenAI (correction avancée des copies et transcription de l’oral) et LanguageTool (vérification grammaticale) : le texte de vos copies et l’audio de l’oral, sans votre nom.</li>
        <li>Twilio (SMS) et Meta WhatsApp Business : votre numéro et le texte de l’alerte.</li>
        <li>Orange Money, MTN Mobile Money, CinetPay, Stripe : les informations nécessaires au paiement.</li>
        <li>Google et Facebook, si vous choisissez de vous connecter avec eux : votre identifiant, nom et e-mail.</li>
        <li>Notre hébergeur ({LEGAL.host}) et le service d’envoi d’e-mails.</li>
      </List>
      <p>Certains de ces prestataires sont situés hors d’Afrique centrale ; les transferts sont limités au strict nécessaire.</p>
      <H2>Durées de conservation</H2>
      <List>
        <li>Données du compte, de préparation, du coffre-fort et enregistrements : tant que le compte existe. Ils sont effacés à sa suppression.</li>
        <li>Paiements : conservés de façon anonymisée pendant la durée légale de conservation comptable.</li>
        <li>Journal de sécurité : conservé pour la sécurité du service ; les adresses IP qui vous concernent sont effacées à la suppression du compte.</li>
      </List>
      <H2>Cookies et stockage local</H2>
      <p>
        C2Pass n’utilise ni publicité ni outil de suivi. Votre session est gardée dans le stockage local de votre navigateur, et un cookie technique temporaire sécurise
        la connexion par Google ou Facebook. Aucun consentement n’est donc demandé pour des traceurs.
      </p>
      <H2>Vos droits</H2>
      <p>
        Vous pouvez à tout moment, depuis votre profil, exporter toutes vos données (fichier JSON) et supprimer votre compte. Pour rectifier une information, vous opposer à un
        traitement ou poser une question, écrivez à <a className="underline" href={`mailto:${LEGAL.privacyEmail}`}>{LEGAL.privacyEmail}</a>. Vous pouvez aussi saisir l’autorité
        de protection des données de votre pays.
      </p>
      <H2>Sécurité</H2>
      <p>
        Connexions chiffrées (HTTPS), mots de passe hachés (Argon2id), coffre-fort chiffré, double authentification obligatoire pour les administrateurs, journal d’audit des
        accès sensibles.
      </p>
    </LegalPage>
  );
}
