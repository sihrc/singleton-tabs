# Contributing

Thanks for helping improve Singleton Tabs. Bug reports, focused feature proposals,
documentation corrections, tests, and code contributions are welcome.

## Before opening an issue

1. Search existing issues to avoid duplicates.
2. Confirm the behavior with the latest `main` branch.
3. Use the relevant issue template and include only information needed to
   reproduce or evaluate the request.
4. Remove account names, private URLs, tokens, and browsing data from screenshots,
   logs, and example rules.

Security-sensitive reports should follow the [Security Policy](SECURITY.md) and
must not include exploit details or private data in a public issue.

## Development setup

Requirements: Node.js 20 or newer and a Chromium-based browser that supports
Manifest V3. The project has no package-install step or runtime dependencies.

```sh
npm test
npm run check
```

To exercise browser behavior, load the repository root as an unpacked extension
from `chrome://extensions`, then reload the extension after changing source files.

## Pull requests

- Keep each pull request focused on one behavior or maintenance concern.
- Explain the user-visible outcome and important tradeoffs.
- Add or update tests for changed settings, matching, planning, coordination, or
  error-handling behavior.
- Update README or architecture documentation when behavior or boundaries change.
- Run `npm test`, `npm run check`, and `git diff --check` before requesting review.
- Do not add runtime dependencies, remote code, telemetry, content scripts, host
  permissions, or network access without an explicit design discussion.
- Preserve user-owned pinned state, tab groups, and non-singleton tab ordering.

## Code style

Use modern JavaScript modules, small pure functions for core behavior, and explicit
adapter methods for Chrome API access. Keep browser mutations in the coordinator or
platform adapter so planning remains deterministic and testable.

## Community expectations

Participation in repository discussions and contributions is governed by the
[Code of Conduct](CODE_OF_CONDUCT.md).
