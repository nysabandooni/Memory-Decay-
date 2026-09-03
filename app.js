const view = document.getElementById("view");
const dialog = document.getElementById("concept-dialog");
const form = document.getElementById("concept-form");
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ],
  );
const averageRetention = () =>
  concepts.length
    ? concepts.reduce(
        (sum, item) => sum + (item.tests.length ? item.tests.at(-1).score : 1),
        0,
      ) / concepts.length
    : 0;
const stateCount = (state) =>
  concepts.filter((item) => item.state === state).length;
function chart() {
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const values = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(today);
    day.setDate(today.getDate() - (6 - index));
    const active = concepts.filter(
      (concept) => concept.createdAt <= day.getTime(),
    );
    return active.length
      ? active.reduce(
          (sum, concept) => sum + currentEstimate(concept, day.getTime()),
          0,
        ) / active.length
      : 0;
  });
  const points = values
    .map((value, index) => `${30 + index * 150},${210 - value * 170}`)
    .join(" ");
  return `<svg viewBox="0 0 980 250" role="img" aria-label="Average retention trend"><g stroke="#343945"><line x1="20" y1="210" x2="960" y2="210"/><line x1="20" y1="125" x2="960" y2="125"/><line x1="20" y1="40" x2="960" y2="40"/></g><polyline points="${points}" fill="none" stroke="#e0954a" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>${values.map((value, index) => `<circle cx="${30 + index * 150}" cy="${210 - value * 170}" r="5" fill="#eee9df" stroke="#e0954a" stroke-width="2"/>`).join("")}<g fill="#a8a9a4" font-size="11" text-anchor="middle"><text x="30" y="238">6d ago</text><text x="180" y="238">5d</text><text x="330" y="238">4d</text><text x="480" y="238">3d</text><text x="630" y="238">2d</text><text x="780" y="238">Yesterday</text><text x="930" y="238">Today</text></g></svg>`;
}
function renderDashboard() {
  const retention = Math.round(averageRetention() * 100);
  const due = concepts.filter(
    (item) => item.state === "reinforce" || item.state === "risk",
  );
  return `<div class="page-heading"><div><div class="eyebrow">Memory overview</div><h1>Average retention</h1><p>A living picture of what is staying with you.</p></div><button data-action="add">+ Add concept</button></div><div class="grid overview-grid"><section class="card retention-card"><div class="card-head"><h2>Last 60 days</h2><span class="retention-value">${retention}<small>% retained</small></span></div>${chart()}</section><section class="card"><div class="card-head"><h2>Status</h2><span class="muted">${concepts.length} concepts</span></div><div class="metric"><div><strong>Stable</strong><div class="bar"><i style="width:${concepts.length ? (stateCount("stable") / concepts.length) * 100 : 0}%"></i></div></div><span>${stateCount("stable")}</span></div><div class="metric"><div><strong>Needs reinforcement</strong><div class="bar"><i style="width:${concepts.length ? (stateCount("reinforce") / concepts.length) * 100 : 0}%;background:var(--reinforce)"></i></div></div><span>${stateCount("reinforce")}</span></div><div class="metric"><div><strong>At risk</strong><div class="bar"><i style="width:${concepts.length ? (stateCount("risk") / concepts.length) * 100 : 0}%;background:var(--risk)"></i></div></div><span>${stateCount("risk")}</span></div></section><section class="card"><div class="card-head"><h2>Upcoming review</h2><button class="ghost" data-view="concepts">All concepts</button></div>${due.length ? due.map((item) => `<div class="due-item"><div><strong>${escapeHtml(item.title)}</strong><div class="muted">${item.state === "risk" ? "At risk" : "Needs reinforcement"}</div></div><button data-concept="${item.id}">Review →</button></div>`).join("") : '<div class="empty">Nothing needs reinforcement yet.</div>'}</section></div>`;
}
function renderConcepts() {
  return `<div class="page-heading"><div><div class="eyebrow">Individual memory</div><h1>Concepts</h1><p>Open a concept to run a recall test and inspect its forgetting curve.</p></div><button data-action="add">+ Add concept</button></div><div class="grid">${concepts.map((item) => `<article class="card concept-card" data-concept="${item.id}"><div><h2>${escapeHtml(item.title)}</h2><p>${escapeHtml(item.raw)}</p><div class="stats"><div class="stat"><label>Current recall</label><strong>${item.tests.length ? percent(item.tests.at(-1).score) : "—"}</strong></div><div class="stat"><label>Tests taken</label><strong>${item.tests.length}</strong></div><div class="stat"><label>Next interval</label><strong>${interval(item.nextInterval)}</strong></div></div></div>${badge(item.state)}</article>`).join("") || '<div class="card empty">Add a concept, or select one from the list, to run recall tests.</div>'}</div>`;
}
function renderDetail(id) {
  const item = concepts.find((concept) => concept.id === id);
  if (!item) return;
  const rows = item.tests
    .map(
      (test) =>
        `<div class="test-row"><span class="test-label">${test.label}</span><span class="score-breakdown">K ${percent(test.breakdown.keyword)} · O ${percent(test.breakdown.overlap)} · C ${percent(test.breakdown.cosine)}</span><strong>${percent(test.score)}</strong>${test.flag ? `<span class="badge">${test.flag}</span>` : "<span></span>"}</div>`,
    )
    .join("");
  const ready = isDue(item);
  const studyPanel = item.isLocked
    ? `<div class="answer-box"><div class="due">${item.nextReviewAt ? formatRemaining(item.nextReviewAt - Date.now()) : "Ready now"}</div><label>Free recall answer<textarea id="answer" ${ready ? "" : "disabled"} placeholder="Recall what you remember in your own words..."></textarea></label><button data-submit="${item.id}" ${ready ? "" : "disabled"}>Submit recall test</button></div>`
    : `<div class="study-panel"><div class="eyebrow">Study</div><p>${escapeHtml(item.raw)}</p><button data-lock="${item.id}">Lock material and recall</button></div>`;
  view.innerHTML = `<button class="ghost" data-view="concepts">← All concepts</button><div class="card detail-card"><div class="detail-head"><div><div class="eyebrow">Individual concept</div><h1>${escapeHtml(item.title)}</h1></div>${badge(item.state)}</div>${item.isLocked ? '<p class="locked-note">Material locked. Recall without looking.</p>' : ""}<div class="stats"><div class="stat"><label>Decay rate</label><strong>${percent(item.decayRate)}</strong></div><div class="stat"><label>Latest score</label><strong>${item.tests.length ? percent(item.tests.at(-1).score) : "—"}</strong></div><div class="stat"><label>Tests taken</label><strong>${item.tests.length}</strong></div></div><h2>Forgetting curve</h2>${item.tests.length ? `<div class="chart-frame">${detailChart(item)}</div>` : '<div class="empty">No recall tests taken yet.</div>'}<h2 class="section-heading">Test history</h2>${rows || '<div class="empty">No recall tests taken yet.</div>'}${studyPanel}</div>`;
}
function detailChart(item) {
  const width = 760,
    height = 260,
    left = 42,
    right = 18,
    top = 18,
    bottom = 36;
  const maxDay = Math.max(item.tests.at(-1).elapsedDays * 1.4, 1.2);
  const minDay = Math.max(item.tests[0].elapsedDays * 0.5, 0.001);
  const logMin = Math.log10(minDay),
    logMax = Math.log10(maxDay);
  const x = (days) =>
    left +
    ((Math.log10(Math.max(days, minDay)) - logMin) / (logMax - logMin)) *
      (width - left - right);
  const y = (score) => top + (1 - score) * (height - top - bottom);
  const points = item.tests
    .map((test) => `${x(test.elapsedDays)},${y(test.score)}`)
    .join(" ");
  const markers = item.tests
    .map((test) => {
      const cx = x(test.elapsedDays),
        cy = y(test.score);
      return test.flag === "Revised"
        ? `<rect x="${cx - 6}" y="${cy - 6}" width="12" height="12" fill="#8aa4d1" transform="rotate(45 ${cx} ${cy})"/>`
        : `<circle cx="${cx}" cy="${cy}" r="5" fill="#e0954a"/>`;
    })
    .join("");
  const last = item.tests.at(-1);
  const nextDay = last.elapsedDays + (item.nextInterval || 1);
  const projected = currentEstimate(
    item,
    last.submittedAt + (item.nextInterval || 1) * 86400000,
  );
  const projection = item.nextInterval
    ? `<line x1="${x(last.elapsedDays)}" y1="${y(last.score)}" x2="${x(nextDay)}" y2="${y(projected)}" stroke="#e0954a" stroke-width="2" stroke-dasharray="6 5"/><circle cx="${x(nextDay)}" cy="${y(projected)}" r="4" fill="none" stroke="#e0954a"/>`
    : "";
  return `<svg viewBox="0 0 ${width} ${height}"><g stroke="#343945"><line x1="${left}" y1="${y(0)}" x2="${width - right}" y2="${y(0)}"/><line x1="${left}" y1="${y(0.5)}" x2="${width - right}" y2="${y(0.5)}"/><line x1="${left}" y1="${y(1)}" x2="${width - right}" y2="${y(1)}"/></g><polyline points="${points}" fill="none" stroke="#eee9df" stroke-width="2"/>${projection}${markers}<g fill="#a8a9a4" font-size="10"><text x="4" y="${y(1) + 3}">100%</text><text x="10" y="${y(0.5) + 3}">50%</text><text x="18" y="${y(0) + 3}">0%</text></g></svg>`;
}
function render() {
  document
    .querySelectorAll(".nav-button")
    .forEach((button) =>
      button.classList.toggle("active", button.dataset.view === currentView),
    );
  view.innerHTML =
    currentView === "dashboard" ? renderDashboard() : renderConcepts();
}
document.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    currentView = viewButton.dataset.view;
    render();
    return;
  }
  const add = event.target.closest('[data-action="add"]');
  if (add) {
    form.reset();
    dialog.showModal();
    return;
  }
  const close = event.target.closest("[data-close-dialog]");
  if (close) {
    dialog.close();
    return;
  }
  const lock = event.target.closest("[data-lock]");
  if (lock) {
    lockConcept(lock.dataset.lock);
    renderDetail(lock.dataset.lock);
    return;
  }
  const submit = event.target.closest("[data-submit]");
  if (submit) {
    const answer = document.getElementById("answer").value.trim();
    if (!answer) return;
    submitRecall(submit.dataset.submit, answer);
    renderDetail(submit.dataset.submit);
    return;
  }
  const concept = event.target.closest("[data-concept]");
  if (concept) {
    renderDetail(concept.dataset.concept);
    return;
  }
});
form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  addConcept(
    data.get("title").trim(),
    data.get("raw").trim(),
    data.get("keywords").trim(),
  );
  dialog.close();
  currentView = "concepts";
  render();
});
render();
