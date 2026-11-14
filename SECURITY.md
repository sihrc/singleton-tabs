# Security Policy

## Supported versions

Security fixes target the latest release and the current `main` branch.

## Reporting a vulnerability

Do not publish exploit details, private URLs, credentials, or browsing data in a
public issue. If GitHub offers a **Report a vulnerability** action on the
repository's Security page, use it to submit the report privately.

If private vulnerability reporting is unavailable, open a public issue that asks
for a private contact channel without including vulnerability details. A
maintainer can then arrange a private follow-up.

Include the affected version, impact, reproduction conditions, and a minimal
proof of concept after a private channel is established. Reports made in good
faith will be handled respectfully.

## Security boundaries

Singleton Tabs intentionally has no host permissions, content scripts, remote
code, telemetry, or network service. Changes that introduce any of those surfaces
require explicit design and security review.
