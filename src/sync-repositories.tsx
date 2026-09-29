import { Toast, showToast } from "@raycast/api";
import { formatError } from "./format-error";
import { syncRepositories } from "./github";

export default async function SyncRepositoriesCommand() {
  const toast = await showToast({ style: Toast.Style.Animated, title: "Syncing GitHub repositories" });

  try {
    const result = await syncRepositories();
    toast.style = Toast.Style.Success;
    toast.title = `Synced ${result.repositoryCount.toLocaleString()} repositories`;
    toast.message = `${result.organizationCount.toLocaleString()} organizations`;
  } catch (error) {
    toast.style = Toast.Style.Failure;
    toast.title = "Couldn't sync repositories";
    toast.message = formatError(error);
  }
}
