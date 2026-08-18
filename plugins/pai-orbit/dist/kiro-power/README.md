# pai-orbit Kiro Power

This directory contains the pai-orbit power for Kiro, providing structured development methodology through skills and steering files.

## What's Included

- **POWER.md** - Main power documentation and overview
- **skills/** - All pai-orbit modes and operational skills as Kiro skills
- **steering/** - Auto-loading methodology guidance

## Installation via Kiro Powers

This power can be installed through Kiro's power system:

```bash
# Add power (exact command depends on Kiro's power system)
# The power would be hosted and installable via GitHub URL
```

## Manual Installation

If installing manually:

```bash
cp -r skills/ ~/.kiro/skills/
cp -r steering/ ~/.kiro/steering/
```

## Features

- **20 Skills**: All modes (`groom-mode`, `build-mode`, etc.) + operational skills (`git-skill`, `analysis-skill`, etc.)
- **Auto-loading methodology**: Steering files provide guidance and suggest mode switches
- **Structured documentation**: Consistent `docs/` output across all AI tools
- **3-phase grooming**: Improved requirements process (Purpose → Scenarios → Requirements)

## Usage

After installation, skills are activated with `#skill-name`:

- `#groom-mode` - Start feature requirements
- `#build-mode` - Implementation session
- `#design-mode` - Technical decisions
- `#release-mode` - Safe deployment
- `#review-mode` - Code review (ask for the security-focused pass within it)

The methodology steering automatically guides conversations toward appropriate workflows.
