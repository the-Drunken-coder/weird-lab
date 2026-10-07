# Skill Atlas

A working prototype that turns a public GitHub repository into an index of its specs, tickets, Wayfinder maps, skills, and project documents.

Run from this folder, using Node 22.12 or newer:

```sh
npm install
npm run prototype
```

Open [localhost:5173](http://localhost:5173). Paste a GitHub repository URL or `owner/repo`, or open a path directly:

```text
http://localhost:5173/mattpocock/course-video-manager
http://localhost:5173/mattpocock/skills
```

The approved design combines three views:

- Artifact explorer: search and filter a dense index, with recognition evidence and original source links.
- Wayfinder atlas: follow an effort's linked decisions, grouped by their source labels. Lines show map membership; blockers appear in the source details.
- Document reader: read sanitized source Markdown with a table of contents, related implementation work, and recognition evidence.

Selected artifacts and decisions have shareable URLs. Public issues, linked pull requests, repo-local skills, instructions, domain documents, ADRs, research notes, and local planning files can be opened. A skill reference or matching document format does not prove the skill ran. Wayfinder maps show public planning history; private sessions and temporary handoffs are unavailable.

The browser reads GitHub directly. There is no server API, database, sign-in, token, or repository write access. State stays in memory; source responses are cached for five minutes. GitHub's anonymous rate limits apply.

Each scan reads the default-branch file tree, the latest 100 issue/PR records, and up to 100 results from each of four targeted issue searches. PRs enter the viewer through links rather than the initial issue inventory. It lists up to 160 candidate files, reads 20 bodies initially, and loads other bodies when selected, with a 200 KB file limit. Native issue relationships load on selection. Coverage notes disclose truncation, failed requests, and unavailable sources. This is a bounded preview of the repository, not a complete inventory.

`npm run build` checks types and creates `dist/`. `npm run preview` serves the build on port 5173 after the development server is stopped. A static host needs SPA fallback to `index.html` for `/owner/repo` links.

The original three static layouts, screenshots, and captured source snapshot are archived on branch `prototype/skill-atlas-layout-study`, commit `3598874`. The user approved A for browsing, B for Wayfinder maps, and C for document reading. [DESIGN.md](DESIGN.md) records that decision; [RECOGNITION.md](RECOGNITION.md) records the public artifact formats and their sources.

Verified in a browser against `mattpocock/course-video-manager`: 333 recognized artifacts in the bounded scan, spec #1723 and ticket #1725, and map #1197 with nine native child issues. Desktop and 390px layouts, direct URLs, back navigation, filtering, cancellation, missing repositories, network failures, and API limits were checked. The scanner was also checked against `mattpocock/skills` and a linked PR. No formal test suite is included in this throwaway prototype.

Review screenshots from the October 6 browser run: [artifact explorer](docs/screenshots/explorer-desktop.png), [spec reader](docs/screenshots/reader-desktop.png), and [mobile reader](docs/screenshots/reader-mobile.png). Repository counts and issue states reflect that capture.
