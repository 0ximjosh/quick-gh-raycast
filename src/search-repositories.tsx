import { Action, ActionPanel, Icon, List, Toast, launchCommand, LaunchType, showToast } from "@raycast/api";
import { useEffect, useState } from "react";
import { configPath, readConfig, repositoryCount } from "./config";
import { formatError } from "./format-error";
import { syncRepositories } from "./github";
import type { Config, Repository } from "./types";

type SearchItem = {
  org: string;
  repository: Repository;
};

export default function SearchRepositories() {
  const [config, setConfig] = useState<Config | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const next = await readConfig();
      setConfig(next);
      setError(null);
    } catch (loadError) {
      setError(formatError(loadError));
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function sync() {
    setIsLoading(true);
    try {
      const result = await syncRepositories();
      await load();
      await showToast({
        style: Toast.Style.Success,
        title: `Synced ${result.repositoryCount.toLocaleString()} repositories`,
        message: `${result.organizationCount.toLocaleString()} organizations`,
      });
    } catch (syncError) {
      setIsLoading(false);
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't sync repositories",
        message: formatError(syncError),
      });
    }
  }

  const items = enabledItems(config);
  const enabledTotal = config ? repositoryCount(config, { enabledOnly: true }) : 0;

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={config ? `Search ${enabledTotal.toLocaleString()} repositories` : "Search repositories"}
      filtering
      throttle
    >
      {!isLoading &&
        (error ? (
          <List.EmptyView
            title="Couldn't read repositories"
            description={error}
            actions={<MaintenanceActions onSync={sync} />}
          />
        ) : (
          <List.EmptyView
            title={emptyTitle(config, enabledTotal)}
            description={emptyDescription(config, enabledTotal)}
            actions={<MaintenanceActions onSync={sync} />}
          />
        ))}
      {items.map(({ org, repository }) => (
        <List.Item
          key={repository.fullName}
          icon={Icon.Code}
          title={repository.name}
          subtitle={repository.description ?? repository.fullName}
          keywords={[repository.fullName, org, repository.description ?? ""]}
          accessories={accessories(org, repository)}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action.OpenInBrowser title="Open in Browser" url={repository.url} />
                <Action.CopyToClipboard title="Copy URL" content={repository.url} />
                <Action.CopyToClipboard title="Copy Repository Name" content={repository.fullName} />
              </ActionPanel.Section>
              <ActionPanel.Section>
                <Action title="Sync Repositories" icon={Icon.ArrowClockwise} onAction={() => void sync()} />
                <Action
                  title="Organization Settings"
                  icon={Icon.Gear}
                  onAction={() => void launchCommand({ name: "organization-settings", type: LaunchType.UserInitiated })}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function MaintenanceActions({ onSync }: { onSync: () => void }) {
  return (
    <ActionPanel>
      <Action title="Sync Repositories" icon={Icon.ArrowClockwise} onAction={onSync} />
      <Action
        title="Organization Settings"
        icon={Icon.Gear}
        onAction={() => void launchCommand({ name: "organization-settings", type: LaunchType.UserInitiated })}
      />
    </ActionPanel>
  );
}

function enabledItems(config: Config | null): SearchItem[] {
  if (!config) {
    return [];
  }

  const items: SearchItem[] = [];
  for (const [org, organization] of Object.entries(config.orgs)) {
    if (!organization.enabled) {
      continue;
    }
    for (const repository of organization.repositories) {
      items.push({ org, repository });
    }
  }
  return items;
}

function accessories(org: string, repository: Repository): List.Item.Accessory[] {
  const items: List.Item.Accessory[] = [{ text: org }];
  if (repository.private) {
    items.push({ tag: "Private" });
  }
  if (repository.fork) {
    items.push({ tag: "Fork" });
  }
  if (repository.archived) {
    items.push({ tag: "Archived" });
  }
  return items;
}

function emptyTitle(config: Config | null, enabledTotal: number): string {
  if (!config) {
    return "No repositories yet";
  }
  if (enabledTotal === 0) {
    return "No organizations enabled";
  }
  return "No matching repositories";
}

function emptyDescription(config: Config | null, enabledTotal: number): string {
  if (!config) {
    return `Sync with the GitHub CLI to write ${configPath}`;
  }
  if (enabledTotal === 0) {
    return "Turn organizations back on in Organization Settings.";
  }
  return "Try another name, organization, or description.";
}
