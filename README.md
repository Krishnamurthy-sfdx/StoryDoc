# StoryDoc

> **Automatically generate Salesforce technical documentation from a pull request.**

[![CI](https://github.com/Krishnamurthy-sfdx/StoryDoc/actions/workflows/storydoc.yml/badge.svg)](https://github.com/Krishnamurthy-sfdx/StoryDoc/actions/workflows/storydoc.yml)

StoryDoc is a **local-first** command-line tool that reads a pull request and its originating story, then uses AI to produce clear technical documentation explaining _what_ was built and _how_ it fulfils each requirement. Everything runs on your machine — there is no StoryDoc server, database, or telemetry.

It targets **Salesforce** development specifically: it recognises Apex classes, Lightning Web Components, Flows, Permission Sets, and other metadata types.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Usage](#usage)
- [Generated Output](#generated-output)
- [Configuration](#configuration)
  - [Jira](#jira)
  - [Codex Models](#codex-models)
- [Security](#security)
- [Testing](#testing)
- [Documentation](#documentation)

---

## How It Works

```mermaid
graph LR
    A["<b>1</b><br/>Load PR<br/>(GitHub/JSON)"]
    B["<b>2</b><br/>Load Story<br/>(Jira/Markdown)"]
    C["<b>3</b><br/>Classify Files<br/>(Salesforce types)"]
    D["<b>4</b><br/>Compress Diff<br/>(filter noise)"]
    E["<b>5</b><br/>Terra 🌍<br/>(extract requirements)"]
    F["<b>6</b><br/>Luna 🌙<br/>(analyze code)"]
    G["<b>7</b><br/>Safety Checks<br/>(validate/redact)"]
    H["<b>8</b><br/>Write Output<br/>(5 files)"]

    A --> B --> C --> D --> E --> F --> G --> H

    style A fill:#667eea,stroke:#764ba2,color:#fff
    style B fill:#667eea,stroke:#764ba2,color:#fff
    style C fill:#f093fb,stroke:#f5576c,color:#fff
    style D fill:#f093fb,stroke:#f5576c,color:#fff
    style E fill:#4facfe,stroke:#00f2fe,color:#fff
    style F fill:#4facfe,stroke:#00f2fe,color:#fff
    style G fill:#43e97b,stroke:#38f9d7,color:#fff
    style H fill:#fa709a,stroke:#fee140,color:#333
```

Two AI passes do the work: **Terra** extracts a clean list of requirements from the story, and **Luna** analyses the code diff to explain how each change fulfils them. Both run in an isolated, offline, read-only sandbox.

---

## Features

- **Local-first & private** — no server, no database; your code and credentials never leave your machine.
- **Two-pass AI analysis** — Terra (requirements) and Luna (implementation) via the OpenAI Codex SDK.
- **Salesforce-aware** — classifies Apex, LWC, Aura, Flows, Permission Sets, and more.
- **Grounded output** — every file the AI cites must exist in the PR, or the run fails. No documentation is better than wrong documentation.
- **Secret-safe** — credentials in inputs and generated text are redacted before anything is written; a repo-wide secret scan runs in CI.
- **Pluggable sources** — read PRs from the `gh` CLI or a JSON fixture, and stories from Jira or local Markdown.
- **Cost visibility** — reports token usage and an API-equivalent cost estimate per run.

---

## Prerequisites

| Requirement           | Notes                                                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Node.js ≥ 20.12**   | The CLI is built and run with Node.                                                                                                              |
| **pnpm**              | Package manager used by this repo.                                                                                                               |
| **GitHub CLI (`gh`)** | Required only for live PR ingestion. Authenticate once with `gh auth login`. StoryDoc contains no GitHub token handling — it shells out to `gh`. |
| **Jira access**       | Optional. Required only for live story ingestion; otherwise use `--story-file`.                                                                  |
| **Codex SDK**         | Bundled as a dependency. Required for real AI runs (not needed with `--skip-ai`).                                                                |

---

## Installation

```bash
pnpm install
pnpm run build:storydoc
```

---

## Quick Start

Try StoryDoc immediately with the bundled fixtures — no GitHub, Jira, or AI required:

```bash
pnpm run storydoc generate \
  --pr 142 --ticket APP-142 \
  --pr-file examples/pr-142.json \
  --story-file examples/story.md \
  --design-file examples/design.md \
  --skip-ai
```

Output is written to `.storydoc/APP-142/`. Drop `--skip-ai` to run the same fixtures through Terra and Luna (requires a working local Codex setup).

---

## Usage

```bash
pnpm run storydoc generate [options]
```

| Option                 | Required | Description                                                                           |
| ---------------------- | :------: | ------------------------------------------------------------------------------------- |
| `--pr <number>`        |    ✅    | Pull request number to document. Must be a positive integer.                          |
| `--ticket <id>`        |    ✅    | Story/Jira reference (e.g. `APP-142`). Also used as the output folder name.           |
| `--story-file <path>`  |          | Read the story from a local Markdown file instead of Jira.                            |
| `--design-file <path>` |          | Local Markdown file with the technical design.                                        |
| `--pr-file <path>`     |          | Read the PR from a local JSON file instead of GitHub.                                 |
| `--output-dir <path>`  |          | Output directory. Defaults to `.storydoc`.                                            |
| `--force`              |          | Overwrite previously generated files. Without it, StoryDoc refuses to overwrite.      |
| `--skip-ai`            |          | Skip both AI passes and produce a structural report. Useful for testing the plumbing. |

**Live run** against a real PR (from a repo you have checked out, with `gh` authenticated):

```bash
gh auth login                    # one time
pnpm run storydoc generate --pr 142 --ticket APP-142
```

StoryDoc invokes `gh pr view` and `gh pr diff` under the hood.

---

## Generated Output

Files are written to `.storydoc/<ticket>/` (the ticket is sanitized into a safe folder name):

| File                           | Description                                                                                  |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| `analysis.json`                | Validated, structured source of truth.                                                       |
| `technical-documentation.md`   | Human-readable Markdown documentation.                                                       |
| `technical-documentation.html` | The same document as a styled, self-contained web page.                                      |
| `usage.json`                   | Terra/Luna token usage and an API-equivalent cost estimate. _(Temporary diagnostic output.)_ |
| `compression-audit.json`       | Diff-compression metrics — files and bytes before/after filtering and hunking.               |

Existing files are never overwritten unless you pass `--force`.

---

## Configuration

Configuration is read from environment variables, most conveniently via a local `.env` file. StoryDoc loads it automatically at startup, **never overrides variables already set** in your shell or CI, and refuses a group- or world-readable `.env` on macOS/Linux.

```bash
cp .env.example .env
chmod 600 .env
```

`.env` is git-ignored. Never commit it, paste a token into a PR or chat, or place a token in a command saved to shell history. If a token is exposed, revoke it and issue a replacement. For CI, store values in the provider's encrypted secret store — not in workflow YAML.

### Jira

StoryDoc requests only three fields from a ticket — `summary`, the acceptance-criteria field, and the technical-design field — never the whole issue:

```dotenv
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_CLOUD_ID=your-atlassian-cloud-id
JIRA_EMAIL=developer@example.com
JIRA_API_TOKEN=
JIRA_ACCEPTANCE_CRITERIA_FIELD=customfield_12345
JIRA_TECHNICAL_DESIGN_FIELD=customfield_12346
```

The request is equivalent to:

```text
GET /rest/api/3/issue/APP-142?fields=summary,<acceptance-criteria-field>,<technical-design-field>
```

**Authentication** — three setups, validated at startup:

- **Scoped Atlassian API token** (recommended): set `JIRA_CLOUD_ID` + `JIRA_EMAIL` + `JIRA_API_TOKEN`. Requests route through Atlassian's API gateway with HTTP Basic auth.
- **Legacy unscoped token**: omit `JIRA_CLOUD_ID`; requests go directly to the site URL.
- **Organisation-managed bearer token**: set `JIRA_BEARER_TOKEN` instead. It must **not** be combined with `JIRA_EMAIL`/`JIRA_API_TOKEN`.

Requests require HTTPS (`http://` only for `localhost`) and time out after 15 seconds. If Jira is not configured, use `--story-file` and optional `--design-file`.

### Codex Models

Defaults route Terra at low reasoning effort and Luna at high:

```bash
export STORYDOC_REQUIREMENTS_MODEL="gpt-5.6-terra"
export STORYDOC_REQUIREMENTS_REASONING_EFFORT="low"
export STORYDOC_IMPLEMENTATION_MODEL="gpt-5.6-luna"
export STORYDOC_IMPLEMENTATION_REASONING_EFFORT="low"
```

Accepted reasoning-effort values: `minimal`, `low`, `medium`, `high`, `xhigh`. `STORYDOC_TERRA_MODEL` and `STORYDOC_LUNA_MODEL` remain supported as shorter model-name overrides.

After each stage, StoryDoc prints token usage. For the default GPT-5.6 models it also prints an API-equivalent USD estimate and saves it to `usage.json`. This uses public API rates and **is not an invoice** — Codex-plan billing, discounts, credits, taxes, and org terms can differ.

Other useful variables:

| Variable                  | Purpose                                                                        |
| ------------------------- | ------------------------------------------------------------------------------ |
| `STORYDOC_MAX_DIFF_BYTES` | Change the default 5 MB pull-request diff limit.                               |
| `STORYDOC_CODEX_PATH`     | Point at a current authenticated Codex executable, e.g. `$(command -v codex)`. |

---

## Security

StoryDoc is built defensively around untrusted input:

- **Isolated AI sandbox** — each pass runs in a fresh temporary directory, read-only, with network and web search disabled. The model cannot read your repository or `.env`.
- **Prompt-injection defence** — all external content (story, PR body, diff) is wrapped in untrusted-data markers the model is told never to obey as instructions.
- **Secret redaction** — credentials are redacted from AI inputs _and_ from the final document before it is written to disk.
- **No hallucinated files** — every component path the AI cites is checked against the actual PR file list; a mismatch fails the run.
- **Path-traversal safe** — the `--ticket` value is sanitized and the resolved output path is verified to stay inside the output directory.
- **Repo secret scan** — `pnpm run check:secrets` scans every git-tracked file for token shapes; it also runs in CI. It reports only filenames, never values.

---

## Testing

```bash
pnpm run test:storydoc     # compile + run the unit suite
pnpm run check:secrets     # scan tracked files for leaked credentials
```

The GitHub Actions workflow at `.github/workflows/storydoc.yml` runs the secret scan and the full test suite on every push and pull request, with read-only repository permissions.

---

## Documentation

For a full, plain-language walkthrough of every module and design decision, see **[docs/IMPLEMENTATION_GUIDE.md](docs/IMPLEMENTATION_GUIDE.md)**.
