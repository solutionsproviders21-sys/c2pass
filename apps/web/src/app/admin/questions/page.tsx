'use client';

import { useRef, useState } from 'react';
import { FileUp, Music, Pencil, Plus, Trash2 } from 'lucide-react';
import { LEVELS, SKILLS, type Level, type Skill } from '@c2pass/shared';
import { Badge, Button, Card, ErrorNotice, Field, Input, Notice, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { RequireAuth } from '@/components/require-auth';
import { api, qs } from '@/lib/api';
import { useAction, useLoad } from '@/lib/hooks';
import { SKILL_META } from '@/lib/format';

interface Question {
  id: string; skill: Skill; level: Level; type: 'mcq' | 'writing' | 'speaking'; theme: string; statement: string;
  context?: string | null; transcript?: string | null; audioKey?: string | null; options?: string[]; correctAnswer?: number;
  distractors?: string[]; explanation?: string; task?: number; set?: number; active: boolean;
}
type Count = { _id: { skill: Skill; level: Level }; n: number };

function QuestionsAdmin() {
  const [skill, setSkill] = useState('');
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const list = useLoad(() => api.get<Question[]>(`/admin/questions${qs({ skill, level, q })}`), [skill, level, q]);
  const counts = useLoad(() => api.get<Count[]>('/admin/questions/stats'));
  const [editing, setEditing] = useState<Partial<Question> | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const action = useAction();
  const fileRef = useRef<HTMLInputElement>(null);
  const [audioFor, setAudioFor] = useState<string | null>(null);

  const total = (counts.data ?? []).reduce((a, c) => a + c.n, 0);
  const reloadAll = async () => { await list.reload(); await counts.reload(); };

  return (
    <>
      <PageHeader title="Banque de questions" subtitle={`${total} questions actives · objectif 5 000+ (CO et CE calibrées A1 à C2, sujets EE et EO).`}
        actions={<><Button variant="secondary" onClick={() => setImportOpen(true)}><FileUp className="h-4 w-4" />Importer (JSON)</Button><Button onClick={() => setEditing({ skill: 'CE', level: 'B2', type: 'mcq', theme: 'Général', options: ['', '', '', ''], correctAnswer: 0, active: true })}><Plus className="h-4 w-4" />Nouvelle question</Button></>} />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SKILLS.map((s) => (
          <Card key={s} className="p-3">
            <p className="text-xs font-semibold text-muted">{SKILL_META[s].label}</p>
            <div className="mt-1 flex flex-wrap gap-1">{LEVELS.map((l) => <Badge key={l} tone="gray">{l} {(counts.data ?? []).find((c) => c._id.skill === s && c._id.level === l)?.n ?? 0}</Badge>)}</div>
          </Card>
        ))}
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        <Select value={skill} onChange={(e) => setSkill(e.target.value)} className="w-auto"><option value="">Toutes compétences</option>{SKILLS.map((s) => <option key={s}>{s}</option>)}</Select>
        <Select value={level} onChange={(e) => setLevel(e.target.value)} className="w-auto"><option value="">Tous niveaux</option>{LEVELS.map((l) => <option key={l}>{l}</option>)}</Select>
        <Input placeholder="Rechercher…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs" />
      </div>
      {info && <div className="mb-3"><Notice tone="ok">{info}</Notice></div>}
      <ErrorNotice error={action.error ?? list.error} />
      <input ref={fileRef} type="file" accept="audio/*" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0];
        if (!file || !audioFor) return;
        const form = new FormData();
        form.append('audio', file);
        const r = await action.run(() => api.post(`/admin/questions/${encodeURIComponent(audioFor)}/audio`, form));
        if (r) { setInfo(`Enregistrement ajouté à ${audioFor} : il remplace la voix de synthèse.`); await list.reload(); }
        e.target.value = '';
      }} />
      {list.loading ? <Spinner /> : (
        <div className="overflow-x-auto rounded-xl border border-line bg-white">
          <table className="w-full text-sm">
            <thead className="bg-navy-50 text-left text-xs uppercase text-muted"><tr><th className="px-3 py-2">Id</th><th className="px-3 py-2">Niveau</th><th className="px-3 py-2">Énoncé</th><th className="px-3 py-2">Thème</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {(list.data ?? []).map((x) => (
                <tr key={x.id} className={`border-t border-line ${x.active ? '' : 'opacity-50'}`}>
                  <td className="px-3 py-2 font-mono text-xs">{x.id}</td>
                  <td className="px-3 py-2"><Badge>{x.skill}</Badge> <Badge tone="gray">{x.level}</Badge>{x.task && <Badge tone="gold" className="ml-1">T{x.task}</Badge>}</td>
                  <td className="max-w-md truncate px-3 py-2">{x.statement}</td>
                  <td className="px-3 py-2 text-muted">{x.theme}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {x.skill === 'CO' && <Button size="sm" variant="ghost" title={x.audioKey ? 'Remplacer l’enregistrement' : 'Ajouter un enregistrement'} onClick={() => { setAudioFor(x.id); fileRef.current?.click(); }}><Music className={`h-4 w-4 ${x.audioKey ? 'text-ok-600' : ''}`} /></Button>}
                    <Button size="sm" variant="ghost" onClick={() => setEditing(x)}><Pencil className="h-4 w-4" /></Button>
                    {x.active && <Button size="sm" variant="ghost" onClick={async () => { await action.run(async () => { await api.del(`/admin/questions/${encodeURIComponent(x.id)}`); return true; }); await reloadAll(); }}><Trash2 className="h-4 w-4" /></Button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <QuestionForm initial={editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await reloadAll(); }} />}
      {importOpen && <ImportForm onClose={() => setImportOpen(false)} onDone={async (msg) => { setImportOpen(false); setInfo(msg); await reloadAll(); }} />}
    </>
  );
}

function QuestionForm({ initial, onClose, onSaved }: { initial: Partial<Question>; onClose: () => void; onSaved: () => Promise<void> }) {
  const [f, setF] = useState<Partial<Question>>({ ...initial, options: initial.options ?? ['', '', '', ''], distractors: initial.distractors ?? ['', '', '', ''] });
  const action = useAction();
  const mcq = f.skill === 'CO' || f.skill === 'CE';

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      id: initial.id, skill: f.skill, level: f.level, type: mcq ? 'mcq' : f.skill === 'EE' ? 'writing' : 'speaking', theme: f.theme || 'Général', statement: f.statement,
      context: f.context || null, transcript: f.skill === 'CO' ? f.transcript || null : undefined, active: f.active ?? true,
      ...(mcq ? { options: f.options, correctAnswer: f.correctAnswer ?? 0, distractors: f.distractors, explanation: f.explanation || undefined } : { task: f.task ?? 1, set: f.set }),
    };
    const r = await action.run(() => (initial.id ? api.put(`/admin/questions/${encodeURIComponent(initial.id)}`, body) : api.post('/admin/questions', body)));
    if (r) await onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/60 px-4 py-10">
      <Card className="mx-auto max-w-3xl">
        <p className="text-lg font-bold text-navy-900">{initial.id ? `Modifier ${initial.id}` : 'Nouvelle question'}</p>
        <form onSubmit={save} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Compétence"><Select value={f.skill} onChange={(e) => setF({ ...f, skill: e.target.value as Skill })} disabled={!!initial.id}>{SKILLS.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Niveau"><Select value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as Level })}>{LEVELS.map((l) => <option key={l}>{l}</option>)}</Select></Field>
            <Field label="Thème"><Input value={f.theme ?? ''} onChange={(e) => setF({ ...f, theme: e.target.value })} /></Field>
            {!mcq && <Field label="Tâche"><Select value={f.task ?? 1} onChange={(e) => setF({ ...f, task: Number(e.target.value) })}>{[1, 2, 3].map((t) => <option key={t}>{t}</option>)}</Select></Field>}
          </div>
          <Field label="Énoncé / consigne"><Textarea rows={2} required value={f.statement ?? ''} onChange={(e) => setF({ ...f, statement: e.target.value })} /></Field>
          {f.skill === 'CO' && <Field label="Transcription (lue par la voix de synthèse tant qu’aucun enregistrement n’est ajouté)"><Textarea rows={4} required value={f.transcript ?? ''} onChange={(e) => setF({ ...f, transcript: e.target.value })} /></Field>}
          {f.skill !== 'CO' && <Field label={f.skill === 'CE' ? 'Texte support' : 'Documents / contexte (facultatif)'}><Textarea rows={5} value={f.context ?? ''} onChange={(e) => setF({ ...f, context: e.target.value })} /></Field>}
          {mcq && (
            <div className="space-y-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="grid gap-2 sm:grid-cols-[auto_1fr_1fr]">
                  <label className="flex items-center gap-1 text-sm"><input type="radio" name="correct" checked={(f.correctAnswer ?? 0) === i} onChange={() => setF({ ...f, correctAnswer: i })} />{'ABCD'[i]}</label>
                  <Input required placeholder={`Réponse ${'ABCD'[i]}`} value={f.options?.[i] ?? ''} onChange={(e) => { const o = [...(f.options ?? [])]; o[i] = e.target.value; setF({ ...f, options: o }); }} />
                  <Input placeholder="Pourquoi c’est faux (piège)" disabled={(f.correctAnswer ?? 0) === i} value={f.distractors?.[i] ?? ''} onChange={(e) => { const d = [...(f.distractors ?? [])]; d[i] = e.target.value; setF({ ...f, distractors: d }); }} />
                </div>
              ))}
              <Field label="Explication"><Textarea rows={2} value={f.explanation ?? ''} onChange={(e) => setF({ ...f, explanation: e.target.value })} /></Field>
            </div>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active ?? true} onChange={(e) => setF({ ...f, active: e.target.checked })} />Active</label>
          <ErrorNotice error={action.error} />
          <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Annuler</Button><Button type="submit" busy={action.busy}>Enregistrer</Button></div>
        </form>
      </Card>
    </div>
  );
}

const SAMPLE = `[
  {
    "skill": "CE", "level": "C1", "type": "mcq", "theme": "Société",
    "statement": "Quelle est l’attitude de l’auteur ?",
    "context": "Texte…",
    "options": ["Enthousiaste", "Réservée", "Indifférente", "Hostile"],
    "correctAnswer": 1,
    "explanation": "Les modalisateurs « certes », « sans doute » marquent la réserve."
  }
]`;

function ImportForm({ onClose, onDone }: { onClose: () => void; onDone: (msg: string) => Promise<void> }) {
  const [json, setJson] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const action = useAction();
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-navy-950/60 px-4 py-10">
      <Card className="mx-auto max-w-3xl">
        <p className="text-lg font-bold text-navy-900">Importer des questions</p>
        <p className="mt-1 text-sm text-muted">Tableau JSON (1 000 questions maximum par import). Une question avec un « id » existant est mise à jour.</p>
        <Textarea rows={14} className="mt-3 font-mono text-xs" placeholder={SAMPLE} value={json} onChange={(e) => { setParseError(null); setJson(e.target.value); }} />
        <div className="mt-3 space-y-2">{parseError && <Notice tone="error">{parseError}</Notice>}<ErrorNotice error={action.error} /></div>
        <div className="mt-3 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Annuler</Button>
          <Button busy={action.busy} onClick={async () => {
            let items: unknown;
            try { items = JSON.parse(json); } catch { setParseError('JSON invalide.'); return; }
            const r = await action.run(() => api.post<{ inserted: number; updated: number }>('/admin/questions/import', items));
            if (r) await onDone(`${r.inserted} question(s) ajoutée(s), ${r.updated} mise(s) à jour.`);
          }}>Importer</Button>
        </div>
      </Card>
    </div>
  );
}

export default function QuestionsAdminPage() {
  return <RequireAuth roles={['admin']}><QuestionsAdmin /></RequireAuth>;
}
