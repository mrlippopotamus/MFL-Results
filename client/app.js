import { DEFAULT_OPPOSITION, DEFAULT_PRIOR, analyse, analyseMatch, pairKey, summarize } from "./analysis.js";
import { FIELDS, TEMPLATE, fromFile, fromPaste, review } from "./import.js";
import { CLUBS, IMPORT_SIZE } from "./matches.js";
import { MATCH_HEADERS, clubOptions, confidence, displayDate, escape, format, matchCells, matchesView, matchupsView, matrixView, pickerView, resultBadge, select } from "./views.js";

const app = document.querySelector("#app");
const dialog = document.querySelector("#dialog");
const toast = document.querySelector("#toast");
const views = { matrix: matrixView, picker: pickerView, matchups: matchupsView, matches: matchesView };
const state = {
  club: CLUBS[0].name, metric: "performance", matrixOpponent: "",
  matchupsMetric: "results", matchupsFormation: "",
  matchesClub: "", competition: "", matchesVenue: "", query: "", matchPair: null, page: 0,
  picker: { club: CLUBS[0].name, opponent: DEFAULT_OPPOSITION, ownOvr: 750, opponentOvr: 750, venue: "Either", prior: DEFAULT_PRIOR },
};

let matches = [];
let model = analyse(matches);
let ready = false;
let busy = false;
let imports = [];
let importName = "";
let reviewed = { rows: [], problems: [], duplicates: 0 };
let activePair;
let toastTimer;

function currentView() {
  const hash = location.hash.slice(1);
  return Object.hasOwn(views, hash) ? hash : "matrix";
}

function render(focusName) {
  const view = currentView();
  for (const link of document.querySelectorAll("#nav a")) {
    if (link.dataset.view === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (!ready) return;
  app.innerHTML = views[view](model, state);
  if (focusName) app.querySelector('[name="' + CSS.escape(focusName) + '"]')?.focus({ preventScroll: true });
}

function navigate(view) {
  if (location.hash === "#" + view) render();
  else location.hash = view;
  document.querySelector("main").focus({ preventScroll: true });
  window.scrollTo(0, 0);
}

function rebuild() {
  model = analyse(matches);
  if (!model.oppFormations.includes(state.picker.opponent)) state.picker.opponent = DEFAULT_OPPOSITION;
  if (!model.oppFormations.includes(state.matrixOpponent)) state.matrixOpponent = "";
  if (!model.ourFormations.includes(state.matchupsFormation)) state.matchupsFormation = "";
  if (!model.rows.some(row => row.competition === state.competition)) state.competition = "";
}

async function api(path, options) {
  const response = await fetch(path, { ...options, cache: "no-store", credentials: "same-origin" });
  if (!(response.headers.get("content-type") || "").includes("application/json")) {
    throw new Error("Open the dashboard directly and sign in to access the match database.");
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "The match database could not be reached.");
  return body;
}

async function loadMatches() {
  const stored = [];
  let next;
  do {
    const result = await api("/api/matches" + (next ? "?after=" + next : ""));
    stored.push(...result.matches);
    next = result.next;
  } while (next);
  matches = stored;
  rebuild();
  ready = true;
  render();
}

async function start() {
  render();
  try {
    await loadMatches();
  } catch (error) {
    app.innerHTML = `<div class="panel"><div class="dialog-body"><h2>Match database unavailable</h2>
      <p class="error">${escape(error.message)}</p><p><button class="button secondary" data-action="retry">Try again</button></p></div></div>`;
  }
}

function notify(message) {
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 5600);
}

function showDialog(title, subhead, content, actions = "", wide = false) {
  dialog.classList.toggle("wide", wide);
  dialog.innerHTML = `<div class="dialog-head"><div><h2 id="dialog-title">${escape(title)}</h2>
    ${subhead ? "<p>" + escape(subhead) + "</p>" : ""}</div>
    <button class="close" type="button" data-action="close" aria-label="Close dialog">×</button></div>
    <div class="dialog-body">${content}</div>
    ${actions ? '<div class="dialog-actions">' + actions + "</div>" : ""}`;
  if (!dialog.open) dialog.showModal();
}

function detailMetrics(items) {
  return '<dl class="detail-metrics">' + items.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join("") + "</dl>";
}

function pairDetails(dataset) {
  const { our, opp, club } = dataset;
  activePair = { our, opp, club };
  const pair = pairKey(our, opp);
  const rows = model.rows.filter(row => (!club || club === row.club) && pairKey(row.ourFormation, row.oppFormation) === pair);
  const summary = summarize(rows);
  const line = rows.length + (rows.length === 1 ? " match" : " matches") + " · " + (club || "All clubs");
  const metrics = detailMetrics([
    ["W–D–L", summary.wins + "–" + summary.draws + "–" + summary.losses],
    ["Performance index", format(summary.performance, true)],
    ["OVR-adjusted xG", format(summary.adjusted, true)],
    ["xG for / against", format(summary.xgFor) + " / " + format(summary.xgAgainst)],
    ["Average OVR diff.", format(summary.ovrDiff, true)],
    ["Evidence", summary.evidence],
  ]);
  const list = rows.slice().sort((left, right) => right.date.localeCompare(left.date)).slice(0, 5).map(row => `
    <li><button class="text-button" data-action="match" data-id="${row.id}">${escape(row.opponent)}</button>
      <span>${displayDate(row.date)} · ${resultBadge(row.result)} ${row.gf}–${row.ga}</span></li>`).join("");
  showDialog(our + " vs " + opp, line, metrics + '<ul class="mini-list">' + list + "</ul>",
    '<button class="button primary" data-action="view-pair">View matches</button>');
}

function matchDetails(row) {
  const info = detailMetrics([
    ["Our formation", row.ourFormation], ["Opponent formation", row.oppFormation],
    ["Score", row.result + " · " + row.gf + "–" + row.ga],
    ["xG for / against", format(row.xgFor) + " / " + format(row.xgAgainst)],
    ["OVR for / against", row.ourOvr + " / " + row.oppOvr], ["OVR difference", format(row.ovrDiff, true)],
    ["Actual points", row.points], ["Expected points", format(row.expectedPoints)], ["Performance index", format(row.performance, true)],
    ["xG difference", format(row.xgDiff, true)], ["Expected xG diff.", format(row.expectedXg, true)], ["OVR-adjusted xG", format(row.adjusted, true)],
  ]);
  showDialog(row.club + " vs " + row.opponent, [displayDate(row.date), row.competition, row.venue].filter(Boolean).join(" · "),
    info + (row.reference ? '<p>Match ID ' + escape(row.reference) + "</p>" : ""),
    `<button class="button secondary" data-action="close">Close</button><button class="button danger" data-action="remove" data-id="${row.id}">Remove match</button>`);
}

function confirmRemove(row) {
  showDialog("Remove match?", null, `<p><b>${escape(row.club)} vs ${escape(row.opponent)}</b></p>
    <p>${displayDate(row.date)} · ${row.venue} · ${row.gf}–${row.ga}</p>
    <p>The record will be deleted from the cloud database and the analysis will update.</p>
    <p class="error" id="dialog-error" role="alert" hidden></p>`,
    `<button class="button secondary" data-action="close">Cancel</button>
    <button class="button danger" data-action="confirm-remove" data-id="${row.id}">Remove match</button>`);
  dialog.querySelector(".dialog-actions .secondary").focus();
}

function dialogError(message) {
  const error = dialog.querySelector("#dialog-error");
  error.hidden = !message;
  error.textContent = message;
}

function setBusy(value) {
  busy = value;
  if (!dialog.open) return;
  for (const button of dialog.querySelectorAll("button")) button.disabled = value;
}

async function removeMatch(id) {
  setBusy(true);
  dialogError("");
  try {
    await api("/api/matches/" + id, { method: "DELETE" });
    matches = matches.filter(match => match.id !== id);
    rebuild();
    dialog.close();
    render();
    notify("Match removed. The analysis has been updated.");
  } catch (error) {
    dialogError(error.message);
  } finally {
    setBusy(false);
  }
}

function importStart() {
  imports = [];
  importName = "";
  showDialog("Import matches", "",
    `<div class="import-start">
      <div class="paste-group">
        <label class="field">Paste MFL match HTML
          <textarea id="pasted" aria-describedby="paste-hint" placeholder="Paste &lt;tr&gt;…&lt;/tr&gt; here" spellcheck="false" autofocus></textarea>
        </label>
        <small id="paste-hint">Copy the match row’s HTML from MFL. Paste one or more rows, or paste spreadsheet rows with column headers.</small>
        <button class="button primary" data-action="preview-paste">Preview pasted rows</button>
      </div>
      <div class="dropzone" id="dropzone">
        <b>Upload match data</b>
        <p>Drop an XLSX, CSV or TSV file, or an MFL Results JSON backup.</p>
        <button class="button secondary" data-action="choose-file">Choose file</button>
        <input type="file" id="import-file" accept=".xlsx,.csv,.tsv,.txt,.json" aria-label="Choose a match data file" hidden>
      </div>
    </div>
    <p class="import-info" id="import-status" role="status" hidden></p>
    <p class="error" id="dialog-error" role="alert" hidden></p>`,
    '<button class="button secondary" data-action="template">Download CSV template</button>', true);
}

async function openFile(file) {
  if (!file || busy) return;
  const status = dialog.querySelector("#import-status");
  status.textContent = "Reading spreadsheet…";
  status.hidden = false;
  setBusy(true);
  dialogError("");
  try {
    imports = await fromFile(file);
    importName = file.name;
    renderImport();
  } catch (error) {
    status.hidden = true;
    dialogError(error.message);
  } finally {
    setBusy(false);
    if (imports.length) updateImportReview();
  }
}

function previewPasted() {
  try {
    imports = fromPaste(dialog.querySelector("#pasted").value);
    importName = imports[0].name;
    renderImport();
  } catch (error) {
    dialogError(error.message);
  }
}

function renderImport() {
  const html = imports[0].kind === "html";
  const listing = imports.map((sheet, index) => {
    let mapping = "";
    if (!html) {
      const options = [[-1, "Unmapped"], ...sheet.headers.map((label, column) => [column, label || "Column " + (column + 1)])];
      const fields = FIELDS.map(([name, label]) => select("map-" + index + "-" + name, label, options, sheet.map[name])).join("");
      mapping = `<details${sheet.score < 11 ? " open" : ""}><summary>Map columns</summary><div class="mapping">${fields}</div></details>`;
    }
    return `<div class="sheet-card"><div class="sheet-line">
      <label class="sheet-toggle"><input type="checkbox" name="sheet-${index}" ${sheet.selected ? "checked" : ""}>
        ${escape(sheet.name)} <span class="sheet-checkbox"><small>${sheet.rows.length}${sheet.rows.length === 1 ? " row" : " rows"}</small></span></label>
      ${select("import-club-" + index, html ? "Club for these rows" : "Club for this sheet", clubOptions("Identify by row"), sheet.club)}
    </div>${mapping}</div>`;
  }).join("");
  showDialog("Review import", importName, `<div class="import-source">
    <p>${html ? "For a draw between two tracked clubs, select the club whose results you copied." : "Choose the sheets to import. Each row needs both formations, xG and ratings for the analysis."}</p>
    ${listing}
  </div><div id="review" aria-live="polite"></div><p class="error" id="dialog-error" role="alert" hidden></p>`,
  '<button class="button secondary" data-action="import">Choose another source</button><button class="button primary" id="confirm-import" data-action="confirm-import">Import matches</button>', true);
  updateImportReview();
}

function updateImportReview() {
  reviewed = review(imports, matches);
  const { rows, problems, duplicates, preview: examples } = reviewed;
  const preview = examples.map(({ match, duplicate }) => `<tr>${matchCells(analyseMatch(match))}
    <td>${duplicate ? "Duplicate" : "Ready"}</td></tr>`).join("");
  const errors = problems.length ? `<div class="import-errors"><b>${problems.length} ${problems.length === 1 ? "issue" : "issues"} to review</b>
    <ul>${problems.slice(0, 20).map(item => `<li>${escape(item.sheet)}${item.line ? " · row " + item.line : ""}. ${escape(item.error)}</li>`).join("")}</ul>
    ${problems.length > 20 ? "<p>The first 20 issues are shown.</p>" : ""}</div>` : "";
  const stats = rows.length + " ready · " + duplicates + (duplicates === 1 ? " duplicate" : " duplicates")
    + (problems.length ? " · " + problems.length + (problems.length === 1 ? " issue" : " issues") : "");
  dialog.querySelector("#review").innerHTML = `<p class="import-info">${stats}</p>${errors}${preview ? `
    <div class="table-scroll preview-rows" tabindex="0" role="region" aria-label="Match import preview">
      <table class="data-table"><thead><tr>${MATCH_HEADERS}<th>Status</th></tr></thead><tbody>${preview}</tbody></table>
    </div>` : ""}`;
  const button = dialog.querySelector("#confirm-import");
  button.textContent = rows.length ? "Import " + rows.length + (rows.length === 1 ? " valid match" : " valid matches") : "Import matches";
  button.disabled = !rows.length || busy;
}

async function saveImport() {
  if (!reviewed.rows.length) return;
  const { rows, duplicates } = reviewed;
  let inserted = 0;
  let skipped = duplicates;
  setBusy(true);
  dialogError("");
  try {
    for (let start = 0; start < rows.length; start += IMPORT_SIZE) {
      dialog.querySelector(".import-info").textContent = "Saving " + Math.min(start + IMPORT_SIZE, rows.length) + " of " + rows.length + " matches…";
      const result = await api("/api/matches", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matches: rows.slice(start, start + IMPORT_SIZE), source: imports[0].kind }),
      });
      inserted += result.inserted;
      skipped += result.skipped;
    }
    await loadMatches();
    dialog.close();
    notify(inserted + (inserted === 1 ? " match imported" : " matches imported")
      + (skipped ? ". " + skipped + (skipped === 1 ? " duplicate skipped." : " duplicates skipped.") : "."));
  } catch (error) {
    try { await loadMatches(); } catch { /* A retry remains safe because imports are deduplicated. */ }
    dialogError((inserted ? inserted + " matches saved. " : "") + error.message);
  } finally {
    setBusy(false);
    if (dialog.open) updateImportReview();
  }
}

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([TEMPLATE], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "MFL-match-import.csv";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

document.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button || busy) return;
  const { action, id } = button.dataset;
  const row = id ? model.rows.find(match => match.id === Number(id)) : null;
  switch (action) {
    case "import": importStart(); break;
    case "close": dialog.close(); break;
    case "retry": start(); break;
    case "cell": pairDetails(button.dataset); break;
    case "match": if (row) matchDetails(row); break;
    case "remove": if (row) confirmRemove(row); break;
    case "confirm-remove": if (row) void removeMatch(row.id); break;
    case "choose-file": dialog.querySelector("#import-file").click(); break;
    case "preview-paste": previewPasted(); break;
    case "confirm-import": void saveImport(); break;
    case "template": downloadTemplate(); break;
    case "view-pair":
      Object.assign(state, { matchesClub: activePair.club, matchPair: activePair, matchesVenue: "", competition: "", query: "", page: 0 });
      dialog.close();
      navigate("matches");
      break;
    case "clear-pair":
      state.matchPair = null;
      state.page = 0;
      render();
      break;
    case "page":
      state.page = Number(button.dataset.page);
      render();
      document.querySelector(".pager .button:not(:disabled)")?.focus({ preventScroll: true });
      break;
  }
});

const regularFields = new Set(["club", "metric", "matrixOpponent", "matchupsFormation", "matchupsMetric", "matchesClub", "competition", "matchesVenue"]);
const pickerFields = new Set(["pickerClub", "opponent", "ownOvr", "opponentOvr", "venue", "prior"]);
document.addEventListener("change", event => {
  const field = event.target;
  if (field.id === "import-file") {
    void openFile(field.files[0]);
    return;
  }
  const { name, value } = field;
  if (dialog.contains(field) && imports.length) {
    const sheet = name.match(/^sheet-(\d+)$/);
    const club = name.match(/^import-club-(\d+)$/);
    const map = name.match(/^map-(\d+)-(.+)$/);
    if (sheet) imports[Number(sheet[1])].selected = field.checked;
    if (club) imports[Number(club[1])].club = value;
    if (map) imports[Number(map[1])].map[map[2]] = Number(value);
    if (sheet || club || map) updateImportReview();
    return;
  }
  if (regularFields.has(name)) {
    state[name] = value;
    state.page = 0;
    render(name);
  } else if (pickerFields.has(name)) {
    const key = name === "pickerClub" ? "club" : name;
    if (field.type === "number") {
      if (!value || !field.validity.valid) {
        field.value = state.picker[key];
        notify("Enter a whole number from " + field.min + " to " + field.max + ".");
        return;
      }
      state.picker[key] = field.valueAsNumber;
    } else state.picker[key] = value;
    render(name);
  }
});

document.addEventListener("submit", event => {
  if (event.target.id !== "match-search") return;
  event.preventDefault();
  state.query = new FormData(event.target).get("search").trim();
  state.page = 0;
  render("search");
});

dialog.addEventListener("cancel", event => { if (busy) event.preventDefault(); });
dialog.addEventListener("dragover", event => {
  const drop = event.target.closest("#dropzone");
  if (!drop) return;
  event.preventDefault();
  drop.classList.add("over");
});
dialog.addEventListener("dragleave", event => event.target.closest("#dropzone")?.classList.remove("over"));
dialog.addEventListener("drop", event => {
  const drop = event.target.closest("#dropzone");
  if (!drop) return;
  event.preventDefault();
  drop.classList.remove("over");
  void openFile(event.dataTransfer.files[0]);
});

window.addEventListener("hashchange", () => render());
void start();
