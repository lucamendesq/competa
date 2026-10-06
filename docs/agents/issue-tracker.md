# Issue Tracker

Issues for this repository are tracked in Linear.

## Workflow

Use Linear as the issue tracker.

Workspace: Competa

Tickets are Linear issues. Identify issues by their full identifier,
for example COM-123, not by a bare number.

To read an issue, retrieve its title, description, acceptance criteria,
labels, status, relations, and comments.

To determine dependencies, use Linear issue relations:

- "blocks" means the target ticket cannot start yet.
- "blocked by" means the ticket is not ready.
- A ticket is ready when all of its blocking issues are completed or canceled.

When creating tickets, preserve:

- title
- description
- acceptance criteria
- labels
- priority
- project
- parent/sub-issue relationship
- blocking relations

When implementation is complete, do not assume that a Git commit
automatically closes the Linear issue. Update the Linear issue explicitly
according to this workflow:

- implementation branch created: leave status unchanged or set In Progress
- implementation committed: set In Review if that status exists
- merged into the integration branch: set Done
- blocked or failed: set Blocked and add a comment explaining why

Use the Linear API, Linear MCP server, or an authenticated Linear CLI,
whichever is available in this environment. Never infer issue data from
a ticket identifier alone.
