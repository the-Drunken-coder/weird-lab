// Throwaway static mocks. Question: which hierarchy best explains a repo's planning artifacts?
const snapshot = await fetch('./sources.json').then(response => response.json());
const repositoryUrl = 'https://github.com/' + snapshot.repository;
const issue = number => snapshot.issues.find(item => item.number === number);
const names = { A: 'Artifact explorer', B: 'Wayfinder atlas', C: 'Reading room' };
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const cleanTitle = value => escapeHtml(value.replaceAll('—', ','));
const icons = {
  compass: '<path d="m12 3 8 17-8-5-8 5z"/><path d="M12 3v12"/>',
  folder: '<path d="M3 7V5h6l2 2h10v12H3z"/>',
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 12h6M9 16h6"/>',
  ticket: '<path d="M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4z"/><path d="M9 8v2m0 3v3"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
  layers: '<path d="m3 7 9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  link: '<path d="M9 15 15 9M8 17l-1 1a4 4 0 0 1-5-5l4-4a4 4 0 0 1 5 0M16 7l1-1a4 4 0 0 1 5 5l-4 4a4 4 0 0 1-5 0"/>',
  arrow: '<path d="M6 18 18 6M6 6h12v12"/>',
  left: '<path d="m14 6-6 6 6 6"/>',
  right: '<path d="m10 6 6 6-6 6"/>',
  closed: '<circle cx="12" cy="12" r="8"/><path d="m8 12 3 3 5-6"/>',
  branch: '<circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="7" r="2"/><path d="M6 7v10M6 14c8 0 12-2 12-5"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const sourceLink = (url, label = 'Open on GitHub') => `<a class="source-link" href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${label}${icon('arrow')}</a>`;
const status = number => `<span class="status">${icon('closed')}${issue(number).state === 'closed' ? 'Closed' : 'Open'}</span>`;
const variantUrl = key => '?variant=' + key;
const fileUrl = file => repositoryUrl + '/blob/main/' + file;
const topbar = () => `
  <header class="topbar">
    <a class="brand" href="?variant=A" aria-label="Skill Atlas, artifact explorer"><span class="brandmark">${icon('compass')}</span>Skill Atlas</a>
    <div class="repo-address">${icon('branch')}<span class="mono">${snapshot.repository}</span></div>
    <div class="topbar-right"><span class="mock-note">Static mock · public source snapshot</span>${sourceLink(repositoryUrl, 'Source repo')}</div>
  </header>`;

const decisions = [
  { number: 1198, name: 'Remove repo backing entirely', summary: 'Remove the backing in one change, without a feature flag.' },
  { number: 1199, name: 'Publish only MP4 + course.json', summary: 'Build the published course from database records.' },
  { number: 1200, name: 'Keep todo/done as a lesson flag', summary: 'Separate lesson state from the filesystem.' },
  { number: 1201, name: 'One video directory per lineage', summary: 'Keep video files stable when versions are copied.' },
  { number: 1202, name: 'Migrate rows; leave old repos', summary: 'Change the database and rename existing standalone directories.' },
  { number: 1203, name: 'Sequence the title-path work', summary: 'Keep the useful slices and retire folder-moving work.' },
  { number: 1204, name: 'Retire the course agent', summary: 'Use the CVM CLI for course editing.' },
  { number: 1205, name: 'Remove the unused Git push', summary: 'The publishing flow has no active dependency on it.' },
  { number: 1206, name: 'Use titles in course.json', summary: 'Remove paths that encode ordering in an identifier.' }
];

const rows = [
  { number: 1197, name: 'Remove local-repo backing', kind: 'Wayfinder', symbol: 'map', detail: '9 linked decision issues', url: '#selected-map' },
  { number: 1265, name: 'TikTok creator', kind: 'Wayfinder', symbol: 'map', detail: 'Short-form video, rendering & posting', url: issue(1265).html_url },
  { number: 1723, name: 'Clip Mockup Chapters', kind: 'Specification', symbol: 'file', detail: 'Animatic navigation and the Mockups tab', url: variantUrl('C') },
  { number: 1725, name: 'Shared order space, add/list', kind: 'Ticket', symbol: 'ticket', detail: 'Parent reference → #1723', url: issue(1725).html_url }
];

export function VariantA() {
  return `${topbar()}
  <div class="explorer">
    <aside class="rail">
      <div class="rail-project"><p class="eyebrow">Public repository</p><strong>mattpocock /<br>course-video-manager</strong></div>
      <nav class="rail-menu" aria-label="Artifact navigation">
        <a href="#artifact-index" class="rail-item active">${icon('layers')}Artifact index<span class="count">04</span></a>
        <a href="?variant=C" class="rail-item">${icon('file')}Specifications<span class="count">01</span></a>
        <a href="${issue(1725).html_url}" target="_blank" rel="noreferrer" class="rail-item">${icon('ticket')}Tickets<span class="count">01</span></a>
        <a href="?variant=B" class="rail-item">${icon('map')}Wayfinder maps<span class="count">02</span></a>
        <a href="${fileUrl('CONTEXT.md')}" target="_blank" rel="noreferrer" class="rail-item">${icon('folder')}Domain & decisions</a>
        <a href="#skill-evidence" class="rail-item">${icon('link')}Skill evidence</a>
      </nav>
      <div class="rail-note"><strong>Matt Pocock conventions</strong>Recognize the format.<br>Keep the source attached.</div>
      <div class="rail-bottom sample-foot">Design study 01<br>13 source issues captured<br>No live scan in this mock</div>
    </aside>
    <main class="workbench">
      <div class="repo-heading">
        <div><p class="owner mono">mattpocock /</p><h1>course-video-manager</h1><p>Specifications, implementation tickets, and the decisions behind them.</p></div>
        <a class="repo-github" href="${repositoryUrl}" target="_blank" rel="noreferrer">${icon('branch')}View repository${icon('arrow')}</a>
      </div>
      <div class="index-layout">
        <div class="index-main">
          <section id="artifact-index" aria-label="Featured artifacts">
            <div class="index-toolbar"><h2>Artifact index</h2><span>4 featured artifacts · captured snapshot</span></div>
            <table class="artifact-table"><thead><tr><th>Artifact</th><th>Format</th><th>Source</th></tr></thead><tbody>
              ${rows.map(row => `<tr class="${row.number === 1197 ? 'selected' : ''}"><td><a href="${row.url}" class="artifact-title">${icon(row.symbol)}<div>${row.name}<span>${row.detail}</span></div></a></td><td class="kind">${row.kind}</td><td class="mono id">#${row.number}</td></tr>`).join('')}
            </tbody></table>
          </section>
          <section class="map-detail" id="selected-map">
            <div class="detail-kicker"><span class="eyebrow">Wayfinder map</span><span class="mono muted">#1197</span>${status(1197)}</div>
            <h2>Remove the local-repo<br>backing from CVM courses</h2>
            <p>Move course structure into the database. Keep each video's local files in one directory. This map settles the choices needed before writing the implementation spec.</p>
            <div class="decisions-head"><span>Decisions recorded</span><span class="mono muted">9 linked issues · all closed</span></div>
            ${decisions.slice(0, 4).map(item => `<a class="decision-line" href="${issue(item.number).html_url}" target="_blank" rel="noreferrer"><span class="tick">✓</span>${item.name}<span class="mono">#${item.number}</span></a>`).join('')}
            <div class="remaining"><a href="?variant=B">Read all 9 decisions in the atlas →</a></div>
          </section>
        </div>
        <aside class="evidence" aria-label="Classification evidence">
          <div class="block"><h3>Why this is a map</h3><code class="label-code">wayfinder:map</code><p>Explicit GitHub label. The body has a destination, recorded decisions, and unresolved scope.</p><div style="margin-top:12px">${sourceLink(issue(1197).html_url, 'Read source issue')}</div></div>
          <div class="block" id="skill-evidence"><h3>Skills referenced</h3><div class="skill-ref mono">/grilling</div><div class="skill-ref mono">/domain-modeling</div><p style="margin-top:8px">Named in this map's Notes section.</p></div>
          <div class="block"><h3>Repository context</h3>${['CLAUDE.md', 'CONTEXT.md', 'docs/adr/'].map(file => `<a class="file" href="${file.endsWith('/') ? repositoryUrl + '/tree/main/' + file : fileUrl(file)}" target="_blank" rel="noreferrer">${file}${icon('arrow')}</a>`).join('')}</div>
          <p class="bottom">A closed planning issue records a decision. Implementation status belongs to its tickets and pull requests.</p>
        </aside>
      </div>
    </main>
  </div>`;
}

const groups = [
  { name: 'Data & identity', numbers: [1198, 1200, 1206] },
  { name: 'Files & publishing', numbers: [1201, 1199, 1205] },
  { name: 'Migration & cleanup', numbers: [1202, 1203, 1204] }
];

export function VariantB() {
  return `${topbar()}
  <section class="atlas-head"><div><p class="eyebrow">Wayfinder atlas / #1197</p><h1>A course without a local repo.</h1></div><div class="key"><span class="square"></span>9 recorded decisions<span class="mono">·</span>All 9 source issues closed</div></section>
  <div class="atlas-layout">
    <main class="atlas-main">
      <div class="atlas-tools"><div class="tabs"><span class="active">Decision map</span><a href="?variant=A">Artifact index</a><a href="${issue(1197).html_url}" target="_blank" rel="noreferrer">Source issue ↗</a></div><span class="mono">Grouped by subject</span></div>
      <div class="map-scroll" aria-label="Wayfinder decisions grouped by subject">
        <div class="decision-map">
          <svg class="connections" viewBox="0 0 800 442" preserveAspectRatio="none" aria-hidden="true"><path d="M400 112v21M400 133H132v20M400 133v20M400 133h268v20" stroke="currentColor" stroke-width="1" fill="none"/><circle cx="400" cy="133" r="3" fill="currentColor"/></svg>
          <section class="map-root"><p class="eyebrow">Destination · map #1197</p><strong>Course structure in the DB.<br>Video files keyed by lineage.</strong></section>
          ${groups.map(group => `<section class="map-group"><h2 class="map-group-title">${group.name}</h2>${group.numbers.map(number => { const item = decisions.find(item => item.number === number); return `<a class="map-node ${number === 1201 ? 'active' : ''}" href="${issue(number).html_url}" target="_blank" rel="noreferrer"><div class="node-meta"><span>#${number}</span><span>✓ CLOSED</span></div><div class="node-name">${item.name}</div></a>`; }).join('')}</section>`).join('')}
        </div>
      </div>
      <div class="map-legend"><span>Lines connect the map to its decisions.<br>They do not imply an order or dependency.</span><span class="mono">Notes reference /grilling + /domain-modeling<br>Public issue snapshot · static study</span></div>
    </main>
    <aside class="atlas-aside">
      <p class="eyebrow">Selected decision / #1201</p>${status(1201)}
      <h2>One home for<br>every video's files.</h2>
      <p>A stable video lineage identifies the local directory, across course versions and standalone videos.</p>
      <div class="answer"><h3>Decision recorded</h3><p>Use one local directory per video lineage. Creating another course version reuses those files. Keep lesson and standalone video storage on the same model.</p></div>
      <div class="answer"><h3>Part of this effort</h3><p>Remove the local-repo backing from CVM courses.</p>${sourceLink(issue(1197).html_url, 'Parent map #1197')}</div>
      <div class="evidence-strip">Evidence<br><code>wayfinder:grilling</code><br>Linked from “Decisions so far” in #1197.<br>The result shown here is a paraphrase.</div>
      ${sourceLink(issue(1201).html_url, 'Read the full decision')}
    </aside>
  </div>`;
}

export function VariantC() {
  return `${topbar()}
  <div class="reading-header"><div class="repo-name"><span class="muted mono">mattpocock /</span>course-video-manager</div><nav class="sections" aria-label="Reader navigation"><a class="active" href="#spec">Specifications</a><a href="#related-ticket">Related ticket</a><a href="?variant=B">Wayfinder</a><a href="#repository-sources">Repository docs</a></nav></div>
  <div class="reader-layout">
    <aside class="contents"><p class="eyebrow">In this specification</p><nav aria-label="Table of contents"><a href="#problem" class="active">01 &nbsp; Problem</a><a href="#solution">02 &nbsp; Solution</a><a href="#implementation">03 &nbsp; Decisions</a><a href="#testing">04 &nbsp; Testing</a><a href="#scope">05 &nbsp; Scope</a></nav><div class="source-note">GitHub issue #1723<br>Spec format match<br><br>Headings match Matt's<br>to-spec convention.<br>Authorship is not inferred.</div></aside>
    <main class="document" id="spec">
      <div class="document-kicker"><span class="eyebrow">Specification</span><span class="mono">#1723</span></div>
      <h1>Give the Animatic<br>a little structure.</h1>
      <div class="dek">Clip Mockup Chapters for the Animatic,<br>and delete the Mockups tab.</div>
      <div class="document-meta">${status(1723)}<span class="mono muted">Source label: Sandcastle</span>${sourceLink(issue(1723).html_url, 'Original spec')}</div>
      <section id="problem"><h2>The problem</h2><p>Long Animatics need a way to find and collapse groups of mockups. A separate editing tab also duplicates an existing workflow.</p></section>
      <section id="solution"><h2>The solution</h2><p>Add named chapter dividers to the ordered mockups. Show those groups in the Animatic sidebar, with navigation and collapse controls. Keep writes in the CLI and remove the Mockups tab.</p></section>
      <div class="principle">Chapters and mockups share one order.<br>Membership follows position.</div>
      <section id="implementation"><h2>The decisions</h2><p>Store chapters as video-owned rows. Copy them with mockups while preserving their combined order. Keep this planning structure separate from published course output.</p></section>
      <section id="testing"><h2>What the tests establish</h2><p>Exercise add, move, list, and delete through the existing CLI. Check that copying preserves the order of both kinds of row, and that grouping handles empty chapters.</p></section>
      <section id="scope"><h2>What stays outside</h2><p>Chapter writes in the UI, shared collapse state, links to Beats, and changes to published courses are outside this spec.</p></section>
      <p class="notes-line">Paraphrased for this static study. Read the source for the complete specification.</p>
    </main>
    <aside class="related">
      <p class="eyebrow">Alongside the spec</p>
      <section class="ticket" id="related-ticket"><div style="display:flex;justify-content:space-between"><span class="mono muted">TICKET #1725</span>${status(1725)}</div><h3>The noun, one shared order space, and add/list</h3><p>Deliver the chapter model and the first CLI commands together.</p><div class="relation">${icon('link')}Parent #1723 · body reference</div><div class="acceptance"><ul><li>Add a divider at an anchor.</li><li>List chapters in video order.</li><li>Preserve mockup behavior.</li></ul></div><p class="tiny">Closed issue. The source acceptance checkboxes remain unchecked.</p>${sourceLink(issue(1725).html_url, 'Read implementation ticket')}</section>
      <section class="sources" id="repository-sources"><h3>Read with the repository</h3><a href="${fileUrl('CONTEXT.md')}" target="_blank" rel="noreferrer">CONTEXT.md ↗</a><a href="${repositoryUrl}/tree/main/docs/adr" target="_blank" rel="noreferrer">docs/adr/ ↗</a><a href="${fileUrl('CLAUDE.md')}" target="_blank" rel="noreferrer">CLAUDE.md ↗</a><p>The domain vocabulary and project rules explain the terms this spec uses.</p></section>
    </aside>
  </div>`;
}

function currentVariant() {
  const requested = new URLSearchParams(location.search).get('variant');
  return Object.hasOwn(names, requested) ? requested : 'A';
}

function switchVariant(direction) {
  const keys = Object.keys(names);
  const next = keys[(keys.indexOf(currentVariant()) + direction + keys.length) % keys.length];
  const url = new URL(location.href);
  url.searchParams.set('variant', next);
  history.replaceState(null, '', url);
  render();
  window.scrollTo(0, 0);
}

function render() {
  const key = currentVariant();
  const selected = key === 'C' ? 1723 : key === 'B' ? 1201 : 1197;
  const state = {
    question: 'Which hierarchy makes repo planning easiest to understand?',
    variant: key,
    layout: names[key],
    mode: 'static mock, no live scan',
    repository: snapshot.repository,
    capturedAt: snapshot.capturedAt,
    snapshotIssues: snapshot.issues.length,
    selectedIssue: selected,
    issueState: issue(selected).state,
    labels: issue(selected).labels,
    source: issue(selected).html_url,
    relationship: key === 'C' ? '#1725 references #1723 in its body' : '#1197 links nine decision issues',
    mapLines: 'membership, not dependencies',
    persistence: 'none'
  };
  document.body.className = 'variant-' + key.toLowerCase();
  document.title = names[key] + ' · Skill Atlas static prototype';
  document.querySelector('#app').innerHTML = ({ A: VariantA, B: VariantB, C: VariantC })[key]() +
    `<details class="prototype-state"><summary>Prototype state · ${key} · source snapshot</summary><pre>${escapeHtml(JSON.stringify(state, null, 2))}</pre></details>
    <nav class="prototype-switcher" aria-label="Compare static design directions">
      <button id="previous-variant" type="button" aria-label="Previous design direction">${icon('left')}</button>
      <div class="label" aria-live="polite"><small>Static design study · ${Object.keys(names).indexOf(key) + 1} / 3</small>${key} · ${names[key]}</div>
      <button id="next-variant" type="button" aria-label="Next design direction">${icon('right')}</button>
    </nav>`;
  document.querySelector('#previous-variant').addEventListener('click', () => switchVariant(-1));
  document.querySelector('#next-variant').addEventListener('click', () => switchVariant(1));
  console.info('Skill Atlas prototype state', state);
}

document.addEventListener('click', event => {
  const link = event.target instanceof Element ? event.target.closest('a[href^="?variant="]') : null;
  if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  history.replaceState(null, '', link.getAttribute('href'));
  render();
  window.scrollTo(0, 0);
});

document.addEventListener('keydown', event => {
  if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault();
    switchVariant(event.key === 'ArrowLeft' ? -1 : 1);
  }
});
window.addEventListener('popstate', render);
render();
