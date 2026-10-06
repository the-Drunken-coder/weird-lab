# Skill Atlas

A prototype of a public GitHub repository viewer for projects built with Matt Pocock's skills.

The question for this first pass: which layout makes the relationship between specifications, tickets, Wayfinder decisions, and repository documents easiest to understand?

Run from this folder:

```sh
npm run prototype
```

Open http://localhost:5173/matt-prototype/skill-atlas/?variant=A. Use the bottom switcher or left/right arrows to compare the three static directions.

For a server-free review, open prototypes/matt-prototype/skill-atlas/static-mocks.html in a browser. This is a self-contained export of the same mocks. Screenshots of A, B, and C are in prototypes/screenshots/.

- A, Artifact explorer: a dense index with source evidence beside the selected artifact.
- B, Wayfinder atlas: a map of decisions grouped by subject.
- C, Reading room: a specification with its implementation ticket and source references.

These are throwaway static mocks, awaiting a visual choice before interactive implementation. The data is a captured snapshot of public issues in mattpocock/course-video-manager. It is not a live scan. Repository URLs, issue status, and source labels come from that snapshot. All document summaries are paraphrases. The Wayfinder lines show map membership, not dependencies.

The intended interactive prototype accepts a GitHub URL or /owner/repo path, fetches public repository files and issues, recognizes known artifact formats, and lets the reader inspect each item with its evidence and GitHub source link. It needs no database or GitHub write access.

Design constraints are recorded in DESIGN.md. RECOGNITION.md records the source formats the viewer should recognize. A chosen direction will be recorded here before promotion. No direction has been selected yet.

Checked the three layouts at desktop width and 390px, including switcher buttons, keyboard cycling, source links, and table-of-contents anchors. The T3 browser could not reach the local server, so the self-contained export was rendered through its native browser tools. The server responds normally over local HTTP.
