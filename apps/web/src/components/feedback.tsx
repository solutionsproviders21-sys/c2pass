import { CheckCircle2, PenLine, Sparkles, UserCheck } from 'lucide-react';
import type { Feedback, HumanReview } from '@/lib/types';
import { Badge, Card } from './ui';

const ENGINE_LABEL: Record<string, string> = { metrics: 'Analyse lexicale', languagetool: 'LanguageTool', llm: 'IA GPT-4', textrazor: 'TextRazor' };

export function ScorePill({ score, max = 20 }: { score: number | null; max?: number }) {
  if (score === null) return <Badge tone="gray">En attente</Badge>;
  const ratio = score / max;
  return <Badge tone={ratio >= 0.8 ? 'ok' : ratio >= 0.5 ? 'gold' : 'maple'} className="text-sm">{score}/{max}</Badge>;
}

export function FeedbackPanel({ feedback, humanReview, status }: { feedback: Feedback | null; humanReview?: HumanReview | null; status?: string }) {
  return (
    <div className="space-y-4">
      {humanReview && (
        <Card className="border-ok-600/30 bg-ok-50/40">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 font-semibold text-navy-900"><UserCheck className="h-4 w-4 text-ok-600" /> Correction d’un correcteur certifié</p>
            <ScorePill score={humanReview.score} />
          </div>
          <p className="mt-2 whitespace-pre-line text-sm text-ink">{humanReview.comment}</p>
        </Card>
      )}
      {!feedback && status === 'awaiting_review' && (
        <Card><p className="text-sm text-muted">Votre enregistrement est en file d’attente pour un correcteur humain. Vous serez noté dès sa correction.</p></Card>
      )}
      {!feedback && status === 'pending' && <Card><p className="text-sm text-muted">Correction en cours…</p></Card>}
      {feedback && (
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2 font-semibold text-navy-900"><Sparkles className="h-4 w-4 text-maple-600" /> Correction automatique</p>
            <div className="flex items-center gap-2">
              {feedback.cefr && <Badge>{feedback.cefr}</Badge>}
              <ScorePill score={feedback.score} />
            </div>
          </div>
          <p className="mt-3 text-sm leading-relaxed">{feedback.summary}</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {feedback.strengths.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ok-600">Points forts</p>
                <ul className="space-y-1 text-sm">{feedback.strengths.map((s, i) => <li key={i} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok-600" />{s}</li>)}</ul>
              </div>
            )}
            {feedback.improvements.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-maple-700">Pour viser C2</p>
                <ul className="space-y-1 text-sm">{feedback.improvements.map((s, i) => <li key={i} className="flex gap-2"><PenLine className="mt-0.5 h-4 w-4 shrink-0 text-maple-600" />{s}</li>)}</ul>
              </div>
            )}
          </div>
          {feedback.corrections.length > 0 && (
            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Corrections ({feedback.corrections.length})</p>
              <ul className="divide-y divide-line rounded-lg border border-line text-sm">
                {feedback.corrections.slice(0, 20).map((c, i) => (
                  <li key={i} className="p-3">
                    <span className="rounded bg-maple-50 px-1 text-maple-700 line-through">{c.excerpt}</span>
                    {c.suggestion && <> → <span className="rounded bg-ok-50 px-1 font-medium text-ok-600">{c.suggestion}</span></>}
                    <p className="mt-1 text-xs text-muted">{c.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-xs text-muted">
            Moteurs : {feedback.engine.map((e) => ENGINE_LABEL[e] ?? e).join(' · ')}
            {!feedback.engine.includes('llm') && ' · score indicatif : sans IA, la pertinence par rapport au sujet et la grammaire ne sont pas évaluées (note plafonnée). L’IA avancée est incluse dans Premium Pro.'}
          </p>
        </Card>
      )}
    </div>
  );
}
