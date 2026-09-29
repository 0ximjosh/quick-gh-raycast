import { Action, ActionPanel, Color, Icon, List, Toast, showToast } from "@raycast/api";
import { useEffect, useState } from "react";
import { readConfig } from "./config";
import { formatError } from "./format-error";
import { setAllOrganizationsEnabled, setOrganizationEnabled, syncRepositories } from "./github";
import type { Config } from "./types";

export default function OrganizationSettings() {
  const [config, setConfig] = useState<Config | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setConfig(await readConfig());
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

  async function toggle(name: string, enabled: boolean) {
    try {
      setConfig(await setOrganizationEnabled(name, enabled));
    } catch (toggleError) {
      await showToast({
        style: Toast.Style.Failure,
        title: `Couldn't update ${name}`,
        message: formatError(toggleError),
      });
    }
  }

  async function setAll(enabled: boolean) {
    try {
      setConfig(await setAllOrganizationsEnabled(enabled));
      await showToast({
        style: Toast.Style.Success,
        title: enabled ? "Enabled every organization" : "Disabled every organization",
      });
    } catch (updateError) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't update organizations",
        message: formatError(updateError),
      });
    }
  }

  async function sync() {
    setIsLoading(true);
    try {
      await syncRepositories();
      await load();
      await showToast({ style: Toast.Style.Success, title: "Repositories synced" });
    } catch (syncError) {
      setIsLoading(false);
      await showToast({
        style: Toast.Style.Failure,
        title: "Couldn't sync repositories",
        message: formatError(syncError),
      });
    }
  }

  const organizations = Object.entries(config?.orgs ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <List isLoading={isLoading} searchBarPlaceholder="Filter organizations" filtering throttle>
      {!isLoading && (
        <List.EmptyView
          title={error ? "Couldn't read organizations" : "No organizations yet"}
          description={error ?? "Sync repositories to choose which organizations search includes."}
          actions={
            <ActionPanel>
              <Action title="Sync Repositories" icon={Icon.ArrowClockwise} onAction={() => void sync()} />
            </ActionPanel>
          }
        />
      )}
      {organizations.map(([name, organization]) => (
        <List.Item
          key={name}
          icon={organization.kind === "user" ? Icon.Person : Icon.Building}
          title={name}
          subtitle={repositoryLabel(organization.repositories.length)}
          accessories={[
            {
              tag: {
                value: organization.enabled ? "Enabled" : "Disabled",
                color: organization.enabled ? Color.Green : Color.SecondaryText,
              },
            },
          ]}
          actions={
            <ActionPanel>
              <Action
                title={organization.enabled ? "Disable Organization" : "Enable Organization"}
                icon={organization.enabled ? Icon.XMarkCircle : Icon.CheckCircle}
                onAction={() => void toggle(name, !organization.enabled)}
              />
              <Action title="Enable All Organizations" icon={Icon.CheckCircle} onAction={() => void setAll(true)} />
              <Action title="Disable All Organizations" icon={Icon.XMarkCircle} onAction={() => void setAll(false)} />
              <Action title="Sync Repositories" icon={Icon.ArrowClockwise} onAction={() => void sync()} />
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

function repositoryLabel(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "repository" : "repositories"}`;
}
