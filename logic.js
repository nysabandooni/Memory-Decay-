const STORAGE_KEY = "memory-decay-concepts";
const SCHEDULE = [
  { label: "Test 1 · 3 min", days: 3 / 1440 },
  { label: "Test 2 · 1 hr", days: 1 / 24 },
  { label: "Test 3 · 4 hr", days: 4 / 24 },
  { label: "Test 4 · 1 day", days: 1 },
];
const SCHEDULE_LABELS = [
  "Test 1 · 3 min",
  "Test 2 · 1 hr",
  "Test 3 · 4 hr",
  "Test 4 · 1 day",
];
const STOPWORDS = new Set(
  "a an and the is are was were be been being of in on at to for with by only just this that these those it its as or if than then so not no do does did have has had".split(
    " ",
  ),
);
let concepts = loadConcepts();
let currentView = "dashboard";
let activeId = null;
function loadConcepts() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    const loaded = saved ? JSON.parse(saved) : [];
    return loaded.map((concept) => ({
      ...concept,
      createdAt: concept.createdAt || Date.now(),
      filteredData:
        concept.filteredData || filterStop(tokenize(concept.raw || "")),
      isLocked: Boolean(concept.isLocked),
      tests: Array.isArray(concept.tests)
        ? concept.tests.map((test) => ({
            ...test,
            submittedAt: test.submittedAt || concept.createdAt || Date.now(),
          }))
        : [],
    }));
  } catch {
    return [];
  }
}
function saveConcepts() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(concepts));
}
function tokenize(text) {
  return text.toLowerCase().match(/[a-z0-9]+/g) || [];
}
function filterStop(tokens) {
  return tokens.filter((token) => !STOPWORDS.has(token));
}
function parseKeywords(raw) {
  return raw
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean)
    .map((group) =>
      group
        .split("|")
        .map((alias) => alias.trim().toLowerCase())
        .filter(Boolean),
    );
}
function formatRemaining(milliseconds) {
  if (milliseconds <= 0) return "Ready now";
  const minutes = Math.ceil(milliseconds / 60000);
  if (minutes < 60) return `Ready in ${minutes} min`;
  return `Ready in ${(minutes / 60).toFixed(1)} hr`;
}
function nextDueAt(concept) {
  return concept.nextReviewAt || null;
}
function isDue(concept, now = Date.now()) {
  const dueAt = nextDueAt(concept);
  return !dueAt || dueAt <= now;
}
function currentEstimate(concept, at = Date.now()) {
  if (!concept.tests.length) return 1;
  const latest = concept.tests.at(-1);
  const daysSinceLastTest = Math.max(0, at - latest.submittedAt) / 86400000;
  return Math.max(
    0,
    latest.score - (concept.decayRate || 0) * latest.score * daysSinceLastTest,
  );
}
function scoreAnswer(concept, answer) {
  const material = concept.filteredData || filterStop(tokenize(concept.raw)),
    recalled = filterStop(tokenize(answer));
  const keyword = concept.keywords.length
    ? concept.keywords.filter((group) =>
        group.some((alias) => answer.toLowerCase().includes(alias)),
      ).length / concept.keywords.length
    : 1;
  const materialSet = new Set(material),
    recalledSet = new Set(recalled),
    union = new Set([...materialSet, ...recalledSet]);
  const overlap = union.size
    ? [...recalledSet].filter((word) => materialSet.has(word)).length /
      union.size
    : 0;
  const mf = {},
    rf = {};
  material.forEach((word) => (mf[word] = (mf[word] || 0) + 1));
  recalled.forEach((word) => (rf[word] = (rf[word] || 0) + 1));
  const vocabulary = new Set([...Object.keys(mf), ...Object.keys(rf)]);
  let dot = 0,
    mm = 0,
    rm = 0;
  vocabulary.forEach((word) => {
    const m = mf[word] || 0,
      r = rf[word] || 0;
    dot += m * r;
    mm += m * m;
    rm += r * r;
  });
  const cosine = mm && rm ? dot / (Math.sqrt(mm) * Math.sqrt(rm)) : 0;
  return {
    keyword,
    overlap,
    cosine,
    final: 0.4 * keyword + 0.3 * overlap + 0.3 * cosine,
  };
}
function recompute(concept) {
  if (!concept.tests.length) {
    concept.state = "new";
    concept.decayRate = null;
    return;
  }
  let baseline = 0;
  concept.tests.forEach((test, index) => {
    if (index && test.score - concept.tests[index - 1].score > 0.2) {
      test.flag = "Revised";
      baseline = index;
    } else test.flag = null;
  });
  concept.baselineIdx = baseline;
  const first = concept.tests[baseline],
    latest = concept.tests.at(-1);
  const testsSinceBaseline = concept.tests.length - baseline;
  concept.decayRate =
    testsSinceBaseline >= 4 && first.score > 0
      ? Math.max(0, Math.min(1, (first.score - latest.score) / first.score))
      : 0;
  if (testsSinceBaseline < 4) concept.state = "new";
  else if (concept.decayRate > 0.6 || latest.score < 0.4)
    concept.state = "risk";
  else if (concept.decayRate >= 0.3 || latest.score < 0.7)
    concept.state = "reinforce";
  else concept.state = "stable";
  if (testsSinceBaseline >= 4) {
    const trend = latest.score - concept.tests.at(-2).score;
    concept.nextInterval = Math.max(
      (concept.lastInterval || 1) *
        (0.5 * (1 - concept.decayRate) + 0.3 * latest.score + 0.2 * trend),
      0.02,
    );
    concept.lastInterval = concept.nextInterval;
  } else concept.nextInterval = null;
}
function percent(value) {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}
function interval(days) {
  if (days == null) return "—";
  if (days < 1 / 24) return `${Math.round(days * 1440)} min`;
  if (days < 1) return `${(days * 24).toFixed(1)} hr`;
  return `${days.toFixed(1)} day${days >= 2 ? "s" : ""}`;
}
function badge(state) {
  const names = {
    stable: ["Stable", "stable"],
    reinforce: ["Needs reinforcement", "reinforce"],
    risk: ["At risk", "risk"],
    new: ["New", "new"],
  };
  const item = names[state] || names.new;
  return `<span class="badge ${item[1]}">${item[0]}</span>`;
}
function addConcept(title, raw, keywordRaw) {
  const concept = {
    id: `c-${Date.now()}`,
    title,
    raw,
    filteredData: filterStop(tokenize(raw)),
    keywords: parseKeywords(keywordRaw),
    tests: [],
    elapsedDays: 0,
    lastInterval: 1,
    state: "new",
    decayRate: null,
    baselineIdx: 0,
    createdAt: Date.now(),
    isLocked: false,
    nextReviewAt: null,
  };
  concepts.push(concept);
  activeId = concept.id;
  saveConcepts();
}
function lockConcept(conceptId) {
  const concept = concepts.find((item) => item.id === conceptId);
  if (!concept) return;
  concept.isLocked = true;
  concept.lockedAt = Date.now();
  concept.nextReviewAt = null;
  saveConcepts();
}
function submitRecall(conceptId, answer) {
  const concept = concepts.find((item) => item.id === conceptId);
  if (!concept || !concept.isLocked || !isDue(concept)) return false;
  const index = concept.tests.length;
  const schedule = SCHEDULE[Math.min(index, 3)];
  const breakdown = scoreAnswer(concept, answer);
  const elapsed =
    index < 4
      ? schedule.days
      : concept.elapsedDays + (concept.nextInterval || 1);
  concept.elapsedDays = elapsed;
  concept.tests.push({
    n: index + 1,
    label: index < 4 ? schedule.label : `Test ${index + 1} · adaptive`,
    elapsedDays: elapsed,
    score: breakdown.final,
    breakdown,
    flag: null,
    submittedAt: Date.now(),
  });
  recompute(concept);
  const nextIndex = concept.tests.length;
  concept.nextReviewAt =
    nextIndex < 4
      ? Date.now() + SCHEDULE[nextIndex].days * 86400000
      : Date.now() + (concept.nextInterval || 1) * 86400000;
  saveConcepts();
  return true;
}
