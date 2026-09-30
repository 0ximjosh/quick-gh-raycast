import { Action, ActionPanel, Form, Icon, Toast, popToRoot, showToast } from "@raycast/api";
import { useState } from "react";
import { formatError } from "./format-error";
import { addLink, validateLink, validateName } from "./links";

export default function AddLink() {
  const [nameError, setNameError] = useState<string | undefined>();
  const [linkError, setLinkError] = useState<string | undefined>();

  async function submit(values: { name: string; link: string }) {
    const nextNameError = validateName(values.name);
    const nextLinkError = validateLink(values.link);
    setNameError(nextNameError);
    setLinkError(nextLinkError);
    if (nextNameError || nextLinkError) {
      return;
    }

    try {
      const entry = await addLink(values.name, values.link);
      await showToast({ style: Toast.Style.Success, title: `Added ${entry.name}`, message: entry.url });
      await popToRoot();
    } catch (error) {
      await showToast({ style: Toast.Style.Failure, title: "Couldn't add link", message: formatError(error) });
    }
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Add Link" icon={Icon.Link} onSubmit={submit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="name"
        title="Name"
        placeholder="Team wiki"
        error={nameError}
        onChange={() => setNameError(undefined)}
      />
      <Form.TextField
        id="link"
        title="Link"
        placeholder="https://example.com/wiki"
        error={linkError}
        onChange={() => setLinkError(undefined)}
      />
    </Form>
  );
}
