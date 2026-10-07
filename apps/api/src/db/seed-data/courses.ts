import type { Skill } from '@c2pass/shared';

export interface SeedCourse {
  slug: string;
  skill: Skill | 'GRAM';
  level: string;
  title: string;
  summary: string;
  sections: { heading: string; body: string }[];
  lexicon?: { term: string; definition: string; example: string }[];
}

/** Fiches de cours (module 1.B : mode entraînement thématique). */
export const COURSES: SeedCourse[] = [
  {
    slug: 'methodo-ce', skill: 'CE', level: 'B1-C2', title: 'Méthode : réussir la compréhension écrite',
    summary: '39 questions en 60 minutes, de A1 à C2 : gérer son temps et repérer les pièges.',
    sections: [
      { heading: 'Le format', body: 'Les questions sont classées par difficulté croissante. Les premières (A1–A2) doivent prendre moins d’une minute ; gardez du temps pour les textes C1–C2, plus longs et plus implicites.' },
      { heading: 'Lire la question avant le texte', body: 'Identifiez ce qui est demandé (idée principale, détail, ton, sens d’une expression) puis lisez le texte avec cet objectif.' },
      { heading: 'Les distracteurs', body: 'Les mauvaises réponses reprennent souvent des mots du texte dans un sens différent. Méfiez-vous des options qui contiennent « toujours », « jamais », « totalement » quand le texte nuance.' },
      { heading: 'Repérer les articulations', body: 'Les connecteurs de concession et d’opposition (certes, toutefois, reste que, encore faut-il) annoncent presque toujours l’idée essentielle de l’auteur.' },
    ],
  },
  {
    slug: 'methodo-co', skill: 'CO', level: 'B1-C2', title: 'Méthode : réussir la compréhension orale',
    summary: '39 questions en 35 minutes, une seule écoute par document.',
    sections: [
      { heading: 'Une seule écoute', body: 'Chaque document n’est diffusé qu’une fois. Lisez la question et les quatre options avant de lancer l’écoute pour savoir quoi chercher.' },
      { heading: 'Écouter le sens, pas les mots', body: 'Les réponses correctes reformulent souvent le document (synonymes, paraphrases). Une option qui répète mot pour mot le document est fréquemment un piège.' },
      { heading: 'Ton et intention', body: 'Aux niveaux C1–C2, on vous interroge sur l’opinion ou le ton (ironie, regret, réserve). Soyez attentif à l’intonation et aux marqueurs comme « a beau », « encore faut-il ».' },
    ],
  },
  {
    slug: 'methodo-ee', skill: 'EE', level: 'B2-C2', title: 'Méthode : expression écrite niveau C2',
    summary: 'Trois tâches en 60 minutes ; la tâche 3 (texte argumenté) fait la différence pour le C2.',
    sections: [
      { heading: 'Respecter le nombre de mots', body: 'Tâche 1 : 60–120 mots. Tâche 2 : 120–150 mots. Tâche 3 : 120–180 mots. Un texte trop court ou hors sujet plafonne la note.' },
      { heading: 'Structurer la tâche 3', body: 'Introduction (problématique), présentation du document 1, du document 2, puis votre position nuancée. Utilisez des connecteurs variés : certes… néanmoins ; par voie de conséquence ; nonobstant.' },
      { heading: 'Ce que valorise le correcteur C2', body: 'Richesse lexicale (pas de répétitions), syntaxe complexe maîtrisée (relatives composées, subjonctif), cohérence argumentative et registre adapté.' },
    ],
  },
  {
    slug: 'methodo-eo', skill: 'EO', level: 'B2-C2', title: 'Méthode : expression orale',
    summary: 'Trois tâches en 12 minutes : entretien, interaction, point de vue.',
    sections: [
      { heading: 'Tâche 1 : entretien dirigé', body: 'Présentez-vous de manière fluide : parcours, projets, motivations. Évitez les phrases apprises par cœur, l’examinateur relance.' },
      { heading: 'Tâche 2 : interaction', body: 'Posez des questions variées (inversion, est-ce que, interrogatifs) et reformulez les réponses pour montrer votre compréhension.' },
      { heading: 'Tâche 3 : point de vue', body: 'Annoncez votre position, donnez deux ou trois arguments illustrés d’exemples, envisagez l’objection puis concluez.' },
    ],
  },
  {
    slug: 'subjonctif-imparfait', skill: 'GRAM', level: 'C1-C2', title: 'Le subjonctif imparfait et plus-que-parfait',
    summary: 'Reconnaître et employer les temps littéraires attendus au niveau C2.',
    sections: [
      { heading: 'Formation', body: 'On part du passé simple : il chanta → qu’il chantât ; il fit → qu’il fît ; il fut → qu’il fût. Au pluriel : qu’ils chantassent, qu’ils fissent.' },
      { heading: 'Emploi', body: 'Dans la langue soutenue, après un verbe principal au passé : « Il fallait qu’il partît. » Le plus-que-parfait du subjonctif (qu’il eût chanté) exprime l’antériorité ou remplace le conditionnel passé : « Il eût fallu le dire. »' },
      { heading: 'À l’examen', body: 'En compréhension, sachez les reconnaître. En production, un emploi maîtrisé et ponctuel est un marqueur de niveau C2 ; un emploi fautif pénalise.' },
    ],
  },
  {
    slug: 'concordance-temps', skill: 'GRAM', level: 'B2-C2', title: 'La concordance des temps',
    summary: 'Accorder les temps du discours rapporté et des subordonnées.',
    sections: [
      { heading: 'Discours indirect au passé', body: 'Présent → imparfait (« Il dit qu’il part » → « Il a dit qu’il partait ») ; futur → conditionnel présent ; passé composé → plus-que-parfait.' },
      { heading: 'Subordonnées au subjonctif', body: 'Principale au présent ou futur : subjonctif présent ou passé. Principale au passé : subjonctif imparfait ou plus-que-parfait en registre soutenu, présent ou passé en registre courant.' },
      { heading: 'Hypothèse', body: 'Si + imparfait → conditionnel présent ; si + plus-que-parfait → conditionnel passé. Jamais de conditionnel après « si » hypothétique.' },
    ],
  },
  {
    slug: 'connecteurs-c2', skill: 'GRAM', level: 'C1-C2', title: 'Les connecteurs logiques avancés',
    summary: 'Articuler un raisonnement nuancé : concession, opposition, conséquence.',
    sections: [
      { heading: 'Concession', body: 'Certes… mais ; bien que + subjonctif ; quoique ; quand bien même + conditionnel ; pour + adjectif + que + subjonctif (« pour habile qu’il soit »).' },
      { heading: 'Opposition', body: 'En revanche ; à l’inverse ; nonobstant ; il n’en demeure pas moins que ; toujours est-il que.' },
      { heading: 'Conséquence et conclusion', body: 'Par voie de conséquence ; dès lors ; partant ; si bien que ; en définitive ; somme toute.' },
    ],
    lexicon: [
      { term: 'nonobstant', definition: 'malgré, en dépit de (registre soutenu)', example: 'Nonobstant les critiques, la réforme a été adoptée.' },
      { term: 'par voie de conséquence', definition: 'par conséquent, en conséquence', example: 'Les prix ont augmenté ; par voie de conséquence, la demande a reculé.' },
      { term: 'il n’en demeure pas moins que', definition: 'malgré cela, il reste vrai que', example: 'L’argument est séduisant ; il n’en demeure pas moins qu’il est incomplet.' },
      { term: 'quand bien même', definition: 'même si (+ conditionnel)', example: 'Quand bien même il pleuvrait, nous partirions.' },
    ],
  },
  {
    slug: 'lexique-avance', skill: 'GRAM', level: 'C1-C2', title: 'Lexique avancé : éviter les mots passe-partout',
    summary: 'Remplacer « faire », « dire », « chose », « problème » par des termes précis.',
    sections: [
      { heading: 'Verbes précis', body: 'Faire une enquête → mener une enquête ; dire son avis → exprimer, formuler, avancer ; avoir un problème → se heurter à une difficulté.' },
      { heading: 'Noms abstraits', body: 'Une chose importante → un enjeu majeur, un aspect déterminant ; un changement → une mutation, une évolution, un bouleversement.' },
      { heading: 'Adjectifs nuancés', body: 'Très important → primordial, crucial, capital ; mauvais → préjudiciable, néfaste, délétère.' },
    ],
    lexicon: [
      { term: 'délétère', definition: 'nuisible, qui a des effets destructeurs', example: 'Le climat délétère qui règne dans l’équipe freine les projets.' },
      { term: 'pallier', definition: 'remédier à (transitif direct : pallier un manque)', example: 'Ces mesures visent à pallier la pénurie de main-d’œuvre.' },
      { term: 'prégnant', definition: 'qui s’impose fortement à l’esprit', example: 'La question du logement reste prégnante dans les grandes villes.' },
    ],
  },
];
