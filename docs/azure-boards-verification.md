# Verify Azure Boards support

Use a test Azure DevOps project or a disposable work item to walk through setup, board operations, and failure handling.

## 1. Prepare your test

Install the build from the branch or commit being tested, rather than the default branch. Follow the [installation instructions](../README.md) for your assistant. For Copilot, rerun the installer/update step to refresh `.github/prompts/`, then run setup; setup itself deliberately does not overwrite installed prompts.

Have these values ready: board URL, organisation, project, team, the team's area path, a work-item type shown on its board, and your Azure identity (email). A non-default team's board is a useful test because it catches tasks created in the wrong area. Confirm the exact state names and column mapping in that board's settings.

Run these one-line commands separately in your terminal, replacing the placeholders:

```text
az --version
az extension show --name azure-devops
```

If needed, [install Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli), then install its extension:

```text
az extension add --name azure-devops
```

Use your organisation's approved sign-in method. For PAT authentication, `az devops login --organization "https://dev.azure.com/<org>"` prompts in your terminal. Do not paste tokens into assistant chat, repository files, or test evidence. See [Microsoft's authentication guide](https://learn.microsoft.com/en-us/azure/devops/cli/log-in-via-pat?view=azure-devops).

Check project access:

```text
az devops project show --org "https://dev.azure.com/<org>" --project "<project>" -o none
```

Expected: success with no output. Check the exit status immediately: `$LASTEXITCODE` in PowerShell or `echo $?` in Bash should be `0`. This proves the read probe worked; it does not prove permission to create or edit work items.

## 2. Run setup

Invoke setup in your assistant (`/setup`, or `$setup` in Codex). Choose Azure DevOps and provide the test board URL.

Check that the assistant:

- Confirms organisation, project, team, and work-item type.
- Looks up the team's area settings and asks you to confirm the area path.
- Discovers work-item states and asks you to confirm their mapping to displayed board columns.
- Confirms a closing state separately, even if you leave it out of active columns.
- Saves your Azure identity in the team roster.

Inspect the generated `pai-orbit-config.md` and `team.md` under `.claude/`, `.cursor/`, `.codex/`, or `.copilot/`, depending on the assistant. Azure config should contain Organisation, Project, Team, Area path, Work-item type, Closing state, and the confirmed columns mapping, with no unresolved placeholders. Check Copilot explicitly: its roster must include Azure DevOps.

For a separate test project using GitHub, GitLab, Jira, or another provider, setup must not ask for Azure fields, run Azure checks, or write the Azure config block. Unused roster platform columns may remain blank.

## 3. Exercise one disposable work item

Use the assistant's board command for these requests, one at a time. Replace bracketed values with your real values.

1. **Create:** “Create an Azure Boards [work-item type] called ‘PAI Orbit Azure verification’, assigned to me, using the configured area.” Record its ID. In Azure, confirm the title, type, project, assignee, and area. Confirm it appears on the intended team's board; if not, inspect the board's type/area/iteration filters before calling the test passed.
2. **Read:** “Show Azure work item [ID].” Compare the returned fields with Azure.
3. **Move:** “Move [ID] to [a valid configured column].” Confirm its state in Azure. If two columns share a state, the assistant should explain that a state change alone cannot choose between them.
4. **Assign:** “Assign [ID] to [a consenting test team member].” Confirm the identity used matches the roster. Assign it back afterward if appropriate.
5. **Comment:** “Add the comment ‘PAI Orbit verification complete’ to [ID].” Confirm it appears once in the discussion.
6. **Close:** “Close test item [ID] using the configured closing state.” Confirm the actual terminal state, rather than assuming its name is Closed.

After steps 3–6, confirm Area Path and Iteration Path stayed unchanged. The assistant should report success only after checking the write and reading the item back. If verification fails after a successful write, it should explain the uncertainty rather than retrying and creating duplicate items/comments.

## 4. Check failure handling

Use an isolated terminal/test environment so you do not disrupt your normal credentials or installation.

- **CLI or extension absent:** the assistant should explain what is missing and stop before board operations.
- **Missing/expired credential:** use a test environment without working Azure credentials. It should report the authentication remedy and never claim a task was created. An alternative cached sign-in can make this test succeed; verify the environment actually lacks access.
- **Wrong project or insufficient permissions:** it should report the actual error, rather than labelling every failure “not authenticated.”
- **Empty discovery:** use a tool-response fixture returning an empty resource listing or empty state list. The assistant should ask for the manual mapping, and must not call a resource with blank names or save empty states.
- **Windows PowerShell 5.1:** run setup and the board sequence there if Windows support is being claimed. Commands must not fail because of Bash continuations, `/dev/null`, or shell-level `||`.

## 5. Record the result

For each assistant tested, record: PR commit, assistant/version, OS/shell, Azure CLI/extension versions, date, test work-item ID, and pass/fail for setup, area routing, create/read/move/assign/comment/close, and failure handling. Keep tokens and sensitive project data out of screenshots or logs.

Record packaging results separately from the behavior observed for each assistant and shell.

## Reference commands

The expected arguments are documented in Microsoft's [work-item CLI reference](https://learn.microsoft.com/en-us/cli/azure/boards/work-item?view=azure-cli-latest), [team-area reference](https://learn.microsoft.com/en-us/cli/azure/boards/area/team?view=azure-cli-latest), and [DevOps invoke reference](https://learn.microsoft.com/en-us/cli/azure/devops?view=azure-cli-latest#az-devops-invoke).
