import { execFile } from "child_process";
import { accessSync, constants } from "fs";
import { homedir } from "os";
import { delimiter, join } from "path";
import { promisify } from "util";
import { configPath, readConfig, writeConfig } from "./config";
import type { Config, Organization, OrganizationKind, Repository, SyncResult } from "./types";

const execFileAsync = promisify(execFile);

const repositoryFields = `
  name
  nameWithOwner
  description
  url
  isPrivate
  isArchived
  isFork
  owner {
    login
    __typename
  }
`;

// viewer.repositories with ORGANIZATION_MEMBER only returns repositories from
// teams the user is on. Listing each owner matches `gh repo list <owner>`.
const ownersQuery = `
  query($endCursor: String) {
    viewer {
      login
      organizations(first: 100, after: $endCursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          login
        }
      }
    }
  }
`;

const ownerRepositoriesQuery = `
  query($owner: String!, $endCursor: String) {
    repositoryOwner(login: $owner) {
      repositories(first: 100, after: $endCursor, orderBy: { field: NAME, direction: ASC }) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${repositoryFields}
        }
      }
    }
  }
`;

const collaboratorRepositoriesQuery = `
  query($endCursor: String) {
    viewer {
      repositories(
        first: 100
        after: $endCursor
        affiliations: [COLLABORATOR]
        orderBy: { field: NAME, direction: ASC }
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          ${repositoryFields}
        }
      }
    }
  }
`;

type RepositoryNode = {
  name: string;
  nameWithOwner: string;
  description: string | null;
  url: string;
  isPrivate: boolean;
  isArchived: boolean;
  isFork: boolean;
  owner: {
    login: string;
    __typename?: string;
  } | null;
};

type GraphqlPage = {
  data?: {
    viewer?: {
      login?: string;
      organizations?: { nodes?: Array<{ login: string } | null> };
      repositories?: { nodes?: Array<RepositoryNode | null> };
    };
    repositoryOwner?: {
      repositories?: { nodes?: Array<RepositoryNode | null> };
    } | null;
  };
  errors?: Array<{ message?: string }>;
};

export async function syncRepositories(): Promise<SyncResult> {
  const previous = await readConfig();
  const nodes = await fetchRepositoryNodes();
  const config = buildConfig(nodes, previous);
  await writeConfig(config);

  return {
    organizationCount: Object.keys(config.orgs).length,
    repositoryCount: nodes.length,
    configPath,
  };
}

export async function setOrganizationEnabled(name: string, enabled: boolean): Promise<Config> {
  const config = await requireConfig();
  const organization = config.orgs[name];
  if (!organization) {
    throw new Error(`Couldn't find ${name}. Sync repositories, then try again.`);
  }

  organization.enabled = enabled;
  await writeConfig(config);
  return config;
}

export async function setAllOrganizationsEnabled(enabled: boolean): Promise<Config> {
  const config = await requireConfig();
  for (const organization of Object.values(config.orgs)) {
    organization.enabled = enabled;
  }
  await writeConfig(config);
  return config;
}

async function requireConfig(): Promise<Config> {
  const config = await readConfig();
  if (!config) {
    throw new Error("No repositories synced yet. Run Sync Repositories first.");
  }
  return config;
}

async function fetchRepositoryNodes(): Promise<RepositoryNode[]> {
  const byFullName = new Map<string, RepositoryNode>();
  const owners = await fetchOwners();

  for (const owner of owners) {
    const pages = await ghGraphql(ownerRepositoriesQuery, { owner });
    assertNoGraphqlErrors(pages, `repositories for ${owner}`);
    for (const page of pages) {
      addRepositories(byFullName, page.data?.repositoryOwner?.repositories?.nodes);
    }
  }

  const collaboratorPages = await ghGraphql(collaboratorRepositoriesQuery);
  assertNoGraphqlErrors(collaboratorPages, "collaborator repositories");
  for (const page of collaboratorPages) {
    addRepositories(byFullName, page.data?.viewer?.repositories?.nodes);
  }

  return [...byFullName.values()];
}

async function fetchOwners(): Promise<string[]> {
  const pages = await ghGraphql(ownersQuery);
  assertNoGraphqlErrors(pages, "organizations");

  const owners = new Set<string>();
  for (const page of pages) {
    const login = page.data?.viewer?.login;
    if (login) {
      owners.add(login);
    }
    for (const organization of page.data?.viewer?.organizations?.nodes ?? []) {
      if (organization?.login) {
        owners.add(organization.login);
      }
    }
  }

  if (owners.size === 0) {
    throw new Error("GitHub CLI didn't return your account. Run gh auth login, then sync again.");
  }

  return [...owners];
}

async function ghGraphql(query: string, variables: Record<string, string> = {}): Promise<GraphqlPage[]> {
  const args = ["api", "graphql", "--paginate", "--slurp", "-f", `query=${query}`];
  for (const [key, value] of Object.entries(variables)) {
    args.push("-f", `${key}=${value}`);
  }

  const { stdout } = await execFileAsync(resolveGh(), args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: ghEnvironment(),
  });

  return parsePages(stdout);
}

function assertNoGraphqlErrors(pages: GraphqlPage[], context: string) {
  for (const page of pages) {
    if (!page.errors?.length) {
      continue;
    }
    const message = page.errors
      .map((error) => error.message)
      .filter(Boolean)
      .join(" ");
    throw new Error(message || `GitHub returned an error while listing ${context}.`);
  }
}

function addRepositories(byFullName: Map<string, RepositoryNode>, nodes: Array<RepositoryNode | null> | undefined) {
  for (const node of nodes ?? []) {
    if (!node?.owner?.login || !node.nameWithOwner || !node.url) {
      continue;
    }
    byFullName.set(node.nameWithOwner, node);
  }
}

function parsePages(stdout: string): GraphqlPage[] {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error("GitHub CLI returned an empty response. Run gh auth login, then sync again.");
  }

  const parsed: unknown = JSON.parse(trimmed);
  const pages = Array.isArray(parsed) ? parsed : [parsed];
  return pages.filter((page): page is GraphqlPage => !!page && typeof page === "object");
}

function buildConfig(nodes: RepositoryNode[], previous: Config | null): Config {
  const grouped = new Map<string, { kind: OrganizationKind; repositories: Repository[] }>();

  for (const node of nodes) {
    const login = node.owner?.login;
    if (!login) {
      continue;
    }

    const current = grouped.get(login) ?? { kind: organizationKind(node.owner?.__typename), repositories: [] };
    if (node.owner?.__typename === "Organization") {
      current.kind = "organization";
    }

    current.repositories.push({
      name: node.name,
      fullName: node.nameWithOwner,
      url: node.url,
      description: node.description,
      private: node.isPrivate,
      archived: node.isArchived,
      fork: node.isFork,
    });
    grouped.set(login, current);
  }

  const orgs: Record<string, Organization> = {};
  for (const login of [...grouped.keys()].sort((a, b) => a.localeCompare(b))) {
    const group = grouped.get(login);
    if (!group) {
      continue;
    }

    group.repositories.sort((a, b) => a.name.localeCompare(b.name) || a.fullName.localeCompare(b.fullName));
    orgs[login] = {
      enabled: previous?.orgs[login]?.enabled ?? true,
      kind: group.kind,
      repositories: group.repositories,
    };
  }

  return {
    version: 1,
    syncedAt: new Date().toISOString(),
    orgs,
  };
}

function organizationKind(typename: string | undefined): OrganizationKind {
  return typename === "User" ? "user" : "organization";
}

function resolveGh(): string {
  const candidates = [
    process.env.GH_PATH,
    "/opt/homebrew/bin/gh",
    "/usr/local/bin/gh",
    join(homedir(), ".local/bin/gh"),
  ];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {
      continue;
    }
  }

  return "gh";
}

function ghEnvironment(): NodeJS.ProcessEnv {
  const pathEntries = ["/opt/homebrew/bin", "/usr/local/bin", join(homedir(), ".local/bin"), process.env.PATH].filter(
    (entry): entry is string => !!entry,
  );

  return {
    ...process.env,
    PATH: pathEntries.join(delimiter),
    GH_PAGER: "cat",
    PAGER: "cat",
    NO_COLOR: "1",
  };
}
