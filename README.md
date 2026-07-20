# StoryDoc Salesforce Project

StoryDoc is a local CLI for generating Salesforce technical documentation from a pull request. It uses an authenticated `gh` executable for PR-number ingestion, Jira for the issue summary and two configured requirement fields, and the Codex SDK in a read-only isolated workspace. Terra performs focused requirement extraction; Luna High performs the more complex implementation analysis.

## StoryDoc CLI

Install dependencies and build the CLI:

```bash
pnpm install
pnpm run build:storydoc
```

Run the verified local fixture without AI calls:

```bash
pnpm run storydoc generate \
  --pr 142 --ticket APP-142 \
  --pr-file examples/pr-142.json \
  --story-file examples/story.md \
  --design-file examples/design.md \
  --skip-ai
```

Run the same fixture through Terra and Luna:

```bash
pnpm run storydoc generate \
  --pr 142 --ticket APP-142 \
  --pr-file examples/pr-142.json \
  --story-file examples/story.md \
  --design-file examples/design.md
```

Run against a real PR created from VS Code after installing and authenticating the GitHub CLI:

```bash
# Install gh first if it is not already available on PATH.
gh auth login
pnpm run storydoc generate --pr 142 --ticket APP-142
```

StoryDoc invokes `gh pr view` and `gh pr diff`; it does not contain a GitHub API client or GitHub token handling.

Generated files are written to `.storydoc/<ticket>/`:

- `analysis.json` — validated source of truth.
- `technical-documentation.md` — Markdown rendering.
- `technical-documentation.html` — HTML rendering.

Output directories use a sanitized ticket identifier. Existing generated files are not overwritten unless `--force` is supplied. For example, rerun with `--force` only when you intentionally want to replace all three generated files.

StoryDoc sends only the supplied story fields and pull-request metadata/diff to the Codex analysis calls. Both models run from isolated temporary workspaces, cannot inspect the local repository, cannot use web search, and cannot modify files. Likely credentials in inputs and generated text are redacted before files are written.

### Jira configuration and secret safety

Every user connects their own Jira instance through a local `.env` file. StoryDoc loads this file automatically, never overwrites variables already supplied by the shell or CI environment, and refuses a group- or world-readable `.env` file on macOS/Linux.

```bash
cp .env.example .env
chmod 600 .env
```

Edit only `.env`; it is ignored by Git. Use the placeholders in `.env.example` to configure the Jira base URL, cloud ID, email, and the two custom fields. For a scoped Atlassian API token, use read-only Jira access and set these values:

```dotenv
JIRA_BASE_URL=https://your-company.atlassian.net
JIRA_CLOUD_ID=your-atlassian-cloud-id
JIRA_EMAIL=developer@example.com
JIRA_API_TOKEN=
JIRA_ACCEPTANCE_CRITERIA_FIELD=customfield_12345
JIRA_TECHNICAL_DESIGN_FIELD=customfield_12346
```

Never commit `.env`, paste a real token into a pull request or chat, or put it in a command that will be saved in shell history. If a token is exposed, revoke it in Atlassian and create a replacement. For CI, store the same values in the CI provider's encrypted-secret store and inject them as environment variables; do not write them into workflow YAML.

Scoped Atlassian API tokens require `JIRA_CLOUD_ID`; StoryDoc then calls Atlassian's API gateway with HTTP Basic authentication. A legacy unscoped token can omit `JIRA_CLOUD_ID` and use the site URL directly. An organisation-managed bearer-token integration may use `JIRA_BEARER_TOKEN` instead, but it must not be configured alongside `JIRA_EMAIL` or `JIRA_API_TOKEN`. Jira requests require HTTPS and time out after 15 seconds by default. Set `STORYDOC_MAX_DIFF_BYTES` to change the default 5 MB pull-request diff limit.

The Jira request is equivalent to:

```text
GET /rest/api/3/issue/APP-142?fields=summary,<acceptance-criteria-field>,<technical-design-field>
```

No Jira description or other fields are requested. The title uses Jira's built-in summary; the analysis input uses only the summary, Acceptance Criteria, and Technical Design. If Jira is not configured, use `--story-file` and optional `--design-file`.

With those variables configured, invoke live JIRA ingestion with:

```bash
pnpm run storydoc generate --pr 142 --ticket APP-142
```

### Codex model configuration

The default routing uses Terra with low reasoning effort for requirement extraction and Luna with high reasoning effort for implementation analysis:

```bash
export STORYDOC_REQUIREMENTS_MODEL="gpt-5.6-terra"
export STORYDOC_REQUIREMENTS_REASONING_EFFORT="low"
export STORYDOC_IMPLEMENTATION_MODEL="gpt-5.6-luna"
export STORYDOC_IMPLEMENTATION_REASONING_EFFORT="high"
```

`minimal`, `low`, `medium`, `high`, and `xhigh` are accepted reasoning-effort values. `STORYDOC_TERRA_MODEL` and `STORYDOC_LUNA_MODEL` remain supported as shorter model-name overrides. AI output is schema-validated and every cited component path must be present in the PR file list.

If the Codex SDK's bundled executable is unavailable or outdated in a local environment, point StoryDoc at a current authenticated Codex executable without changing application code:

```bash
export STORYDOC_CODEX_PATH="$(command -v codex)"
```

Run StoryDoc unit tests:

```bash
pnpm run test:storydoc
```

Run the tracked-file secret scan locally before committing:

```bash
pnpm run check:secrets
```

The GitHub Actions workflow at `.github/workflows/storydoc.yml` runs both the secret scan and unit tests on pushes and pull requests. The scan reports only filenames, never token values.

---

## Salesforce DX Project

Salesforce DX is a development approach that brings source-driven development, team collaboration, and continuous integration to the Salesforce Platform. Instead of working directly in an org through a web browser, you work with metadata as source files in a local DX project, track changes in version control, and deploy through automated processes.

This project template gets you started with the tools and structure you need to build Salesforce applications using source control, scratch orgs, and the Salesforce CLI.

## Prerequisites

Before you start, make sure you have:

- **Salesforce CLI** - Download from [developer.salesforce.com/tools/salesforcecli](https://developer.salesforce.com/tools/salesforcecli). See [Install Salesforce CLI](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_install_cli.htm) for details.
- **VS Code with Salesforce Extension Pack** - See [Installation Instructions](https://developer.salesforce.com/docs/platform/sfvscode-extensions/guide/install.html) for details. Includes the Agentforce Vibes extension.
- **A development org** - Sign up for a free Developer Edition org [here](https://developer.salesforce.com/signup).
- **Dev Hub enabled** (optional, required to create scratch orgs) - You can enable Dev Hub in your development org under Setup > Dev Hub.  See [Provide Developers Access to Salesforce DX Tools](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_setup_dx_tools.htm).

## Project Structure

Your DX project follows this structure:

- **`force-app/main/default/`** - Your metadata source files live in this default package directory. You can configure additional package directories in the `sfdx-project.json` file.
- **`config/`** - Scratch org definitions and project settings
- **`scripts/`** - Automation scripts for common tasks
- **`sfdx-project.json`** - Project manifest that defines package directories, namespace, API version, and other project-level settings

See [Salesforce DX Project Configuration](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_ws_config.htm).

## Get Started

Ready to start developing? The [Get Started with Salesforce DX](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/sfdx_dev_get_started_dx.htm) guide walks you through your first project, from creating a scratch org to creating a simple Apex class or LWC to deploying your code to a sandbox.

## Common Salesforce CLI Commands

Here are common CLI commands that you'll use the most:

- `sf org login web`: Authorize an org
- `sf org open`: Open your org in a browser
- `sf org create scratch`: Create a scratch org
- `sf project deploy start`: Deploy metadata to your org
- `sf project retrieve start`: Retrieve metadata from your org
- `sf template generate <artifact>`: Scaffold new components, such as Apex classes and triggers, LWC components, Lightning apps, and more
- `sf apex <command>`: Run Apex tests, run anonymous Apex blocks, and view logs
- `sf data <command>`: Work with test data
- `sf alias <command>`: Manage org aliases
- `sf config <command>`: Configure CLI settings

## Use Agentforce Vibes to Build Lightning Apps

Transform your ideas into custom Lightning apps that extend CRM workflows directly in Lightning Experience. Through natural conversations with Agentforce Vibes, implement custom objects and fields, complex business logic, and dynamic UI components. See [Build a Lightning App Using Agentforce Vibes](https://developer.salesforce.com/docs/platform/einstein-for-devs/guide/lexapp-overview.html).

## Additional Resources

- [Agentforce Vibes Developer Guide](https://developer.salesforce.com/docs/platform/einstein-for-devs/guide/einstein-overview.html)
- [Salesforce CLI Installation Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_intro.htm)
- [Salesforce DX Developer Guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_dev.meta/sfdx_dev/)
- [Salesforce CLI Command Reference](https://developer.salesforce.com/docs/atlas.en-us.sfdx_cli_reference.meta/sfdx_cli_reference/)
- [Salesforce CLI Plugin Development Guide](https://developer.salesforce.com/docs/platform/salesforce-cli-plugin/guide/conceptual-overview.html)
- [Salesforce VS Code Extensions Documentation](https://developer.salesforce.com/tools/vscode/)
