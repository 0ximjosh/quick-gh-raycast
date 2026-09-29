export function formatError(error: unknown): string {
  if (error && typeof error === "object") {
    const details = error as { code?: string; stderr?: string | Buffer; message?: string };
    if (details.code === "ENOENT") {
      return "GitHub CLI (gh) was not found. Install it from https://cli.github.com and run gh auth login.";
    }

    const stderr = details.stderr?.toString().trim();
    if (stderr) {
      return stderr.replace(/\s+/g, " ").slice(0, 240);
    }

    if (details.message) {
      return details.message;
    }
  }

  return "Something went wrong";
}
