import type { AlertChannel, CentreStatus, Level, Plan, PlanId, Skill } from '@c2pass/shared';

export type Role = 'student' | 'teacher' | 'admin';

export interface Me {
  id: string;
  email: string;
  role: Role;
  totpEnabled: boolean;
  planId: PlanId;
  planExpiresAt: string | null;
  c2GuaranteeUntil: string | null;
  createdAt: string;
  hasPassword: boolean;
  emailVerified: boolean;
  google: boolean;
  facebook: boolean;
  firstName: string | null;
  lastName: string | null;
  country: string | null;
  city: string | null;
  phone: string | null;
  whatsapp: string | null;
  targetScore: string;
  examDate: string | null;
  marketingConsent: boolean;
  plan: Plan;
  planActive: boolean;
}

export interface Tokens { accessToken: string; refreshToken: string }
export type LoginResult =
  | Tokens
  | { totpRequired: true; challengeId: string }
  | { totpSetupRequired: true; challengeId: string; secret: string; otpauthUrl: string };

export interface SkillScore { score: number | null; max: number; cefr: string | null; nclc: number | null; progress: number | null; pending?: boolean }

export interface Dashboard {
  firstName: string;
  target: string;
  examDate: string | null;
  overallProgress: number;
  skills: { skill: Skill; score: number | null; max: number; cefr: string | null; nclc: number | null; progress: number; practice: { answered: number; accuracy: number | null; last7Days: number } }[];
  history: { id: string; type: string; totalScore: number | null; completedAt: string; scores: Partial<Record<Skill, SkillScore>> }[];
  recent: { kind: 'simulation' | 'exercise'; ref: string; label: string; score: number | null; at: string }[];
  nextSession: { id: string; name: string; city: string; country: string; status: CentreStatus; nextSessionDate: string; seatsLeft: number | null } | null;
  unreadAlerts: number;
  quota: { plan: PlanId; exercisesPerDay: number | null; exercisesToday: number; simulationsPerMonth: number | null; simulationsThisMonth: number };
  tip: string;
}

export interface PublicQuestion {
  id: string;
  skill: Skill;
  level: Level;
  type: 'mcq' | 'writing' | 'speaking';
  theme: string;
  statement: string;
  context: string | null;
  options: string[];
  task: number | null;
  hasAudio: boolean;
  hasRecording: boolean;
}

export interface AnswerResult { correct: boolean; correctAnswer: number; explanation: string | null; whyWrong: string | null; transcript: string | null }

export interface Feedback {
  score: number | null;
  cefr: string | null;
  summary: string;
  strengths: string[];
  improvements: string[];
  corrections: { excerpt: string; suggestion: string; message: string }[];
  engine: string[];
}

export interface HumanReview { score: number; comment: string; at: string }

export interface WritingResult {
  id: string; kind: 'writing'; status: string; task: number; text: string; wordCount: number;
  bounds: { minWords: number; maxWords: number; title: string };
  metrics: { wordCount?: number; lexicalDiversity?: number; advancedConnectors?: string[]; basicConnectors?: string[]; complexStructures?: number; avgSentenceLength?: number } | null;
  score: number | null; feedback: Feedback | null; humanReview: HumanReview | null; createdAt: string;
}

export interface SpeakingResult {
  id: string; kind: 'speaking'; status: string; task: number; transcription: string | null;
  score: number | null; feedback: Feedback | null; humanReview: HumanReview | null; createdAt: string;
}

export interface ExamQuestion extends PublicQuestion { answered: number | null; played: boolean; draft: string | null; recorded: boolean }

export interface ExamState {
  id: string;
  type: 'full' | 'section';
  status: 'created' | 'in_progress' | 'evaluating' | 'completed' | 'abandoned';
  sections: { skill: Skill; items: number; minutes: number; state: 'locked' | 'current' | 'done' }[];
  startedAt: string | null;
  completedAt: string | null;
  current: null | { skill: Skill; index: number; deadline: string; remainingSeconds: number; questions: ExamQuestion[] };
}

export interface SessionSummary {
  id: string; type: 'full' | 'section'; skills: Skill[]; status: ExamState['status'];
  scores: Partial<Record<Skill, SkillScore>>; totalScore: number | null; startedAt: string | null; completedAt: string | null; createdAt: string;
}

export interface McqReview { id: string; level: Level; statement: string; context: string | null; transcript: string | null; options: string[]; correctAnswer: number; choice: number | null; correct: boolean; explanation: string | null }
export interface TaskReview { id: string; task: number; statement: string; text: string | null; wordCount: number | null; transcription: string | null; status: string; score: number | null; feedback: Feedback | null; humanReview: HumanReview | null }

export interface ExamResult {
  id: string; type: 'full' | 'section'; status: ExamState['status'];
  scores: Partial<Record<Skill, SkillScore>>; totalScore: number | null; startedAt: string | null; completedAt: string | null;
  review: Partial<Record<Skill, (McqReview | TaskReview)[]>>;
}

export interface Centre {
  id: string; name: string; country: string; city: string; address: string | null; lat: number | null; lng: number | null;
  phone: string | null; email: string | null; website: string | null; bookingUrl: string | null; priceXaf: number | null;
  status: CentreStatus; nextSessionDate: string | null; seatsLeft: number | null; updatedAt: string; lastCheckedAt: string | null;
  watchUrl?: string | null; watchOpenPattern?: string | null; watchFullPattern?: string | null; lastCheckResult?: string | null;
}

export interface AlertSubscription {
  id: string; centreId: string; channels: AlertChannel[]; status: 'active' | 'paused'; lastNotifiedAt: string | null; createdAt: string;
  centreName: string; city: string; country: string; centreStatus: CentreStatus; nextSessionDate: string | null;
}

export interface AppNotification { id: string; centreId: string | null; title: string; body: string; url: string | null; readAt: string | null; createdAt: string }

export interface Payment {
  id: string; planId: PlanId; amount: number; currency: string; method: 'orange_money' | 'mtn_momo' | 'stripe';
  status: 'pending' | 'succeeded' | 'failed' | 'refunded'; checkoutUrl: string | null; createdAt: string; confirmedAt: string | null;
}

export interface Course { id: string; skill: Skill | 'GRAM'; level: string; title: string; summary: string }
export interface CourseDetail extends Course { sections: { heading: string; body: string }[]; lexicon: { term: string; definition: string; example: string }[] }

export type VaultData = Partial<Record<
  'lastName' | 'firstName' | 'birthDate' | 'birthPlace' | 'nationality' | 'gender' | 'passportNumber' | 'passportExpiry'
  | 'address' | 'city' | 'phone' | 'email' | 'motherTongue' | 'examReason', string>>;
