import './styles.css';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { parseRepoInput, scanRepository, hydrateArtifact } from './github.ts';
import type { Artifact, ArtifactKind, RepoRef, ScanResult } from './model.ts';

type View = 'explorer' | 'atlas' | 'reader';
type Filter = 'all' | 'spec' | 'ticket' | 'wayfinder' | 'skill' | 'docs';
const app = document.getElementById('app') ?? document.body;
const escape = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const labels: Record<ArtifactKind, string> = { spec: 'Specification', ticket: 'Ticket', wayfinder: 'Wayfinder map', decision: 'Decision', domain: 'Domain model', adr: 'Architecture decision', research: 'Research', prototype: 'Prototype', skill: 'Repo skill', instructions: 'Project instructions', document: 'Document' };
const symbols = {
  compass: '<path d="m12 3 8 17-8-5-8 5zM12 3v12"/>',
  file: '<path d="M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3zM9 3v15M15 6v15"/>',
  layers: '<path d="m3 7 9-4 9 4-9 4zM3 12l9 4 9-4M3 17l9 4 9-4"/>',
  ticket: '<path d="M4 5h16v5a2 2 0 0 0 0 4v5H4v-5a2 2 0 0 0 0-4zM9 8v2m0 3v3"/>',
  arrow: '<path d="M6 18 18 6M6 6h12v12"/>',
  closed: '<circle cx="12" cy="12" r="8"/><path d="m8 12 3 3 5-6"/>',
  open: '<circle cx="12" cy="12" r="8"/><path d="M12 8v5M12 16h.01"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6"/>',
  link: '<path d="m9 15 6-6M8 17l-1 1a4 4 0 0 1-5-5l4-4a4 4 0 0 1 5 0M16 7l1-1a4 4 0 0 1 5 5l-4 4a4 4 0 0 1-5 0"/>'
};
const icon = (name: keyof typeof symbols) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${symbols[name]}</svg>`;
const kindIcon = (kind: ArtifactKind) => icon(kind === 'wayfinder' ? 'map' : kind === 'ticket' || kind === 'decision' ? 'ticket' : 'file');
const source = (artifact: Artifact, text = 'Read on GitHub') => `<a class="source-link" href="${escape(artifact.sourceUrl)}" target="_blank" rel="noreferrer">${text}${icon('arrow')}</a>`;
const identity = (artifact: Artifact) => artifact.issueNumber ? '#' + artifact.issueNumber : artifact.path ?? artifact.id;
const status = (artifact: Artifact) => artifact.status === 'unknown' ? `<span class="status">${artifact.sourceKind === 'file' ? 'Repository file' : 'Not loaded'}</span>` : `<span class="status ${artifact.status}">${icon(artifact.status)}${artifact.status === 'closed' ? 'Closed' : 'Open'}</span>`;
const parser = new Marked({ gfm: true, renderer: { checkbox({ checked }) { return `<span class="source-check" aria-label="${checked ? 'Checked' : 'Unchecked'}">${checked ? '☑' : '☐'}</span>`; } } });

function markdown(artifact: Artifact, body = artifact.body ?? '') {
  const template = document.createElement('template');
  template.innerHTML = DOMPurify.sanitize(parser.parse(body, { async: false }), {
    USE_PROFILES: { html: true }, ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['style', 'iframe', 'form', 'button', 'input']
  });
  template.content.querySelectorAll('a').forEach(link => {
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#')) return;
    try {
      const url = new URL(href, artifact.sourceUrl);
      if (!['https:', 'http:', 'mailto:'].includes(url.protocol)) { link.removeAttribute('href'); return; }
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noreferrer';
    } catch { link.removeAttribute('href'); }
  });
  template.content.querySelectorAll('img').forEach(image => {
    const href = image.getAttribute('src');
    if (!href) return;
    try {
      const base = artifact.sourceUrl.replace('https://github.com/', 'https://raw.githubusercontent.com/').replace('/blob/', '/');
      const url = new URL(href, base);
      if (!['https:', 'http:'].includes(url.protocol)) { image.remove(); return; }
      image.src = url.href;
      image.loading = 'lazy';
    } catch { image.remove(); }
  });
  const headingIds = new Set<string>();
  template.content.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach(heading => {
    const slug = (heading.textContent ?? '').trim().toLowerCase().replace(/[^\p{L}\p{M}\p{N}_\-\s]/gu, '').replace(/\s/g, '-') || 'section';
    let id = slug;
    let suffix = 0;
    while (headingIds.has(id)) id = slug + '-' + ++suffix;
    headingIds.add(id);
    heading.id = id;
  });
  return template.innerHTML;
}

let result: ScanResult | undefined;
let selected: Artifact | undefined;
let selectedDecision: Artifact | undefined;
let view: View = 'explorer';
let filter: Filter = 'all';
let search = '';
let stateFilter = 'all';
let sort = 'recent';
let rowLimit = 100;
let loading = false;
let progress = '';
let error = '';
let documentLoading = false;
let documentError = '';
let inputValue = '';
let scanController: AbortController | undefined;
let artifactController: AbortController | undefined;
let navigationVersion = 0;

function header() {
  return `<header class="topbar"><a class="brand" href="/" data-action="home"><span class="brandmark">${icon('compass')}</span>Skill Atlas</a>
    ${result ? `<a class="repo-address" href="${escape(result.repository.htmlUrl)}" target="_blank" rel="noreferrer"><span class="mono">${escape(result.repository.fullName)}</span>${icon('arrow')}</a>` : ''}
    <div class="topbar-right"><span class="mock-note">Working prototype · public GitHub</span>${result ? '<button class="text-button" data-action="home">Change repository</button>' : ''}</div></header>`;
}

function repositoryForm() {
  return `<form id="repository-form"><label for="repository-input">Public GitHub repository</label><div class="repo-input-row"><input id="repository-input" name="repository" type="text" autocomplete="off" spellcheck="false" placeholder="github.com/owner/repository" value="${escape(inputValue)}" required ${loading ? 'disabled' : ''}><button type="submit" class="primary-button" ${loading ? 'disabled' : ''}>Open repository →</button></div></form>`;
}

function renderHome() {
  document.body.className = '';
  document.title = 'Skill Atlas · Read the work behind a repository';
  app.innerHTML = `${header()}<main class="home">
    <p class="eyebrow">A field guide to the work behind the code</p><h1>Open a repo.<br>Read how it gets built.</h1>
    <p class="home-copy">Specs, tickets, Wayfinder decisions, and coding skills.<br>Collected from public GitHub sources, with the evidence attached.</p>
    ${repositoryForm()}
    ${loading ? `<div class="scan-progress" role="status"><span class="loading-dot"></span>${escape(progress)}<button class="text-button" data-action="cancel">Cancel</button></div>` : ''}
    ${error ? `<div class="error-message" role="alert">${escape(error)}</div>` : ''}
    <div class="examples"><span>Try a repository</span><button data-action="example" data-repo="mattpocock/course-video-manager" ${loading ? 'disabled' : ''}>course-video-manager →</button><button data-action="example" data-repo="mattpocock/skills" ${loading ? 'disabled' : ''}>Matt's skills →</button></div>
    <div class="home-index"><span>01 &nbsp; Specifications & tickets</span><span>02 &nbsp; Wayfinder maps</span><span>03 &nbsp; Skills & project docs</span></div>
    <p class="home-foot">Public repositories only. Reads from GitHub. Nothing is written to the repository.</p>
  </main>`;
}

function matchesCategory(artifact: Artifact, category: Filter) {
  if (category === 'all') return true;
  if (category === 'wayfinder') return artifact.kind === 'wayfinder' || artifact.kind === 'decision';
  if (category === 'docs') return ['domain', 'adr', 'research', 'prototype', 'instructions', 'document'].includes(artifact.kind);
  return artifact.kind === category;
}

function visibleArtifacts() {
  const artifacts = (result?.artifacts ?? []).filter(artifact =>
    matchesCategory(artifact, filter) &&
    (stateFilter === 'all' || artifact.status === stateFilter) &&
    (!search || [artifact.title, artifact.path, artifact.issueNumber, ...artifact.labels, ...artifact.referencedSkills].join(' ').toLowerCase().includes(search.toLowerCase()))
  );
  return artifacts.sort((a, b) => sort === 'title' ? a.title.localeCompare(b.title) : (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '') || a.title.localeCompare(b.title));
}

function warningPanel() {
  if (!result) return '';
  const warnings = [...new Set([...result.warnings, ...(selected?.relationshipWarnings ?? []), ...(view === 'atlas' ? selectedDecision?.relationshipWarnings ?? [] : [])])];
  return warnings.length ? `<details class="scan-warnings"><summary>Partial scan · ${warnings.length} source limitation${warnings.length === 1 ? '' : 's'}</summary><ul>${warnings.map(warning => `<li>${escape(warning)}</li>`).join('')}</ul></details>` : '';
}

function coverage() {
  if (!result) return '';
  return `<details class="coverage"><summary>Sources scanned</summary><p>${result.coverage.issues} issue records · ${result.coverage.files} file paths · ${result.coverage.filesRead} files read</p><p>Default branch: ${escape(result.repository.defaultBranch)}<br>Scanned ${escape(new Date(result.scannedAt).toLocaleString())}</p>${result.coverage.issueQueries.map(query => `<p>${escape(query.query)}<br>${query.scanned} results read${query.total === null ? '' : ' of ' + query.total}${query.truncated ? ' · partial' : ''}</p>`).join('')}</details>`;
}

function evidence(artifact: Artifact) {
  return `<div class="block"><h3>Why this is ${artifact.kind === 'wayfinder' ? 'a map' : 'recognized'}</h3>${artifact.evidence.map(item => `<p>${escape(item)}</p>`).join('')}<div class="evidence-source">${source(artifact, 'Read original source')}</div></div>
    ${artifact.labels.length ? `<div class="block"><h3>Source labels</h3>${artifact.labels.map(label => `<code class="label-code">${escape(label)}</code>`).join('')}</div>` : ''}
    ${artifact.referencedSkills.length ? `<div class="block"><h3>Skills referenced</h3>${artifact.referencedSkills.map(skill => `<div class="skill-ref mono">${escape(skill)}</div>`).join('')}<p>Referenced in the source. Execution is not inferred.</p></div>` : ''}
    ${relationships(artifact)}
    ${coverage()}`;
}

function relationships(artifact: Artifact) {
  const linked = artifact.relationships.filter(link => link.targetId !== artifact.id);
  if (!linked.length) return '';
  return `<div class="block"><h3>Related work</h3>${linked.slice(0, 20).map(link => {
    const target = result?.artifacts.find(item => item.id === link.targetId);
    const content = `<span>${escape(target?.title ?? link.targetId.replace('issue:', 'Issue #').replace('file:', '').replace('url:', ''))}</span><small>${link.kind} · ${link.basis === 'github' ? 'GitHub relationship' : 'body reference'}</small>`;
    return target || /^issue:\d+$/.test(link.targetId) ? `<button class="relation-link" data-action="open" data-id="${escape(link.targetId)}">${content}</button>` : `<a class="relation-link" href="${escape(link.sourceUrl)}" target="_blank" rel="noreferrer">${content}</a>`;
  }).join('')}${linked.length > 20 ? `<p>${linked.length - 20} more references in the original source.</p>` : ''}</div>`;
}

function preview(artifact: Artifact) {
  return `<section class="map-detail"><div class="detail-kicker"><span class="eyebrow">${labels[artifact.kind]}</span><span class="mono muted">${escape(identity(artifact))}</span>${status(artifact)}</div>
    <h2>${escape(artifact.title)}</h2>
    ${documentLoading ? '<p role="status">Reading the source…</p>' : documentError ? `<p class="error-message" role="alert">${escape(documentError)}</p><button class="text-button" data-action="retry-artifact">Retry source</button>` : `<div class="markdown source-preview">${markdown(artifact, (artifact.body ?? '').slice(0, 1100))}</div>`}
    <button class="open-artifact" data-action="open" data-id="${escape(artifact.id)}">Open ${artifact.kind === 'wayfinder' ? 'decision map' : 'document'} →</button>
  </section>`;
}

function renderExplorer() {
  if (!result) return;
  const artifacts = visibleArtifacts();
  const categories: Array<{ key: Filter; text: string; symbol: keyof typeof symbols }> = [
    { key: 'all', text: 'Artifact index', symbol: 'layers' }, { key: 'spec', text: 'Specifications', symbol: 'file' },
    { key: 'ticket', text: 'Tickets', symbol: 'ticket' }, { key: 'wayfinder', text: 'Wayfinder', symbol: 'map' },
    { key: 'skill', text: 'Repo skills', symbol: 'link' }, { key: 'docs', text: 'Project documents', symbol: 'file' }
  ];
  app.innerHTML = `${header()}<div class="explorer"><aside class="rail"><div class="rail-project"><p class="eyebrow">Public repository</p><strong>${escape(result.repository.owner)} /<br>${escape(result.repository.name)}</strong></div>
    <nav class="rail-menu" aria-label="Artifact categories">${categories.map(category => `<button class="rail-item ${filter === category.key ? 'active' : ''}" data-action="filter" data-filter="${category.key}" aria-pressed="${filter === category.key}">${icon(category.symbol)}${category.text}<span class="count">${result?.artifacts.filter(artifact => matchesCategory(artifact, category.key)).length}</span></button>`).join('')}</nav>
    <div class="rail-note"><strong>Evidence, attached.</strong>Labels, file paths, and document formats explain each match.</div><div class="rail-bottom sample-foot">${result.artifacts.length} artifacts recognized<br>${result.coverage.issues} issue records scanned</div></aside>
    <main class="workbench"><div class="repo-heading"><div><p class="owner mono">${escape(result.repository.owner)} /</p><h1>${escape(result.repository.name)}</h1>${result.repository.description ? `<p>${escape(result.repository.description)}</p>` : ''}</div><button class="repo-github" data-action="refresh">Reload repository ↻</button></div>
      ${warningPanel()}<div class="index-layout"><div class="index-main"><section><div class="index-toolbar"><h2>${categories.find(category => category.key === filter)?.text}</h2><span>${artifacts.length} matching artifacts</span></div>
        <div class="index-controls"><label class="artifact-search">${icon('search')}<input id="artifact-search" aria-label="Search artifacts" placeholder="Search title, path, skill, or issue…" value="${escape(search)}"></label><select id="state-filter" aria-label="Issue status"><option value="all">All states</option><option value="open" ${stateFilter === 'open' ? 'selected' : ''}>Open</option><option value="closed" ${stateFilter === 'closed' ? 'selected' : ''}>Closed</option></select><select id="sort-filter" aria-label="Sort artifacts"><option value="recent">Recent first</option><option value="title" ${sort === 'title' ? 'selected' : ''}>Title</option></select></div>
        ${artifacts.length ? `<div class="artifact-list" tabindex="0" aria-label="Matching artifacts"><table class="artifact-table"><thead><tr><th>Artifact</th><th>Format</th><th>Source</th></tr></thead><tbody>${artifacts.slice(0, rowLimit).map(artifact => `<tr class="${selected?.id === artifact.id ? 'selected' : ''}"><td><button class="artifact-title" data-action="open" data-id="${escape(artifact.id)}">${kindIcon(artifact.kind)}<div>${escape(artifact.title)}<span>${escape(artifact.sourceKind === 'file' ? artifact.path : artifact.status + ' · ' + artifact.labels.slice(0, 2).join(', '))}</span></div></button></td><td class="kind">${labels[artifact.kind]}</td><td class="mono id">${artifact.issueNumber ? '#' + artifact.issueNumber : 'file'}</td></tr>`).join('')}</tbody></table></div>${artifacts.length > rowLimit ? '<button class="load-more" data-action="more">Show next 100 artifacts</button>' : ''}` : `<div class="empty-state"><h2>${result.artifacts.length ? 'No matching artifacts' : 'No recognized artifacts found'}</h2><p>${result.artifacts.length ? 'Try another search or category.' : 'The scanned files and issues do not match the supported formats. Check the scan coverage or open the repository on GitHub.'}</p>${result.artifacts.length ? '<button class="text-button" data-action="clear-filters">Clear filters</button>' : `<a class="source-link" href="${escape(result.repository.htmlUrl)}" target="_blank" rel="noreferrer">Read repository on GitHub ↗</a>`}</div>`}
      </section>${selected && artifacts.length ? preview(selected) : ''}</div><aside class="evidence">${selected ? evidence(selected) : coverage()}</aside></div></main></div>`;
}

function mapChildren() {
  if (!selected || !result) return [];
  const ids = new Set(selected.relationships.filter(link => link.kind === 'child').map(link => link.targetId));
  if (!ids.size) selected.relationships.filter(link => link.kind === 'reference').forEach(link => ids.add(link.targetId));
  return [...ids].map(id => result?.artifacts.find(artifact => artifact.id === id) ?? issueStub(id)).filter((artifact): artifact is Artifact => artifact !== undefined);
}

function renderAtlas() {
  if (!result || !selected) return;
  const children = mapChildren();
  const groups = new Map<string, Artifact[]>();
  children.forEach(child => {
    const type = child.labels.find(label => label.startsWith('wayfinder:') && label !== 'wayfinder:map')?.slice(10) ?? 'Linked decisions';
    groups.set(type, [...(groups.get(type) ?? []), child]);
  });
  const active = selectedDecision;
  app.innerHTML = `${header()}<section class="atlas-head"><div><p class="eyebrow">Wayfinder atlas / ${escape(identity(selected))}</p><h1>${escape(selected.title.replace(/^Wayfinder map:\s*/i, ''))}</h1></div><div class="key"><span class="square"></span>${children.length} linked issues<span class="mono">·</span>${status(selected)}</div></section>
    <div class="atlas-layout"><main class="atlas-main"><div class="atlas-tools"><div class="tabs"><span class="active">Decision map</span><button class="text-button" data-action="index">Artifact index</button><button class="text-button" data-action="reader">Read full map</button></div><span class="mono">Grouped by source label</span></div>${warningPanel()}
      ${documentLoading ? `<p class="atlas-loading" role="status">Reading ${active ? 'decision' : 'map'} relationships…</p>` : ''}
      <div class="map-scroll"><div class="atlas-canvas"><section class="live-map-root"><p class="eyebrow">Destination</p><strong>${escape(selected.title.replace(/^Wayfinder map:\s*/i, ''))}</strong></section>
      ${groups.size ? `<div class="atlas-groups" style="--group-count:${Math.min(groups.size, 4)}">${[...groups].map(([name, nodes]) => `<section class="live-map-group"><h2>${escape(name)}</h2>${nodes.map(node => `<button class="map-node ${active?.id === node.id ? 'active' : ''}" data-action="decision" data-id="${escape(node.id)}"><span class="node-meta"><span>${escape(identity(node))}</span><span>${node.status === 'unknown' ? 'NOT LOADED' : node.status.toUpperCase()}</span></span><span class="node-name">${escape(node.title)}</span></button>`).join('')}</section>`).join('')}</div>` : '<div class="atlas-empty">No decision relationships found in the loaded sources.<br>Read the original map for its complete planning history.</div>'}</div></div>
      <div class="map-legend"><span>Lines show map membership.<br>Blockers are listed in the selected issue.</span>${source(selected, 'Original map')}</div>
    </main><aside class="atlas-aside">${active ? `<p class="eyebrow">Selected decision / ${escape(identity(active))}</p>${status(active)}<h2>${escape(active.title)}</h2>${documentError ? `<p class="error-message" role="alert">${escape(documentError)}</p><button class="text-button" data-action="retry-artifact">Retry source</button>` : `<div class="markdown decision-body">${active.body === null ? (documentLoading ? '<p>Reading the source…</p>' : '<p>This source has no document body.</p>') : markdown(active)}</div>`}${evidence(active)}` : `<p class="eyebrow">The map</p><h2>Decisions before implementation.</h2><p>Select an issue to read the decision, its evidence, and any blockers.</p>${documentError ? `<p class="error-message">${escape(documentError)}</p>` : ''}${evidence(selected)}`}</aside></div>`;
}

function renderReader() {
  if (!result || !selected) return;
  const body = markdown(selected);
  const container = document.createElement('template');
  container.innerHTML = body;
  const headings = [...container.content.querySelectorAll('h1,h2,h3')].slice(0, 30);
  const related = result.artifacts.filter(artifact => artifact.id !== selected?.id && (artifact.relationships.some(link => link.targetId === selected?.id && link.kind === 'parent') || selected?.relationships.some(link => link.targetId === artifact.id && link.kind === 'child')));
  app.innerHTML = `${header()}<div class="reading-header"><div class="repo-name"><span class="muted mono">${escape(result.repository.owner)} /</span>${escape(result.repository.name)}</div><nav class="sections"><button class="text-button" data-action="index">← Artifact index</button>${selected.kind === 'wayfinder' ? '<button class="text-button" data-action="atlas">Decision map</button>' : ''}${source(selected, 'Original source')}</nav></div>
    <div class="reader-layout"><aside class="contents"><p class="eyebrow">In this document</p><nav aria-label="Table of contents">${headings.map((heading, index) => `<a href="#${heading.id}">${String(index + 1).padStart(2, '0')} &nbsp; ${escape(heading.textContent)}</a>`).join('')}</nav><div class="source-note">${escape(identity(selected))}<br>${escape(labels[selected.kind])}<br><br>Original source content.<br>Recognition evidence stays alongside.</div></aside>
    <main class="document"><div class="document-kicker"><span class="eyebrow">${labels[selected.kind]}</span><span class="mono artifact-path">${escape(identity(selected))}</span></div><h1>${escape(selected.title)}</h1><div class="document-meta">${status(selected)}${source(selected, 'Original source')}</div>${warningPanel()}
      ${documentLoading ? '<p role="status">Reading the source…</p>' : documentError ? `<div class="error-message" role="alert">${escape(documentError)}</div><button class="text-button" data-action="retry-artifact">Retry source</button>` : selected.body?.trim() ? `<article class="markdown">${body}</article>` : '<p>This source has no document body.</p>'}
    </main><aside class="related"><p class="eyebrow">Alongside the document</p>${related.length ? `<section class="ticket"><h3>Related implementation work</h3>${related.map(artifact => `<button class="relation-link" data-action="open" data-id="${escape(artifact.id)}">${escape(artifact.title)}<small>${escape(identity(artifact))} · ${escape(artifact.status)}</small></button>`).join('')}</section>` : ''}${evidence(selected)}</aside></div>`;
}

function render() {
  if (!result || loading) { renderHome(); return; }
  document.body.className = view === 'atlas' ? 'variant-b' : view === 'reader' ? 'variant-c' : '';
  document.title = (selected && view !== 'explorer' ? selected.title : result.repository.name) + ' · Skill Atlas';
  if (view === 'atlas') renderAtlas(); else if (view === 'reader') renderReader(); else renderExplorer();
  console.info('Skill Atlas state', { repository: result.repository.fullName, view, filter, search, selected: selected?.id, decision: selectedDecision?.id, loadingDocument: documentLoading, coverage: result.coverage, warnings: result.warnings });
}

function route(nextView: View, artifact = selected, replace = false) {
  if (!result) return;
  navigationVersion++;
  const url = new URL('/' + result.repository.fullName, location.origin);
  if (artifact) url.searchParams.set('artifact', artifact.id);
  if (nextView !== 'explorer') url.searchParams.set('view', nextView);
  if (nextView === 'atlas' && selectedDecision) url.searchParams.set('decision', selectedDecision.id);
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
}

function issueStub(id: string): Artifact | undefined {
  if (!result || !/^issue:\d+$/.test(id)) return;
  const number = Number(id.slice(6));
  return { id, sourceKind: 'issue', kind: 'decision', title: 'Issue #' + number, issueNumber: number, body: null, status: 'unknown', sourceUrl: result.repository.htmlUrl + '/issues/' + number, labels: [], evidence: ['Linked issue; source not loaded yet.'], relationships: [], referencedSkills: [] };
}

function mergeArtifact(artifact: Artifact) {
  if (!result) return;
  const artifacts = new Map(result.artifacts.map(item => [item.id, item]));
  artifacts.set(artifact.id, artifact);
  for (const related of artifact.relatedArtifacts ?? []) artifacts.set(related.id, related);
  result.artifacts = [...artifacts.values()];
}

async function openArtifact(id: string, forcedView?: View, asDecision = false, push = true) {
  if (!result) return;
  const artifact = result.artifacts.find(item => item.id === id) ?? issueStub(id);
  if (!artifact) return;
  navigationVersion++;
  artifactController?.abort();
  const controller = artifactController = new AbortController();
  if (asDecision) selectedDecision = artifact;
  else { selected = artifact; selectedDecision = undefined; view = forcedView ?? (artifact.kind === 'wayfinder' ? 'atlas' : 'reader'); }
  documentError = '';
  documentLoading = true;
  if (push) route(view);
  render();
  try {
    const loaded = await hydrateArtifact(result.repository, artifact, controller.signal);
    if (controller.signal.aborted) return;
    mergeArtifact(loaded);
    if (asDecision) selectedDecision = loaded; else selected = loaded;
  } catch (failure) {
    if (!controller.signal.aborted) documentError = failure instanceof Error ? failure.message : 'The source could not be read.';
  } finally {
    if (!controller.signal.aborted) { documentLoading = false; render(); }
  }
}

async function openRepository(value: string, push = true) {
  let ref: RepoRef;
  inputValue = value;
  try { ref = parseRepoInput(value); } catch (failure) { error = failure instanceof Error ? failure.message : 'Enter a public GitHub repository.'; renderHome(); document.getElementById('repository-input')?.focus(); return; }
  navigationVersion++;
  scanController?.abort();
  artifactController?.abort();
  const controller = scanController = new AbortController();
  loading = true;
  error = '';
  progress = 'Opening ' + ref.fullName + '…';
  renderHome();
  try {
    const scanned = await scanRepository(ref, { signal: controller.signal, onProgress: message => { if (!controller.signal.aborted) { progress = message; const display = document.querySelector('.scan-progress'); if (display) display.innerHTML = '<span class="loading-dot"></span>' + escape(message) + '<button class="text-button" data-action="cancel">Cancel</button>'; } } });
    if (controller.signal.aborted) return;
    result = scanned;
    filter = 'all'; search = ''; stateFilter = 'all'; rowLimit = 100;
    view = 'explorer'; selectedDecision = undefined; documentError = ''; documentLoading = false;
    const params = push ? new URLSearchParams() : new URLSearchParams(location.search);
    selected = result.artifacts.find(item => item.id === params.get('artifact')) ?? issueStub(params.get('artifact') ?? '') ?? result.artifacts.find(item => item.kind === 'wayfinder') ?? result.artifacts[0];
    const desiredView = params.get('view');
    if (desiredView === 'reader' || desiredView === 'atlas') view = desiredView;
    loading = false;
    if (push) route('explorer', undefined);
    render();
    if (selected) {
      const opening = openArtifact(selected.id, view, false, false);
      const version = navigationVersion;
      await opening;
      if (version !== navigationVersion) return;
    }
    if (controller.signal.aborted) return;
    if (view === 'atlas' && params.get('decision')) await openArtifact(params.get('decision') ?? '', undefined, true, false);
  } catch (failure) {
    if (!controller.signal.aborted) { loading = false; result = undefined; error = failure instanceof Error ? failure.message : 'GitHub could not be reached. Try again.'; renderHome(); }
  }
}

function goHome() {
  navigationVersion++;
  scanController?.abort(); artifactController?.abort();
  result = undefined; selected = undefined; selectedDecision = undefined; loading = false; error = ''; documentError = ''; documentLoading = false;
  history.pushState(null, '', '/');
  renderHome();
}

app.addEventListener('submit', event => {
  if (!(event.target instanceof HTMLFormElement) || event.target.id !== 'repository-form') return;
  event.preventDefault();
  const value = new FormData(event.target).get('repository');
  if (typeof value === 'string') void openRepository(value);
});

app.addEventListener('click', event => {
  const element = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-action]') : null;
  if (!element || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  const action = element.dataset.action;
  if (action === 'home') goHome();
  else if (action === 'example') void openRepository(element.dataset.repo ?? '');
  else if (action === 'cancel') { scanController?.abort(); loading = false; result = undefined; renderHome(); }
  else if (action === 'open') void openArtifact(element.dataset.id ?? '');
  else if (action === 'decision') void openArtifact(element.dataset.id ?? '', 'atlas', true);
  else if (action === 'retry-artifact' && (selectedDecision || selected)) void openArtifact((selectedDecision ?? selected)?.id ?? '', view, !!selectedDecision, false);
  else if (action === 'filter') { const next = element.dataset.filter; if (next === 'all' || next === 'spec' || next === 'ticket' || next === 'wayfinder' || next === 'skill' || next === 'docs') { filter = next; view = 'explorer'; rowLimit = 100; route(view); render(); } }
  else if (action === 'index') { view = 'explorer'; route(view); render(); }
  else if (action === 'reader') { view = 'reader'; route(view); render(); }
  else if (action === 'atlas') { view = 'atlas'; route(view); render(); }
  else if (action === 'more') { rowLimit += 100; render(); }
  else if (action === 'clear-filters') { search = ''; filter = 'all'; stateFilter = 'all'; render(); }
  else if (action === 'refresh' && result) void openRepository(result.repository.fullName);
});

app.addEventListener('input', event => {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (event.target.id === 'repository-input') inputValue = event.target.value;
  if (event.target.id !== 'artifact-search') return;
  const position = event.target.selectionStart;
  search = event.target.value; rowLimit = 100; render();
  const input = document.querySelector<HTMLInputElement>('#artifact-search');
  input?.focus(); input?.setSelectionRange(position, position);
});
app.addEventListener('change', event => {
  if (!(event.target instanceof HTMLSelectElement)) return;
  if (event.target.id === 'state-filter') stateFilter = event.target.value;
  if (event.target.id === 'sort-filter') sort = event.target.value;
  rowLimit = 100; render();
});

function restoreRoute() {
  navigationVersion++;
  const parts = location.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) { result = undefined; renderHome(); return; }
  let ref: RepoRef;
  try { ref = parseRepoInput(parts.map(decodeURIComponent).join('/')); } catch { goHome(); return; }
  if (result?.repository.fullName.toLowerCase() === ref.fullName.toLowerCase()) {
    const params = new URLSearchParams(location.search);
    const nextView = params.get('view');
    view = nextView === 'atlas' || nextView === 'reader' ? nextView : 'explorer';
    const id = params.get('artifact');
    if (id) void (async () => {
      const opening = openArtifact(id, view, false, false);
      const version = navigationVersion;
      await opening;
      if (version !== navigationVersion) return;
      if (params.get('decision')) await openArtifact(params.get('decision') ?? '', 'atlas', true, false);
    })(); else render();
  } else void openRepository(ref.fullName, false);
}
window.addEventListener('popstate', () => { scanController?.abort(); artifactController?.abort(); loading = false; restoreRoute(); });
restoreRoute();
