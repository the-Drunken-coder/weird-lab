export interface RepoRef {
  owner: string;
  name: string;
  fullName: string;
}

export type ArtifactKind =
  | "spec"
  | "ticket"
  | "wayfinder"
  | "decision"
  | "domain"
  | "adr"
  | "research"
  | "prototype"
  | "skill"
  | "instructions"
  | "document";

export interface ArtifactRelationship {
  targetId: string;
  kind: "parent" | "child" | "blocker" | "reference";
  basis: "body" | "github";
  sourceUrl: string;
}

export interface Artifact {
  id: string;
  sourceKind: "issue" | "file";
  kind: ArtifactKind;
  title: string;
  body: string | null;
  status: "open" | "closed" | "unknown";
  sourceUrl: string;
  issueNumber?: number;
  path?: string;
  labels: string[];
  evidence: string[];
  relationships: ArtifactRelationship[];
  referencedSkills: string[];
  updatedAt?: string;
  relationshipWarnings?: string[];
  relatedArtifacts?: Artifact[];
}

export interface IssueQueryCoverage {
  query: string;
  scanned: number;
  total: number | null;
  truncated: boolean;
}

export interface ScanResult {
  repository: RepoRef & {
    description: string;
    defaultBranch: string;
    htmlUrl: string;
  };
  artifacts: Artifact[];
  warnings: string[];
  scannedAt: string;
  coverage: {
    issues: number;
    files: number;
    matchedFiles: number;
    filesRead: number;
    apiRequests: number;
    rawRequests: number;
    treeTruncated: boolean;
    issueQueries: IssueQueryCoverage[];
  };
}
