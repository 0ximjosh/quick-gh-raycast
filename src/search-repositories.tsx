import { Action, ActionPanel, Icon, List, Toast, launchCommand, LaunchType, showToast } from "@raycast/api";
import { useEffect, useState } from "react";
import { configPath, readConfig, repositoryCount } from "./config";
import { formatError } from "./format-error";
import { syncRepositories } from "./github";
import { readLinks } from "./links";
import type { Config, CustomLink, Repository } from "./types";

type SearchItem = {
  org: string;
  repository: Repository;
};

export default function SearchRepositories() {
  const [config, setConfig] = useState<Config | null>(null);
  const [links, setLinks] = useState<CustomLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [next, nextLinks] = await Promise.all([readConfig(), readLinks()]);
      setConfig(next);
      setLinks(nextLinks);
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
  const searchTotal = enabledTotal + links.length;

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder={searchTotal > 0 ? `Search ${searchTotal.toLocaleString()} items` : "Search repositories"}
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
            title={emptyTitle(config, searchTotal)}
            description={emptyDescription(config, searchTotal)}
            actions={<MaintenanceActions onSync={sync} />}
          />
        ))}
      {links.map((link) => (
        <List.Item
          key={link.id}
          icon={Icon.Link}
          title={link.name}
          subtitle={link.url}
          keywords={[link.url]}
          accessories={[{ tag: "Link" }]}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action.OpenInBrowser title="Open Link" url={link.url} />
                <Action.CopyToClipboard title="Copy URL" content={link.url} />
              </ActionPanel.Section>
              <ActionPanel.Section>
                <AddLinkAction />
              </ActionPanel.Section>
            </ActionPanel>
          }
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
                <AddLinkAction />
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

function AddLinkAction() {
  return (
    <Action
      title="Add Link"
      icon={Icon.Link}
      onAction={() => void launchCommand({ name: "add-link", type: LaunchType.UserInitiated })}
    />
  );
}

function MaintenanceActions({ onSync }: { onSync: () => void }) {
  return (
    <ActionPanel>
      <Action title="Sync Repositories" icon={Icon.ArrowClockwise} onAction={onSync} />
      <AddLinkAction />
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

function emptyTitle(config: Config | null, searchTotal: number): string {
  if (searchTotal > 0) {
    return "No matching results";
  }
  if (!config) {
    return "No repositories yet";
  }
  return "No organizations enabled";
}

function emptyDescription(config: Config | null, searchTotal: number): string {
  if (searchTotal > 0) {
    return "Try another name, organization, or description.";
  }
  if (!config) {
    return `Sync with the GitHub CLI to write ${configPath}`;
  }
  return "Turn organizations back on in Organization Settings.";
}
