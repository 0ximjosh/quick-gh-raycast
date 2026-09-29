# Quick GitHub

A Raycast extension for opening a GitHub repository without digging through github.com.

Sync stores every repository visible on your account and on each organization you belong to, grouped by owner, in `~/.config/quick-gh-raycast/config.json`. Search is a fuzzy finder over the organizations you have enabled. Organization Settings turns owners on and off, and those choices survive the next sync.

## Commands

- **Search Repositories** finds a repository by name, owner, or description and opens it in the browser.
- **Sync Repositories** runs `gh` and rewrites the config file. Existing enabled or disabled choices are kept. New owners default to enabled.
- **Organization Settings** enables or disables each owner in search.

Your personal account is stored the same way as an organization, under your GitHub login.

## Setup

Install and authenticate the [GitHub CLI](https://cli.github.com/), then from this directory:

```bash
npm install
npm run dev
```

`npm run dev` loads the extension into Raycast. Pin Search Repositories in Raycast root search for the daily shortcut.

Raycast's extension preference pane can only show fields declared ahead of time, so it cannot grow a checkbox when a new organization appears. Per-organization switches live in Organization Settings and are written to `enabled` on each owner in the config file.

## Config

```json
{
  "version": 1,
  "syncedAt": "2026-09-29T16:00:00.000Z",
  "orgs": {
    "acme": {
      "enabled": true,
      "kind": "organization",
      "repositories": [
        {
          "name": "widgets",
          "fullName": "acme/widgets",
          "url": "https://github.com/acme/widgets",
          "description": "Widget service",
          "private": false,
          "archived": false,
          "fork": false
        }
      ]
    }
  }
}
```
