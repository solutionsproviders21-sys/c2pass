'use client';

import { useState } from 'react';
import { ArrowRight, Bell, BookOpen, Brain, CheckCircle2, Headphones, MapPin, Mic, PenLine, ShieldCheck, Timer } from 'lucide-react';
import { COUNTRIES, PLANS } from '@c2pass/shared';
import { PublicFooter, PublicHeader } from '@/components/public-header';
import { MapleLeaf } from '@/components/logo';
import { Button, Card, ErrorNotice, Input, LinkButton, Notice, Select } from '@/components/ui';
import { api } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { money } from '@/lib/format';

const SKILLS = [
  { icon: Headphones, title: 'Compréhension orale', text: '39 questions en 35 minutes, écoute unique comme le jour J.' },
  { icon: BookOpen, title: 'Compréhension écrite', text: '39 questions en 60 minutes, des textes A1 aux registres soutenus C2.' },
  { icon: PenLine, title: 'Expression écrite', text: '3 tâches corrigées par IA : richesse lexicale, connecteurs, structures complexes.' },
  { icon: Mic, title: 'Expression orale', text: 'Enregistrement depuis le navigateur, transcription et note sur 20.' },
];

export default function Landing() {
  const [email, setEmail] = useState('');
  const [country, setCountry] = useState('CM');
  const [done, setDone] = useState(false);
  const lead = useAction();
  const beta = !!useLoad(() => api.get<{ inviteOnly: boolean }>('/auth/signup')).data?.inviteOnly;

  return (
    <>
      <PublicHeader />
      <main>
        <section className="relative overflow-hidden bg-navy-900 text-white">
          <MapleLeaf className="pointer-events-none absolute -right-24 -top-16 h-[480px] w-[480px] text-white/[0.04]" />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
            <div>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-gold-500">
                <MapleLeaf className="h-3.5 w-3.5 text-maple-500" /> TCF Canada · Afrique centrale
              </p>
              <h1 className="h-serif text-4xl font-bold leading-tight sm:text-5xl">
                Visez le niveau <span className="text-maple-500">C2</span> au TCF Canada, et ne ratez plus l’ouverture des inscriptions.
              </h1>
              <p className="mt-5 max-w-xl text-lg text-navy-100/80">
                Entraînement par compétence, simulateur en conditions réelles, correction par intelligence artificielle et alertes en temps réel dès qu’un centre ouvre ses places à Yaoundé, Douala, Libreville ou Brazzaville.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <LinkButton href="/inscription" size="lg">Commencer gratuitement <ArrowRight className="h-4 w-4" /></LinkButton>
                <LinkButton href="/centres" size="lg" variant="secondary">Voir les centres d’examen</LinkButton>
              </div>
              <p className="mt-4 text-sm text-navy-100/60">Gratuit : 5 exercices par jour et 1 simulation complète par mois, sans carte bancaire.</p>
            </div>
            <Card className="self-center border-white/10 bg-white text-ink">
              <p className="text-sm font-semibold text-muted">Exemple de résultat de simulation</p>
              <div className="mt-4 space-y-3">
                {[['CO', 612, 699, 'C2'], ['CE', 584, 699, 'C1'], ['EE', 15, 20, 'C1'], ['EO', 16, 20, 'C2']].map(([s, v, m, l]) => (
                  <div key={s as string}>
                    <div className="flex justify-between text-sm"><span className="font-semibold">{s}</span><span>{v}/{m} · <b className="text-maple-600">{l}</b></span></div>
                    <div className="mt-1 h-2 rounded-full bg-slate-100"><div className="h-2 rounded-full bg-maple-600" style={{ width: `${((v as number) / (m as number)) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
              <p className="mt-4 rounded-lg bg-gold-50 p-3 text-sm text-[#7a560a]">« Remplacez “il y a beaucoup de problèmes” par “de nombreuses difficultés se posent” : le correcteur C2 valorise la précision. »</p>
            </Card>
          </div>
        </section>

        <section id="methode" className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="h-serif text-3xl font-bold text-navy-900">Les quatre épreuves, travaillées une par une</h2>
          <p className="mt-2 max-w-2xl text-muted">Une banque de questions calibrée de A1 à C2, avec explication de chaque réponse et des fiches de méthode.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SKILLS.map((s) => (
              <Card key={s.title}>
                <s.icon className="h-6 w-6 text-maple-600" />
                <p className="mt-3 font-semibold text-navy-900">{s.title}</p>
                <p className="mt-1 text-sm text-muted">{s.text}</p>
              </Card>
            ))}
          </div>
        </section>

        <section id="simulateur" className="bg-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2">
            <div>
              <Timer className="h-8 w-8 text-maple-600" />
              <h2 className="h-serif mt-3 text-3xl font-bold text-navy-900">Un simulateur aussi strict que l’examen</h2>
              <ul className="mt-5 space-y-3 text-sm">
                {['Chronomètre verrouillé : la section se ferme toute seule à la fin du temps.', 'Écoute unique des documents sonores, sans retour en arrière.', 'Copier-coller désactivé et sortie du plein écran signalée.', 'Enregistrement de la voix directement dans le navigateur.', 'Score sur l’échelle officielle 100–699 et /20, avec équivalence NCLC.'].map((t) => (
                  <li key={t} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Card><Brain className="h-6 w-6 text-navy-700" /><p className="mt-2 font-semibold">IA calibrée C2</p><p className="mt-1 text-sm text-muted">GPT-4 et LanguageTool notent votre texte et proposent des reformulations de niveau C2.</p></Card>
              <Card><Bell className="h-6 w-6 text-navy-700" /><p className="mt-2 font-semibold">Alertes places</p><p className="mt-1 text-sm text-muted">E-mail, SMS et WhatsApp dès qu’un centre ouvre ses inscriptions.</p></Card>
              <Card><MapPin className="h-6 w-6 text-navy-700" /><p className="mt-2 font-semibold">Carte des centres</p><p className="mt-1 text-sm text-muted">Statut Ouvert, Fermé ou Complet, tarifs et prochaines sessions.</p></Card>
              <Card><ShieldCheck className="h-6 w-6 text-navy-700" /><p className="mt-2 font-semibold">100 % légal</p><p className="mt-1 text-sm text-muted">Aucun robot de réservation : vous vous inscrivez vous-même, plus vite grâce au coffre-fort.</p></Card>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 className="h-serif text-3xl font-bold text-navy-900">Des offres pensées pour l’Afrique centrale</h2>
            <LinkButton href="/tarifs" variant="secondary">Comparer les offres</LinkButton>
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-4">
            {Object.values(PLANS).map((p) => (
              <Card key={p.id} className={p.id === 'pro' ? 'border-maple-600 ring-1 ring-maple-600' : ''}>
                <p className="font-semibold text-navy-900">{p.name}</p>
                <p className="mt-2 text-2xl font-bold">{p.priceXaf ? money(p.priceXaf) : 'Gratuit'}</p>
                <p className="text-xs text-muted">{p.billing === 'monthly' ? 'par mois' : p.billing === 'one_time' ? 'paiement unique, 3 mois' : 'pour toujours'}</p>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-sm text-muted">Paiement par Orange Money, MTN Mobile Money, CinetPay ou carte bancaire.</p>
        </section>

        <section id="liste-attente" className="bg-navy-50">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center">
            <h2 className="h-serif text-3xl font-bold text-navy-900">{beta ? 'Rejoignez la liste d’attente de la bêta privée' : 'Recevez nos conseils et les dates des prochaines sessions'}</h2>
            <p className="mt-2 text-muted">{beta ? 'Les places de la bêta sont limitées : nous vous envoyons votre code d’invitation par e-mail dès qu’une place se libère.' : 'Une lettre courte, deux fois par mois. Désinscription en un clic.'}</p>
            {done ? (
              <div className="mx-auto mt-6 max-w-md"><Notice tone="ok" title="Merci !">{beta ? 'Vous êtes sur la liste d’attente. Votre invitation arrivera par e-mail.' : 'Vous recevrez nos prochaines informations.'}</Notice></div>
            ) : (
              <form
                className="mx-auto mt-6 flex max-w-xl flex-col gap-2 sm:flex-row"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const ok = await lead.run(() => api.post('/leads', { email, country, source: 'landing' }));
                  if (ok) setDone(true);
                }}
              >
                <Input type="email" required placeholder="votre@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                <Select value={country} onChange={(e) => setCountry(e.target.value)} className="sm:w-48">
                  {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                </Select>
                <Button busy={lead.busy} type="submit">{beta ? 'Rejoindre la liste' : 'Je m’inscris'}</Button>
              </form>
            )}
            <div className="mx-auto mt-3 max-w-xl"><ErrorNotice error={lead.error} /></div>
          </div>
        </section>
      </main>
      <PublicFooter />
    </>
  );
}
