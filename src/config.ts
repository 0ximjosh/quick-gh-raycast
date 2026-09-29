import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";
import type { Config } from "./types";

export const configDirectory = join(homedir(), ".config", "quick-gh-raycast");
export const configPath = join(configDirectory, "config.json");

export async function readConfig(): Promise<Config | null> {
  let raw: string;
  try {
    raw = await readFile(configPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      return null;
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Couldn't parse ${configPath}. Fix the JSON or delete the file and sync again.`);
  }

  if (!isConfig(parsed)) {
    throw new Error(`Couldn't read ${configPath}. Expected repositories grouped by organization.`);
  }

  return parsed;
}

export async function writeConfig(config: Config): Promise<void> {
  await mkdir(configDirectory, { recursive: true });
  const temporaryPath = join(configDirectory, `.config.${process.pid}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(config, null, 2)}\n`);
  await rename(temporaryPath, configPath);
}

export function repositoryCount(config: Config, options?: { enabledOnly?: boolean }): number {
  return Object.values(config.orgs)
    .filter((organization) => !options?.enabledOnly || organization.enabled)
    .reduce((count, organization) => count + organization.repositories.length, 0);
}

function isConfig(value: unknown): value is Config {
  if (!value || typeof value !== "object") {
    return false;
  }

  const config = value as Partial<Config>;
  return config.version === 1 && !!config.orgs && typeof config.orgs === "object";
}

function isMissingFile(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
