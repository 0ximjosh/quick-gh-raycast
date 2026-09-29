export type Repository = {
  name: string;
  fullName: string;
  url: string;
  description: string | null;
  private: boolean;
  archived: boolean;
  fork: boolean;
};

export type OrganizationKind = "user" | "organization";

export type Organization = {
  enabled: boolean;
  kind: OrganizationKind;
  repositories: Repository[];
};

export type Config = {
  version: 1;
  syncedAt: string;
  orgs: Record<string, Organization>;
};

export type SyncResult = {
  organizationCount: number;
  repositoryCount: number;
  configPath: string;
};
