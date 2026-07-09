// meaning-4500 selector — IELTS-weighted scoring model v2.
//
// FINAL_SCORE =
//   IELTS_EXAM_WEIGHT * 0.40 +
//   COMPREHENSION_IMPORTANCE * 0.30 +
//   CONTEXT_FREQUENCY * 0.20 +
//   COVERAGE_VALUE * 0.10 -
//   NOISE_PENALTY
//
// All scores normalized to 100-point scale.

const DIFFICULTY_SCORE = {
  "中级核心": 75,
  "高级加分": 60,
  "阅读扩展": 45,
  "基础高频": 85,  // allowed but deprioritized vs mid/advanced
  "低频认识即可": 20
};

// ─── Person names ───
const PERSON_NAMES = new Set([
  "james","john","robert","michael","william","david","richard","joseph","thomas","charles",
  "christopher","daniel","matthew","anthony","mark","donald","steven","paul","andrew",
  "joshua","kenneth","kevin","brian","george","edward","ronald","timothy","jason",
  "jeffrey","ryan","jacob","gary","nicholas","eric","jonathan","stephen","larry","justin",
  "scott","brandon","benjamin","samuel","raymond","gregory","frank","alexander",
  "patrick","jack","dennis","jerry","tyler","aaron","jose","adam","henry","nathan",
  "douglas","peter","kyle","walter","ethan","jeremy","harold","keith","christian",
  "roger","noah","gerald","carl","terry","sean","austin","arthur","lawrence","jesse",
  "dylan","bryan","joe","jordan","billy","bruce","albert","willie","gabriel","logan",
  "alan","juan","wayne","roy","ralph","randy","eugene","vincent","russell","elijah",
  "louis","bobby","philip","johnny","bradley","martin","larry","randall","frederick",
  "maria","mary","patricia","jennifer","linda","barbara","elizabeth","lisa","nancy",
  "susan","margaret","sandra","ashley","kimberly","emily","donna","michelle",
  "dorothy","carol","amanda","melissa","deborah","stephanie","rebecca","sharon",
  "laura","cynthia","kathleen","amy","shirley","angela","anna","brenda","pamela",
  "emma","nicole","helen","samantha","katherine","christine","debra","rachel",
  "carolyn","janet","catherine","maria","heather","diane","ruth","julie","olivia",
  "joyce","virginia","victoria","kelly","lauren","joan","madison","judith","cheryl",
  "megan","andrea","hannah","jacqueline","martha","gloria","teresa","ann","sara",
  "kathryn","alice","jean","judy","isabella","julia","grace","amber","danielle",
  "marilyn","beverly","abigail","theresa","natalie","brittany","charlotte",
  "marie","diana","mildred","jane","lillian","rose"
]);

function isPersonName(word) {
  const clean = String(word || "").trim().toLowerCase();
  const firstWord = clean.split(/\s+/)[0];
  return PERSON_NAMES.has(clean) || PERSON_NAMES.has(firstWord);
}

// ─── A1/A2 basic words to exclude ───
const BASIC_WORDS = new Set([
  "a","an","the","i","you","he","she","it","we","they","me","him","her","us","them",
  "my","your","his","its","our","their","mine","yours","hers","ours","theirs",
  "this","that","these","those","am","is","are","was","were","be","been","being",
  "have","has","had","do","does","did","will","would","shall","should","can","could",
  "may","might","must","not","no","yes","and","or","but","so","if","in","on","at",
  "to","for","of","with","from","by","about","as","into","through","during","before",
  "after","above","below","between","under","again","then","now","here","there",
  "one","two","three","four","five","six","seven","eight","nine","ten",
  "red","blue","green","yellow","black","white","big","small","hot","cold",
  "new","old","good","bad","high","low","long","short","day","night","week",
  "month","year","man","woman","child","people","thing","time","way","water",
  "food","house","home","car","book","school","work","money","world","life",
  "hand","part","place","case","number","fact","lot","right","left","top",
  "monday","tuesday","wednesday","thursday","friday","saturday","sunday",
  "january","february","march","april","may","june","july","august",
  "september","october","november","december","mr","mrs","ms","miss","dr",
  "very","really","just","also","too","only","still","even","much","many",
  "some","any","each","every","both","few","more","most","other","own","same",
  "get","go","come","make","take","see","look","use","find","give","tell",
  "ask","try","need","feel","put","let","keep","begin","start","turn","move",
  "live","play","run","walk","help","show","hear","call","talk","say","think",
  "know","want","like","love","hate","mean","become","leave","bring","happen",
  "seem","look","buy","sell","pay","eat","drink","read","write","open","close",
  "sit","stand","stay","wait","pass","stop","watch","change","build","meet",
  "win","lose","send","receive","remember","forget","understand","believe",
  "carry","hold","cut","break","fall","grow","die","kill","fight","drive",
  "head","eye","face","back","door","room","bed","table","chair","window",
  "wall","floor","road","street","town","city","country","morning","evening",
  "father","mother","brother","sister","son","daughter","friend","name",
  "sun","moon","star","rain","snow","wind","fire","air","land","sea","river",
  "tree","flower","dog","cat","bird","fish","horse","paper","pen","phone",
  "tv","computer","music","film","game","team","word","question","answer",
  "problem","idea","story","picture","color","language","news","body",
  "north","south","east","west","hello","goodbye","please","thank","sorry",
  "mr","mrs","ms","miss","dr","ok","okay","hi","hey","well"
]);

// ─── GRE/archaic patterns ───
const GRE_PATTERNS = [
  "abnegat","abscond","accrete","adumbrat","aficionad","amanuens","antediluvi",
  "apotheos","asseverat","blandish","bombast","bromid","cachinn","cadaver","calumn",
  "captio","cavil","chimer","circumloc","clinquant","commin","compunct","concaten",
  "conflagr","contum","corusc","crepusc","defenest","deliques","demagog","denouem",
  "desuet","detumes","diaphan","dilettant","disquis","ebulli","efflores","egregi",
  "eleemosy","encomi","ennui","ephemer","eruct","estiv","etiol","euphu","execr",
  "fatuou","fiduci","flocc","fracti","fulmin","garrul","germin","gnom","gossam",
  "grandiloq","gravam","hegemon","ignomin","imbrogli","immol","impreg","impugn",
  "incarn","ineluct","insouci","internec","interpol","intransig","inveigl","inveter",
  "jejun","lacun","lamben","lasciv","lassit","licent","lissom","litig","lugubri",
  "magniloq","malfeas","martin","mendac","mendic","meretri","milita","minator",
  "misanth","morib","munific","nepotis","noisom","nonchal","nugat","obduracy",
  "obfuscat","obloqu","obsequi","obstrep","obtus","obvi","offici","oleag",
  "oligarc","omnisc","opprobri","oscill","ossif","ostent","palliat","panegyr",
  "paradi","parsimon","parturi","peccad","peculat","pedagog","pelluc","penuri",
  "peregri","perfid","perfunct","peripat","pernic","perspic","pertin","petul",
  "philanth","phlegmat","placat","plaint","platit","plethor","pococur","portent",
  "pragmat","precip","predile","prelaps","prepond","presci","primord","probity",
  "procliv","prodig","proflig","prognost","prolix","propens","propinqu","propiti",
  "proscri","provid","pugil","pugnac","pulchrit","punctil","pusill","querul",
  "quiesc","quixot","quotid","raconte","ramif","rancor","rapaci","raref",
  "ratiocin","recalcit","recidiv","recond","redol","refract","regal","relev",
  "remonstr","renege","repast","reple","reprob","requit","resplend","restiv",
  "retic","retrib","revile","rhapsod","ribald","risibl","rubric","rustic","sagac",
  "salaci","salut","sangu","sardoni","saturn","scintill","scurril","sediti",
  "sempit","senesc","sentent","sibil","somnamb","sophi","sopor","speci","splen",
  "stolid","stratum","strictur","strident","stultif","subjug","sublim","subterf",
  "succinct","suffus","surrept","susurr","sybar","sycoph","syllog","sympos",
  "tacit","tantal","tautol","temer","tempest","tenaci","tenden","tenebr",
  "tergivers","terse","thesauri","timor","torpid","tortu","tractab","transi",
  "trench","trepid","trucul","tumult","turgid","ubiquit","umbrag","unctu",
  "undul","upbraid","usurp","vacill","vapid","vehem","vener","verac","verbos",
  "verd","verisim","vestig","viciss","vindic","virtu","viscer","vitiat","vitre",
  "vitup","vivac","vocifer","volit","voraci","weltsch","xenoph","zeitg","zenit","zephyr"
];

function isGreWord(word) {
  const clean = String(word || "").trim().toLowerCase();
  return GRE_PATTERNS.some(p => clean.startsWith(p));
}

function isBasicWord(word) {
  const clean = String(word || "").trim().toLowerCase();
  return BASIC_WORDS.has(clean);
}

// ─── Scoring Components ───

/**
 * IELTS_EXAM_WEIGHT (40%, max 100 points)
 * Covers 4 skills: Listening 12, Reading 12, Writing 10, Speaking 6 = 40 raw → scaled to 100
 */
function computeIeltsExamWeight(entry) {
  const ieltsUse = normalizeArray(entry.ieltsUse);
  const topics = normalizeArray(entry.topics);
  const category = entry.category || "";
  const pos = (entry.pos || "").toLowerCase();

  let listening = 0;
  let reading = 0;
  let writing = 0;
  let speaking = 0;

  // ── Listening (12 pts raw → 30 scaled) ──
  const isListening = ieltsUse.some(u => /listening|听力/i.test(u));
  const listeningPriority = entry.listeningPriority;

  if (isListening || listeningPriority) {
    // Section detection via topics
    const topicStr = topics.join(" ");
    const s1Match = /section.?1|s1|part.?1|p1\b/i.test(topicStr + category);
    const s2Match = /section.?2|s2|part.?2|p2\b/i.test(topicStr + category);
    const s3Match = /section.?3|s3|part.?3|p3\b/i.test(topicStr + category);
    const s4Match = /section.?4|s4|part.?4|p4\b/i.test(topicStr + category);

    if (s1Match) listening = 3.0;
    else if (s2Match) listening = 2.5;
    else if (s3Match) listening = 3.5;
    else if (s4Match) listening = 3.0;
    else if (isListening) listening = 2.5; // default listening weight

    // Boost from listening priority
    if (typeof listeningPriority === "number" && listeningPriority > 0) {
      listening = Math.min(3.5, listening + listeningPriority * 0.3);
    }
  }

  // ── Reading (12 pts raw → 30 scaled) ──
  const isReading = ieltsUse.some(u => /reading|阅读/i.test(u));
  const readingPriority = entry.readingPriority;

  if (isReading || readingPriority) {
    const p1Match = /passage.?1|p1\b/i.test(topics.join(" ") + category);
    const p2Match = /passage.?2|p2\b/i.test(topics.join(" ") + category);
    const p3Match = /passage.?3|p3\b/i.test(topics.join(" ") + category);

    if (p3Match) reading = 5.0;
    else if (p2Match) reading = 4.0;
    else if (p1Match) reading = 3.0;
    else if (isReading) reading = 3.5;

    if (typeof readingPriority === "number" && readingPriority > 0) {
      reading = Math.min(5.0, reading + readingPriority * 0.2);
    }
  }

  // ── Writing (10 pts raw → 25 scaled) ──
  const isGTWriting = ieltsUse.some(u => /g类书信|g类高频/i.test(u));
  const isTask2 = ieltsUse.some(u => /task.?2|writing.?task.?2/i.test(u));
  const isWriting = ieltsUse.some(u => /writing|写作/i.test(u)) || isGTWriting || isTask2;
  const writingPriority = entry.writingPriority;

  if (isGTWriting) writing = 4.0;
  else if (isTask2) writing = 6.0;
  else if (isWriting) writing = 3.0;

  if (typeof writingPriority === "number" && writingPriority > 0) {
    writing = Math.min(6.0, writing + writingPriority * 0.2);
  }

  // ── Speaking (6 pts raw → 15 scaled) ──
  const isSpeaking = ieltsUse.some(u => /speaking|口语/i.test(u));
  if (isSpeaking) speaking = 3.0;

  // Boost for descriptive/opinion words useful in speaking
  const speakingAdj = /\b(adjective|adj)\b/i.test(pos);
  const speakingVerb = /\b(verb|v)\b/i.test(pos);
  if (speakingAdj && isSpeaking) speaking = 4.0;
  if (speakingVerb && isSpeaking) speaking = 3.5;

  // Raw total (max ~40) scaled to 100
  const rawTotal = listening + reading + writing + speaking;
  return Math.round((rawTotal / 40) * 100 * 100) / 100;
}

/**
 * COMPREHENSION_IMPORTANCE (30%, max 100)
 * Measures whether not knowing this word seriously impairs sentence understanding.
 */
function computeComprehensionImportance(entry) {
  const word = (entry.word || "").toLowerCase();
  const pos = (entry.pos || "").toLowerCase();
  const meaning = entry.meaning || "";

  // Logic/process/cause words
  const logicWords = /\b(however|therefore|despite|although|whereas|nevertheless|moreover|furthermore|consequently|accordingly|hence|thus|nonetheless|regardless|meanwhile|otherwise|alternatively|specifically|particularly|notably|indeed|instead|rather|otherwise)\b/i;
  const processWords = /\b(occur|emerge|arise|decline|diminish|fluctuate|stabilize|peak|plummet|soar|surge|persist|cease|commence|initiate|terminate|undergo|transform|convert|adapt|evolve)\b/i;
  const causeWords = /\b(affect|effect|result|consequence|outcome|impact|influence|contribute|attribute|trigger|cause|spark|provoke|generate|yield|produce|induce|stem|derive|originate)\b/i;
  const comprehensionWords = /\b(indicate|demonstrate|illustrate|reveal|imply|suggest|assume|presume|infer|conclude|determine|establish|confirm|verify|validate|refute|contradict|challenge|question|dispute)\b/i;
  const academicWords = /\b(evidence|issue|factor|approach|aspect|concept|context|feature|component|element|framework|mechanism|principle|theory|hypothesis|notion|phenomenon|trend|pattern|correlation|criterion|dimension|domain|paradigm|perspective|rationale|scope|variable)\b/i;

  let score = 30; // base

  if (logicWords.test(word)) score = 90;
  else if (processWords.test(word)) score = 85;
  else if (causeWords.test(word)) score = 88;
  else if (comprehensionWords.test(word)) score = 87;
  else if (academicWords.test(word)) score = 82;
  else if (/\b(noun|n)\b/i.test(pos) && word.length >= 6) score = 65;
  else if (/\b(verb|v)\b/i.test(pos) && word.length >= 5) score = 60;
  else if (/\b(adj|adjective)\b/i.test(pos) && word.length >= 5) score = 55;
  else if (word.length >= 7) score = 50;
  else score = 40;

  return score;
}

/**
 * CONTEXT_FREQUENCY (20%, max 100)
 * Uses project-internal evidence: topics, ieltsUse, source tags, priority fields.
 */
function computeContextFrequency(entry) {
  const topics = normalizeArray(entry.topics);
  const ieltsUse = normalizeArray(entry.ieltsUse);
  const excelTags = normalizeArray(entry.excelSourceTags);

  let score = 30; // base

  // Topics breadth
  score += Math.min(40, topics.length * 3);

  // ieltsUse breadth
  score += Math.min(20, ieltsUse.length * 4);

  // Excel source tags (suggest curated/high-value)
  if (excelTags.length > 0) score += 10;

  // Priority fields indicate frequency/importance
  if (entry.listeningPriority) score += 5;
  if (entry.readingPriority) score += 5;
  if (entry.writingPriority) score += 5;

  return Math.min(100, score);
}

/**
 * COVERAGE_VALUE (10%, max 100)
 * Prioritizes words that are reusable across skills, topics, and collocations.
 */
function computeCoverageValue(entry) {
  const topics = normalizeArray(entry.topics);
  const ieltsUse = normalizeArray(entry.ieltsUse);
  const collocations = entry.collocations || [];
  const phraseCollocations = entry.phraseCollocations || [];

  let score = 20;

  // Cross-skill coverage
  const skills = new Set();
  ieltsUse.forEach(u => {
    if (/listening|听力/i.test(u)) skills.add("L");
    if (/reading|阅读/i.test(u)) skills.add("R");
    if (/writing|写作|task/i.test(u)) skills.add("W");
    if (/speaking|口语/i.test(u)) skills.add("S");
  });
  score += skills.size * 10;

  // Topic breadth
  score += Math.min(30, topics.length * 2);

  // Collocation richness
  if (collocations.length >= 3) score += 15;
  else if (collocations.length >= 1) score += 8;

  if (phraseCollocations.length >= 2) score += 10;

  return Math.min(100, score);
}

/**
 * NOISE_PENALTY — deductions for undesirable words.
 */
function computeNoisePenalty(entry) {
  let penalty = 0;
  const word = (entry.word || "").toLowerCase();
  const pos = (entry.pos || "").toLowerCase();
  const meaning = entry.meaning || entry.meaningZh || "";
  const wordId = entry.wordId || entry.id || "";

  // No meaning → eliminate
  if (!meaning || meaning.trim().length === 0) return 1000;

  // No wordId → penalize
  if (!wordId) penalty += 30;

  // Too short
  if (word.length <= 2) penalty += 50;

  // Single letter
  if (word.length === 1) penalty += 100;

  // GRE words
  if (isGreWord(word)) penalty += 500;

  // Person names
  if (isPersonName(word)) penalty += 1000;

  // Basic A1/A2
  if (isBasicWord(word)) penalty += 200;

  // Specialized pos
  if (/\b(interjection|preposition|conjunction|pronoun|article|abbreviation|prefix|suffix|number|ordinal)\b/i.test(pos)) penalty += 150;

  // Abbreviations
  if (/^[A-Z]{2,5}$/.test(entry.word || "")) penalty += 100;

  // Technical/specialized terms in basic difficulty
  if (entry.difficulty === "基础高频" && word.length <= 4 && !/listening|reading|speaking/i.test((entry.ieltsUse || []).join(" "))) {
    penalty += 80;
  }

  return penalty;
}

// ─── Main scoring function ───

export function computeWordScore(entry) {
  const noisePenalty = computeNoisePenalty(entry);
  if (noisePenalty >= 500) return -noisePenalty;

  const ieltsExamWeight = computeIeltsExamWeight(entry);
  const comprehensionImportance = computeComprehensionImportance(entry);
  const contextFrequency = computeContextFrequency(entry);
  const coverageValue = computeCoverageValue(entry);

  const final = (
    ieltsExamWeight * 0.40 +
    comprehensionImportance * 0.30 +
    contextFrequency * 0.20 +
    coverageValue * 0.10 -
    noisePenalty
  );

  return Math.round(final * 100) / 100;
}

/**
 * Select top 4500 words with evidence-aware scoring.
 */
export function selectMeaningWords(words, limit = 4500) {
  // Score all
  const scored = words
    .map(entry => {
      const score = computeWordScore(entry);
      const breakdown = {
        ieltsExamWeight: computeIeltsExamWeight(entry),
        comprehensionImportance: computeComprehensionImportance(entry),
        contextFrequency: computeContextFrequency(entry),
        coverageValue: computeCoverageValue(entry),
        noisePenalty: computeNoisePenalty(entry)
      };
      return { entry, score, breakdown };
    })
    .filter(item => item.score > 0);

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Select top N
  const selected = scored.slice(0, limit);

  return selected.map(({ entry, score, breakdown }) => {
    const ieltsUse = normalizeArray(entry.ieltsUse);
    const tags = [];
    if (ieltsUse.some(u => /listening|听力/i.test(u))) tags.push("listening");
    if (ieltsUse.some(u => /reading|阅读/i.test(u))) tags.push("reading");
    if (ieltsUse.some(u => /writing|写作|task|g类/i.test(u))) tags.push("writing");
    if (ieltsUse.some(u => /speaking|口语/i.test(u))) tags.push("speaking");

    return {
      wordId: entry.id || entry.wordId || entry.word,
      word: entry.word,
      meaningZh: extractMeaningZh(entry),
      difficulty: entry.difficulty || "core",
      score,
      scoreBreakdown: {
        ieltsExamWeight: breakdown.ieltsExamWeight,
        listening: extractSkillSubscore(entry, "listening"),
        reading: extractSkillSubscore(entry, "reading"),
        writing: extractSkillSubscore(entry, "writing"),
        speaking: extractSkillSubscore(entry, "speaking"),
        comprehensionImportance: breakdown.comprehensionImportance,
        contextFrequency: breakdown.contextFrequency,
        coverageValue: breakdown.coverageValue,
        noisePenalty: breakdown.noisePenalty
      },
      tags,
      sourceEvidence: buildSourceEvidence(entry)
    };
  });
}

function extractMeaningZh(entry) {
  const raw = entry.meaning || entry.meaningZh || "";
  const cleaned = String(raw)
    .replace(/[（(][^)）]*[)）]/g, "")
    .split(/[；;，,]/)[0]
    .trim();
  return cleaned || raw;
}

function extractSkillSubscore(entry, skill) {
  const ieltsUse = normalizeArray(entry.ieltsUse);
  // Return a representative sub-score (simplified)
  if (skill === "listening") return ieltsUse.some(u => /listening|听力/i.test(u)) ? 5 : 0;
  if (skill === "reading") return ieltsUse.some(u => /reading|阅读/i.test(u)) ? 5 : 0;
  if (skill === "writing") return ieltsUse.some(u => /writing|写作|task|g类/i.test(u)) ? 5 : 0;
  if (skill === "speaking") return ieltsUse.some(u => /speaking|口语/i.test(u)) ? 3 : 0;
  return 0;
}

function buildSourceEvidence(entry) {
  const evidence = [];
  if (entry.listeningPriority) evidence.push("listeningPriority");
  if (entry.readingPriority) evidence.push("readingPriority");
  if (entry.writingPriority) evidence.push("writingPriority");
  if ((entry.excelSourceTags || []).length > 0) evidence.push("excelSourceTags");
  if ((entry.ieltsUse || []).length > 0) evidence.push("ieltsUse");
  if ((entry.topics || []).length > 0) evidence.push("topics");
  return evidence;
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return [value];
  return [];
}

export const SELECTOR_VERSION = "meaning-4500-v2";
export { DIFFICULTY_SCORE, isPersonName, isGreWord, isBasicWord, BASIC_WORDS,
         computeIeltsExamWeight, computeComprehensionImportance, computeContextFrequency,
         computeCoverageValue, computeNoisePenalty, extractMeaningZh };
