import type {
  Artifact,
  ArtifactKind,
  ArtifactRelationship,
  RepoRef,
  ScanResult,
} from "./model";

const API = "https://api.github.com";
const PAGE_SIZE = 100;
const MAX_FILES = 160;
const EAGER_FILES = 20;
const MAX_FILE_BYTES = 200_000;
const CACHE_MS = 5 * 60_000;
const CACHE_ENTRIES = 250;

export type GitHubErrorCode =
  | "invalid-input"
  | "not-found"
  | "rate-limit"
  | "network"
  | "too-large"
  | "github";

export class GitHubScanError extends Error {
  readonly code: GitHubErrorCode;
  readonly retryAt?: string;

  constructor(code: GitHubErrorCode, message: string, retryAt?: string) {
    super(message);
    this.name = "GitHubScanError";
    this.code = code;
    this.retryAt = retryAt;
  }
}

interface JsonPage {
  data: unknown;
  nextPage: boolean;
}

interface Cached<T> {
  value: T;
  expiresAt: number;
}

interface TreeFile {
  path: string;
  size: number;
}

interface Issue {
  number: number;
  title: string;
  body: string;
  status: "open" | "closed" | "unknown";
  htmlUrl: string;
  labels: string[];
  updatedAt: string;
  isPullRequest: boolean;
}

type Coverage = ScanResult["coverage"];
const jsonCache = new Map<string, Cached<JsonPage>>();
const rawCache = new Map<string, Cached<string>>();
const branchCache = new Map<string, Cached<string>>();
const hydrationCache = new Map<string, Cached<Artifact>>();

function getCached<T>(cache: Map<string, Cached<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function putCached<T>(cache: Map<string, Cached<T>>, key: string, value: T): void {
  if (cache.size >= CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_MS });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function num(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function parseRepoInput(input: string): RepoRef {
  let path = input.trim();
  const invalid = () => new GitHubScanError(
    "invalid-input",
    "Enter a public GitHub repository as owner/repo or https://github.com/owner/repo.",
  );
  if (/^(?:https?:\/\/|(?:www\.)?github\.com\/)/i.test(path)) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(path) ? path : `https://${path}`);
    } catch {
      throw invalid();
    }
    if (!/^(?:www\.)?github\.com$/i.test(url.hostname) || url.username || url.password || url.port) {
      throw invalid();
    }
    path = url.pathname;
  }
  path = path.replace(/^\//, "").replace(/\/$/, "");
  const parts = path.split("/");
  const owner = parts[0] ?? "";
  const name = (parts[1] ?? "").replace(/\.git$/i, "");
  if (
    parts.length !== 2 ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(owner) ||
    !/^[a-z\d_.-]{1,100}$/i.test(name) ||
    name === "." || name === ".."
  ) throw invalid();
  return { owner, name, fullName: `${owner}/${name}` };
}

function repoPath(ref: RepoRef): string {
  return `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.name)}`;
}

function pathSegments(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function timedSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(20_000);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

async function fetchResponse(url: string, signal?: AbortSignal, api = true): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: timedSignal(signal),
      headers: api ? {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      } : {},
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new GitHubScanError("network", "GitHub could not be reached. Check your connection and try again.");
  }
  if (response.ok) return response;
  const message = (await response.text()).slice(0, 1000);
  if (
    response.status === 429 ||
    (response.status === 403 && (
      response.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(message)
    ))
  ) {
    const retryAfter = Number(response.headers.get("retry-after"));
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    const retryTime = retryAfter > 0 ? Date.now() + retryAfter * 1000 : reset > 0 ? reset * 1000 : Date.now() + 60_000;
    const retryAt = new Date(retryTime).toISOString();
    throw new GitHubScanError("rate-limit", `GitHub's public API limit was reached. Try again after ${new Date(retryTime).toLocaleTimeString()}.`, retryAt);
  }
  if (response.status === 404) {
    throw new GitHubScanError("not-found", "GitHub could not find this public repository or artifact. It may be private, renamed, or deleted.");
  }
  throw new GitHubScanError("github", `GitHub returned ${response.status}. ${str(record(safeJson(message)).message) || response.statusText}`);
}

function safeJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return null; }
}

async function jsonPage(path: string, signal?: AbortSignal, coverage?: Coverage): Promise<JsonPage> {
  signal?.throwIfAborted();
  const url = `${API}${path}`;
  const cached = getCached(jsonCache, url);
  if (cached) return cached;
  if (coverage) coverage.apiRequests += 1;
  const response = await fetchResponse(url, signal);
  const data: unknown = await response.json();
  const page = { data, nextPage: /rel="next"/.test(response.headers.get("link") ?? "") };
  putCached(jsonCache, url, page);
  return page;
}

async function rawFile(ref: RepoRef, branch: string, path: string, signal?: AbortSignal, coverage?: Coverage): Promise<string> {
  signal?.throwIfAborted();
  const url = `https://raw.githubusercontent.com/${pathSegments(ref.fullName)}/${encodeURIComponent(branch)}/${pathSegments(path)}`;
  const cached = getCached(rawCache, url);
  if (cached !== undefined) return cached;
  if (coverage) coverage.rawRequests += 1;
  const response = await fetchResponse(url, signal, false);
  if (Number(response.headers.get("content-length")) > MAX_FILE_BYTES) {
    throw new GitHubScanError("too-large", `This file exceeds the ${MAX_FILE_BYTES / 1000} KB prototype limit. Open it on GitHub.`);
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > MAX_FILE_BYTES) {
      await reader.cancel();
      throw new GitHubScanError("too-large", `This file exceeds the ${MAX_FILE_BYTES / 1000} KB prototype limit. Open it on GitHub.`);
    }
    body += decoder.decode(chunk.value, { stream: true });
  }
  body += decoder.decode();
  putCached(rawCache, url, body);
  return body;
}

function withoutCode(body: string): string {
  return body.replace(/^\s*(`{3,}|~{3,}).*\n[\s\S]*?^\s*\1\s*$/gm, "");
}

function headings(body: string): Set<string> {
  return new Set(Array.from(withoutCode(body).matchAll(/^#{1,6}\s+(.+?)\s*#*\s*$/gm), (match) => (match[1] ?? "").toLowerCase()));
}

function bodyKind(body: string, labels: string[]): { kind: ArtifactKind; evidence: string[] } | null {
  const names = headings(body);
  const matched = (...expected: string[]) => expected.filter((heading) => names.has(heading));
  const wayfinderLabel = labels.find((label) => label.startsWith("wayfinder:"));
  const mapHeadings = matched("destination", "notes", "decisions so far", "not yet specified", "out of scope");
  if (wayfinderLabel === "wayfinder:map" || (names.has("destination") && names.has("decisions so far") && mapHeadings.length >= 3)) {
    return { kind: "wayfinder", evidence: [...(wayfinderLabel ? [`GitHub label: ${wayfinderLabel}`] : []), `Map headings: ${mapHeadings.join(", ")}`] };
  }
  if (wayfinderLabel) {
    const kind = wayfinderLabel === "wayfinder:research" ? "research" : wayfinderLabel === "wayfinder:prototype" ? "prototype" : "decision";
    return { kind, evidence: [`GitHub label: ${wayfinderLabel}`] };
  }
  const specHeadings = matched("problem statement", "solution", "user stories", "implementation decisions", "testing decisions", "out of scope", "further notes");
  if (names.has("problem statement") && names.has("solution") && specHeadings.length >= 3) {
    return { kind: "spec", evidence: [`Specification headings: ${specHeadings.join(", ")}`] };
  }
  const ticketHeadings = matched("parent", "what to build", "acceptance criteria", "blocked by");
  if (names.has("what to build") && names.has("acceptance criteria")) {
    return { kind: "ticket", evidence: [`Ticket headings: ${ticketHeadings.join(", ")}`] };
  }
  return null;
}

const KNOWN_SKILLS = new Set([
  "wayfinder", "to-spec", "to-tickets", "setup-matt-pocock-skills", "domain-modeling",
  "codebase-design", "code-review", "diagnosing-bugs", "grilling", "prototype", "research",
  "tdd", "pr", "writing-for-agents", "handoff", "wizard", "issue-tracker", "improve-codebase",
  "write-a-prd", "prd-to-issues", "design-an-interface", "request-refactor-plan",
]);

function referencedSkills(body: string): string[] {
  const found = new Set<string>();
  const text = withoutCode(body);
  for (const match of text.matchAll(/(?:\/(?:matt-)?|\$matt-)([a-z][a-z-]+)\b/g)) {
    const name = match[1];
    if (name && KNOWN_SKILLS.has(name)) found.add(name);
  }
  for (const match of text.matchAll(/mattpocock\/skills\/[^\s)]+\/([a-z][a-z-]+)\/SKILL\.md/g)) {
    if (match[1]) found.add(match[1]);
  }
  return Array.from(found).sort();
}

function bodyRelationships(ref: RepoRef, body: string, sourceUrl: string, filePath?: string): ArtifactRelationship[] {
  const result = new Map<string, ArtifactRelationship>();
  let section = "";
  for (const line of withoutCode(body).split("\n")) {
    const heading = line.match(/^#{1,6}\s+(.+)/);
    if (heading) section = (heading[1] ?? "").toLowerCase();
    const kind = section === "parent" ? "parent" : section === "blocked by" ? "blocker" : "reference";
    const decisionLine = section === "decisions so far" && /^\s*[-*]\s/.test(line);
    const add = (targetId: string, url: string, relationKind: ArtifactRelationship["kind"] = kind) => {
      result.set(`${targetId}:${relationKind}`, { targetId, kind: relationKind, basis: "body", sourceUrl: url });
    };
    const linked = new Set<number>();
    let linkIndex = 0;
    for (const match of line.matchAll(/https:\/\/github\.com\/([^\s/]+)\/([^\s/]+)\/(issues|pull)\/(\d+)/g)) {
      const number = Number(match[4]);
      const url = match[0];
      if (`${match[1]}/${match[2]}`.toLowerCase() === ref.fullName.toLowerCase() && match[3] === "issues") {
        linked.add(number);
        add(`issue:${number}`, url, decisionLine && linkIndex === 0 ? "child" : kind);
      } else add(`url:${url}`, url, "reference");
      linkIndex += 1;
    }
    for (const match of line.matchAll(/(^|[^\w/])#(\d+)\b/g)) {
      const number = Number(match[2]);
      if (linked.has(number)) continue;
      const prefix = line.slice(0, match.index).trimEnd();
      const isPull = /(?:PR|pull request)\s*$/i.test(prefix);
      const url = `https://github.com/${ref.fullName}/${isPull ? "pull" : "issues"}/${number}`;
      const leadingDecision = decisionLine && /^\s*[-*]\s*#\d+\b/.test(line) && linkIndex === 0;
      add(isPull ? `url:${url}` : `issue:${number}`, url, isPull ? "reference" : leadingDecision ? "child" : kind);
    }
    if (filePath) {
      for (const match of line.matchAll(/\]\(([^\s)]+\.md)(?:#[^\s)]*)?\)/g)) {
        const link = match[1];
        if (!link || /^(?:https?:|mailto:|#)/.test(link)) continue;
        const base = filePath.split("/").slice(0, -1).join("/");
        const url = new URL(link, `https://files.invalid/${base ? `${base}/` : ""}`);
        const path = decodeURIComponent(url.pathname.slice(1));
        const branchUrl = sourceUrl.slice(0, -pathSegments(filePath).length);
        add(`file:${path}`, `${branchUrl}${pathSegments(path)}`, "reference");
      }
    }
  }
  return Array.from(result.values());
}

function readIssue(value: unknown, allowPullRequest = false): Issue | null {
  const data = record(value);
  const number = num(data.number);
  const title = str(data.title);
  const isPullRequest = Boolean(data.pull_request);
  if (!number || !title || (isPullRequest && !allowPullRequest)) return null;
  const state = str(data.state);
  return {
    number, title, body: str(data.body),
    htmlUrl: str(record(data.pull_request).html_url) || str(data.html_url),
    status: state === "open" || state === "closed" ? state : "unknown",
    labels: list(data.labels).map((label) => typeof label === "string" ? label : str(record(label).name)).filter(Boolean),
    updatedAt: str(data.updated_at),
    isPullRequest,
  };
}

function issueArtifact(ref: RepoRef, issue: Issue): Artifact | null {
  const match = bodyKind(issue.body, issue.labels);
  const skills = referencedSkills(issue.body);
  if (!match && !skills.length) return null;
  return {
    id: `issue:${issue.number}`, sourceKind: "issue", kind: match?.kind ?? "document",
    title: issue.title, body: issue.body, status: issue.status, sourceUrl: issue.htmlUrl,
    issueNumber: issue.number, labels: issue.labels,
    evidence: match?.evidence ?? ["References a recognized coding skill"],
    relationships: bodyRelationships(ref, issue.body, issue.htmlUrl),
    referencedSkills: skills, updatedAt: issue.updatedAt,
  };
}

function fileKind(path: string): ArtifactKind | null {
  if (/(?:^|\/)(?:node_modules|vendor|dist|build|\.git)\//i.test(path)) return null;
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  if (name === "agents.md" || name === "claude.md") return "instructions";
  if (name === "skill.md") return "skill";
  if (/^(?:glossary|context)(?:-map)?\.md$/.test(name)) return "domain";
  if (!/\.md$/i.test(path)) return null;
  if (/(?:^|\/)\.scratch\/[^/]+\/map\.md$/i.test(path)) return "wayfinder";
  if (/(?:^|\/)(?:specs?|specifications?)(?:\/|\.md$)/i.test(path)) return "spec";
  if (/(?:^|\/)(?:tickets?|issues)\/[^/]+\.md$/i.test(path)) return "ticket";
  if (/(?:^|\/)(?:adr|adrs|architecture-decisions)\//i.test(path)) return "adr";
  if (/(?:^|\/)(?:research|research-notes)\//i.test(path)) return "research";
  if (/(?:^|\/)(?:prototypes?|matt-prototype)\//i.test(path)) return "prototype";
  if (/(?:^|\/)(?:decisions|decision-map)\//i.test(path)) return "decision";
  if (/^docs\/agents\//i.test(path) || path.toLowerCase() === "readme.md") return "document";
  return null;
}

function fileArtifact(ref: RepoRef, branch: string, path: string, kind: ArtifactKind, body: string | null): Artifact {
  // Skill definitions contain example spec/ticket headings. Their file role remains a skill.
  const bodyMatch = body === null ? null : bodyKind(body, []);
  const match = bodyMatch?.kind === kind ? bodyMatch : null;
  const sourceUrl = `https://github.com/${ref.fullName}/blob/${encodeURIComponent(branch)}/${pathSegments(path)}`;
  const heading = body?.match(/^#\s+(.+)$/m)?.[1];
  const skillName = kind === "skill" ? body?.match(/^name:\s*["']?([^\n"']+)/m)?.[1] : undefined;
  const statusText = body?.match(/^status:\s*(\w+)/mi)?.[1]?.toLowerCase();
  const status = statusText && ["closed", "done", "completed"].includes(statusText) ? "closed" : statusText && ["open", "todo", "active"].includes(statusText) ? "open" : "unknown";
  return {
    id: `file:${path}`, sourceKind: "file", kind,
    title: skillName?.trim() || (heading && !headings("# " + heading).has("problem statement") ? heading : path.split("/").at(-1) ?? path),
    body, status, sourceUrl, path, labels: [],
    evidence: [`Repository file: ${path}`, ...(match?.evidence ?? [])],
    relationships: body === null ? [] : bodyRelationships(ref, body, sourceUrl, path),
    referencedSkills: body === null ? [] : referencedSkills(body),
  };
}

function filePriority(path: string): number {
  const kind = fileKind(path);
  if (kind === "instructions") return path.includes("/") ? 2 : 0;
  if (/^docs\/agents\//i.test(path)) return 1;
  if (kind === "domain") return 3;
  if (kind === "skill") return 4;
  if (kind === "wayfinder" || kind === "spec" || kind === "ticket") return 5;
  return 6;
}

function warning(error: unknown): string {
  return error instanceof Error ? error.message : "GitHub did not return this source.";
}

async function readWithWorkers<T>(items: T[], work: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (index < items.length) {
      const item = items[index++];
      if (item !== undefined) await work(item);
    }
  }));
}

export async function scanRepository(
  ref: RepoRef,
  options: { signal?: AbortSignal; onProgress?: (message: string) => void } = {},
): Promise<ScanResult> {
  const { signal, onProgress } = options;
  const coverage: Coverage = {
    issues: 0, files: 0, matchedFiles: 0, filesRead: 0, apiRequests: 0, rawRequests: 0,
    treeTruncated: false, issueQueries: [],
  };
  const warnings: string[] = [];
  const artifacts = new Map<string, Artifact>();
  const issues = new Map<number, Issue>();
  onProgress?.("Reading public repository metadata");
  const metadata = record((await jsonPage(repoPath(ref), signal, coverage)).data);
  const fullName = str(metadata.full_name) || ref.fullName;
  const resolvedRef = parseRepoInput(fullName);
  const branch = str(metadata.default_branch) || "main";
  putCached(branchCache, resolvedRef.fullName.toLowerCase(), branch);
  const repository = {
    ...resolvedRef, description: str(metadata.description), defaultBranch: branch,
    htmlUrl: str(metadata.html_url) || `https://github.com/${resolvedRef.fullName}`,
  };
  const treeFiles: TreeFile[] = [];
  const optional = async (name: string, work: () => Promise<void>) => {
    try { await work(); } catch (error) {
      if (signal?.aborted) throw error;
      warnings.push(`${name}: ${warning(error)}`);
    }
  };
  onProgress?.("Finding instructions, local skills, and planning files");
  await Promise.all([
    optional("Repository file scan", async () => {
      const page = await jsonPage(`${repoPath(resolvedRef)}/git/trees/${encodeURIComponent(branch)}?recursive=1`, signal, coverage);
      const tree = record(page.data);
      coverage.treeTruncated = tree.truncated === true;
      if (coverage.treeTruncated) warnings.push("GitHub truncated the recursive file tree. Files beyond the returned tree were not scanned.");
      for (const value of list(tree.tree)) {
        const entry = record(value);
        if (entry.type === "blob" && str(entry.path)) treeFiles.push({ path: str(entry.path), size: num(entry.size) });
      }
      coverage.files = treeFiles.length;
    }),
    optional("Recent issues", async () => {
      if (metadata.has_issues === false) {
        warnings.push("Issues are disabled for this repository.");
        return;
      }
      const page = await jsonPage(`${repoPath(resolvedRef)}/issues?state=all&sort=updated&direction=desc&per_page=${PAGE_SIZE}`, signal, coverage);
      const entries = list(page.data);
      for (const entry of entries) {
        const issue = readIssue(entry);
        if (issue) issues.set(issue.number, issue);
      }
      coverage.issueQueries.push({ query: "Recently updated issues and pull requests", scanned: entries.length, total: null, truncated: page.nextPage });
      if (page.nextPage) warnings.push("Recent activity is limited to the latest 100 issue and pull request records. Targeted searches add older planning artifacts.");
    }),
  ]);
  if (metadata.has_issues !== false) {
    onProgress?.("Searching specs, implementation tickets, and older Wayfinder efforts");
    const queries = [
      'label:"wayfinder:map"',
      'in:body "Problem Statement" "Solution"',
      'in:body "What to build" "Acceptance criteria"',
      'label:"wayfinder:research","wayfinder:prototype","wayfinder:grilling","wayfinder:task"',
    ];
    // Search has a separate anonymous budget. Four one-page queries leave room for a second repo.
    for (const qualifier of queries) {
      await optional(`Issue search ${qualifier}`, async () => {
        const query = `repo:${resolvedRef.fullName} is:issue ${qualifier}`;
        const params = new URLSearchParams({ q: query, sort: "updated", order: "desc", per_page: String(PAGE_SIZE) });
        const page = await jsonPage(`/search/issues?${params}`, signal, coverage);
        const data = record(page.data);
        const entries = list(data.items);
        const total = num(data.total_count);
        const truncated = page.nextPage || total > entries.length || data.incomplete_results === true;
        coverage.issueQueries.push({ query: qualifier, scanned: entries.length, total, truncated });
        for (const entry of entries) {
          const issue = readIssue(entry);
          if (issue) issues.set(issue.number, issue);
        }
        if (truncated) warnings.push(`Search ${qualifier} returned ${entries.length} of ${total} matches${data.incomplete_results === true ? "; GitHub marked the search incomplete" : ""}. Older matches were not loaded.`);
      });
    }
  }
  coverage.issues = issues.size;
  for (const issue of issues.values()) {
    const artifact = issueArtifact(resolvedRef, issue);
    if (artifact) artifacts.set(artifact.id, artifact);
  }
  const candidates = treeFiles.filter((file) => fileKind(file.path) !== null).sort((a, b) => filePriority(a.path) - filePriority(b.path) || a.path.localeCompare(b.path));
  coverage.matchedFiles = candidates.length;
  if (candidates.length > MAX_FILES) warnings.push(`Found ${candidates.length} candidate files. The prototype lists the first ${MAX_FILES}, prioritizing project setup and skills.`);
  const listed = candidates.slice(0, MAX_FILES);
  for (const file of listed) {
    const kind = fileKind(file.path);
    if (kind) artifacts.set(`file:${file.path}`, fileArtifact(resolvedRef, branch, file.path, kind, null));
  }
  const eager = listed.filter((file) => file.size <= MAX_FILE_BYTES).slice(0, EAGER_FILES);
  onProgress?.(`Reading ${eager.length} matched files`);
  await readWithWorkers(eager, async (file) => {
    await optional(file.path, async () => {
      const body = await rawFile(resolvedRef, branch, file.path, signal, coverage);
      const kind = fileKind(file.path);
      if (kind) artifacts.set(`file:${file.path}`, fileArtifact(resolvedRef, branch, file.path, kind, body));
      coverage.filesRead += 1;
    });
  });
  // Linked Markdown captures configured documentation locations without scanning every source file.
  let listedFileCount = listed.length;
  for (const artifact of artifacts.values()) {
    if (artifact.sourceKind !== "file" || artifact.kind !== "instructions" || artifact.body === null) continue;
    for (const relationship of artifact.relationships) {
      if (!relationship.targetId.startsWith("file:") || artifacts.has(relationship.targetId) || listedFileCount >= MAX_FILES) continue;
      const path = relationship.targetId.slice(5);
      if (treeFiles.some((file) => file.path === path)) {
        artifacts.set(relationship.targetId, fileArtifact(resolvedRef, branch, path, "document", null));
        coverage.matchedFiles += 1;
        listedFileCount += 1;
      }
    }
  }
  if (listedFileCount > coverage.filesRead) warnings.push(`Read ${coverage.filesRead} file bodies during this scan. Other listed files load when selected, up to ${MAX_FILE_BYTES / 1000} KB per file.`);
  warnings.push("Coverage is limited to the default branch and the bounded issue searches above. Issue comments, other branches, private data, and temporary Wayfinder handoffs are not scanned.");
  return {
    repository, artifacts: Array.from(artifacts.values()).sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "") || a.title.localeCompare(b.title)),
    warnings, scannedAt: new Date().toISOString(), coverage,
  };
}

export async function hydrateArtifact(ref: RepoRef, artifact: Artifact, signal?: AbortSignal): Promise<Artifact> {
  const key = `${ref.fullName.toLowerCase()}:${artifact.id}`;
  const cached = getCached(hydrationCache, key);
  if (cached) return cached;
  signal?.throwIfAborted();
  if (artifact.sourceKind === "file") {
    if (artifact.body !== null || !artifact.path) return artifact;
    let branch = getCached(branchCache, ref.fullName.toLowerCase());
    if (!branch) branch = str(record((await jsonPage(repoPath(ref), signal)).data).default_branch) || "main";
    const body = await rawFile(ref, branch, artifact.path, signal);
    const hydrated = fileArtifact(ref, branch, artifact.path, artifact.kind, body);
    putCached(hydrationCache, key, hydrated);
    return hydrated;
  }
  if (!artifact.issueNumber) return artifact;
  if (artifact.body === null) {
    const issue = readIssue((await jsonPage(`${repoPath(ref)}/issues/${artifact.issueNumber}`, signal)).data, true);
    if (issue) artifact = (!issue.isPullRequest ? issueArtifact(ref, issue) : null) ?? {
      ...artifact, kind: "document", title: issue.title, body: issue.body, status: issue.status,
      sourceUrl: issue.htmlUrl, updatedAt: issue.updatedAt, labels: issue.labels,
      evidence: [issue.isPullRequest ? "Linked public GitHub pull request" : "Linked public GitHub issue"],
      relationships: bodyRelationships(ref, issue.body, issue.htmlUrl),
      referencedSkills: referencedSkills(issue.body),
    };
  }
  if (/\/pull\/\d+(?:[/?#]|$)/.test(artifact.sourceUrl)) {
    putCached(hydrationCache, key, artifact);
    return artifact;
  }
  const relationships = [...artifact.relationships];
  const relationshipWarnings: string[] = [];
  const relatedArtifacts: Artifact[] = [];
  const issuePath = `${repoPath(ref)}/issues/${artifact.issueNumber}`;
  const endpoints: Array<{ path: string; kind: ArtifactRelationship["kind"]; singular?: boolean }> = [
    { path: `${issuePath}/parent`, kind: "parent", singular: true },
    { path: `${issuePath}/sub_issues?per_page=${PAGE_SIZE}`, kind: "child" },
    { path: `${issuePath}/dependencies/blocked_by?per_page=${PAGE_SIZE}`, kind: "blocker" },
  ];
  await Promise.all(endpoints.map(async (endpoint) => {
    try {
      const page = await jsonPage(endpoint.path, signal);
      const entries = endpoint.singular ? [page.data] : list(page.data);
      for (const entry of entries) {
        const issue = readIssue(entry);
        if (!issue) continue;
        const url = issue.htmlUrl;
        const sameRepository = url.toLowerCase().startsWith(`https://github.com/${ref.fullName.toLowerCase()}/issues/`);
        relationships.push({ targetId: sameRepository ? `issue:${issue.number}` : `url:${url}`, kind: endpoint.kind, basis: "github", sourceUrl: url });
        if (sameRepository) {
          relatedArtifacts.push(issueArtifact(ref, issue) ?? {
            id: `issue:${issue.number}`, sourceKind: "issue", kind: "document",
            title: issue.title, body: issue.body, status: issue.status, sourceUrl: url,
            issueNumber: issue.number, labels: issue.labels, updatedAt: issue.updatedAt,
            evidence: [`Native ${endpoint.kind} relationship on GitHub`],
            relationships: bodyRelationships(ref, issue.body, url),
            referencedSkills: referencedSkills(issue.body),
          });
        }
      }
      if (page.nextPage) relationshipWarnings.push(`Native ${endpoint.kind} relationships are limited to the first ${PAGE_SIZE} records.`);
    } catch (error) {
      if (signal?.aborted) throw error;
      // GitHub uses 404 for an issue without a native parent.
      if (!(endpoint.singular && error instanceof GitHubScanError && error.code === "not-found")) {
        relationshipWarnings.push(`Native ${endpoint.kind} relationships: ${warning(error)}`);
      }
    }
  }));
  const hydrated = { ...artifact, relationships, relationshipWarnings, relatedArtifacts };
  putCached(hydrationCache, key, hydrated);
  return hydrated;
}
