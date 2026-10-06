# Design study

Read a project's planning history without searching through raw GitHub files and issues. The main action is to open an artifact and follow its relationships back to the source.

Every classification carries evidence. A Wayfinder label is a strong signal. Specification headings are a format match. A skill mentioned in instructions is a reference, not proof that the skill ran. The public repo cannot expose private sessions or locally stored handoffs.

The mocks use real public issues from mattpocock/course-video-manager, captured in prototypes/matt-prototype/skill-atlas/sources.json. The sample is explicitly limited to 13 issues. It is not the repo's complete inventory.

## Directions

A is an artifact index with a navigation rail, compact rows, a selected map, and a narrow evidence column. It favors finding and comparing work.

B is a Wayfinder map with the destination at the top, subject groups of linked decisions, and a source detail pane. Lines express membership only. It favors understanding how an effort was decided.

C is a document reader with a table of contents, readable spec text, and the related implementation ticket. It favors understanding one feature deeply.

Use restrained typography, useful dividers, visible source IDs, and dense layouts. Avoid decorative cards, badges, invented metrics, animated backgrounds, and ungrounded progress claims. Collapse side columns into document order on small screens. Wide decision maps may scroll horizontally within their own region.

The user approved A for browsing, B for Wayfinder maps, and C for reading specifications. These become views of the same repository, selected by the artifact being opened. The layout decision is settled. The static study is captured on prototype/skill-atlas-layout-study.

## Sources

- [Matt Pocock's skills](https://github.com/mattpocock/skills)
- [Wayfinder instructions](https://github.com/mattpocock/skills/blob/main/skills/engineering/wayfinder/SKILL.md)
- [Specification instructions](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-spec/SKILL.md)
- [Ticket instructions](https://github.com/mattpocock/skills/blob/main/skills/engineering/to-tickets/SKILL.md)
- [CVM project instructions](https://github.com/mattpocock/course-video-manager/blob/main/CLAUDE.md)
- [CVM domain context](https://github.com/mattpocock/course-video-manager/blob/main/CONTEXT.md)
- [UIZZE reference catalogue](https://uizze.com). The public GitHub, Ramp, and Slite examples informed compact navigation, flat information groups, and document hierarchy. The hosted design files were not available.

The interactive pass should show loading, invalid URL, missing/private repository, no recognized artifacts, partial data, and GitHub rate limits. Unknown formats remain available as source documents rather than being silently assigned a skill.
