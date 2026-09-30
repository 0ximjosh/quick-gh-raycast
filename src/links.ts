import { randomUUID } from "crypto";
import { mkdir, readFile, rename, writeFile } from "fs/promises";
import { join } from "path";
import { configDirectory } from "./config";
import type { CustomLink, LinksFile } from "./types";

export const linksPath = join(configDirectory, "links.json");

export async function readLinks(): Promise<CustomLink[]> {
  let raw: string;
  try {
    raw = await readFile(linksPath, "utf8");
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Couldn't parse ${linksPath}. Fix the JSON or delete the file.`);
  }

  if (!isLinksFile(parsed)) {
    throw new Error(`Couldn't read ${linksPath}. Expected a list of links with a name and url.`);
  }

  return parsed.links;
}

export async function addLink(name: string, link: string): Promise<CustomLink> {
  const entry: CustomLink = { id: randomUUID(), name: name.trim(), url: normalizeUrl(link) };
  const links = await readLinks();
  await writeLinks([...links, entry]);
  return entry;
}

export function validateName(value: string | undefined): string | undefined {
  return value?.trim() ? undefined : "Enter a name";
}

export function validateLink(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return "Enter a link";
  }
  try {
    new URL(normalizeUrl(value));
    return undefined;
  } catch {
    return "Enter a valid link";
  }
}

// Bare hosts like "example.com/docs" are common when pasting; default them to https.
function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

async function writeLinks(links: CustomLink[]): Promise<void> {
  await mkdir(configDirectory, { recursive: true });
  const file: LinksFile = { version: 1, links };
  const temporaryPath = join(configDirectory, `.links.${process.pid}.tmp`);
  await writeFile(temporaryPath, `${JSON.stringify(file, null, 2)}\n`);
  await rename(temporaryPath, linksPath);
}

function isLinksFile(value: unknown): value is LinksFile {
  if (!value || typeof value !== "object") {
    return false;
  }
  const file = value as Partial<LinksFile>;
  return file.version === 1 && Array.isArray(file.links) && file.links.every(isCustomLink);
}

function isCustomLink(value: unknown): value is CustomLink {
  if (!value || typeof value !== "object") {
    return false;
  }
  const link = value as Partial<CustomLink>;
  return typeof link.id === "string" && typeof link.name === "string" && typeof link.url === "string";
}

function isMissingFile(error: unknown): boolean {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}
