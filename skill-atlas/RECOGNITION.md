# What the viewer can recognize

A public repository is the source of truth. Read repository files, issue labels and bodies, native issue relationships, and linked pull requests. Show the matching evidence beside each artifact.

| Artifact | Public evidence |
| --- | --- |
| Project setup | AGENTS.md or CLAUDE.md, plus linked docs/agents/ configuration |
| Repo-local skills | SKILL.md files under .agents/skills/, .claude/skills/, or other configured locations |
| Specification | Problem Statement, Solution, User Stories, Implementation Decisions, Testing Decisions, Out of Scope, Further Notes |
| Implementation ticket | Parent, What to build, Acceptance criteria, Blocked by |
| Wayfinder effort | wayfinder:map label, Destination, Notes, Decisions so far, Not yet specified, Out of scope |
| Wayfinder decision | wayfinder:research, wayfinder:prototype, wayfinder:grilling, or wayfinder:task |
| Local tracker | .scratch/<feature>/spec.md, .scratch/<effort>/map.md, .scratch/<feature>/issues/<NN>-<slug>.md |
| Domain model | GLOSSARY.md, GLOSSARY-MAP.md, or older CONTEXT.md and CONTEXT-MAP.md |
| Architecture decisions | docs/adr/ or the configured ADR directory |
| Research and prototypes | wayfinder:research / wayfinder:prototype labels, matching Markdown paths, and source links |

Specs and tickets can match a format without proving which agent wrote them. Skills referenced in a document and skills stored in a repo are separate facts. Neither proves execution or the full installed skill inventory.

Project configuration can explain labels. In course-video-manager, ready-for-agent maps to Sandcastle. The viewer exposes that configuration as source documents and recognizes specs and tickets through headings; it does not treat Sandcastle alone as proof of either format.

Show native parent/child and blocker relationships separately from references found in Markdown. Ticket #1725 names spec #1723 under Parent, but the current GitHub API has no native parent for it. A parser should retain the reference and its source.

Use Wayfinder maps and resolved decision issues as the visible history of an effort. There is no standard public Wayfinder session log. Handoffs normally live in the OS temporary directory. Missing artifacts should read “Not found in public sources.”

Keep GitHub's closed state separate from unchecked acceptance criteria and implementation evidence. A planning map can be complete before any feature is built.

## Primary sources

- [Wayfinder](https://github.com/mattpocock/skills/blob/main/skills/engineering/wayfinder/SKILL.md)
- [Specs](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md)
- [Tickets](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md)
- [Local tracker template](https://github.com/mattpocock/skills/blob/main/skills/engineering/setup-matt-pocock-skills/issue-tracker-local.md)
- [Handoffs](https://github.com/mattpocock/skills/blob/main/skills/productivity/handoff/SKILL.md)
- [CVM setup](https://github.com/mattpocock/course-video-manager/blob/main/CLAUDE.md)
- [CVM labels](https://github.com/mattpocock/course-video-manager/blob/main/docs/agents/triage-labels.md)
- [CVM domain configuration](https://github.com/mattpocock/course-video-manager/blob/main/docs/agents/domain.md)
- [Map #1197](https://github.com/mattpocock/course-video-manager/issues/1197), [spec #1723](https://github.com/mattpocock/course-video-manager/issues/1723), [ticket #1725](https://github.com/mattpocock/course-video-manager/issues/1725)
