# pai-orbit for Kiro - Installation & Usage

pai-orbit brings structured development methodology to Kiro through powers, skills, and steering files.

## Installation

### Option 1: Kiro Power (Recommended)

Install directly via Kiro's power system:

```bash
# Open Kiro's power configuration
kiroPowers configure

# Add pai-orbit power from GitHub URL:
# https://github.com/the-psi/pai-orbit

# Or via command line (if supported):
# kiro power install https://github.com/the-psi/pai-orbit
```

This automatically installs all skills, steering files, and methodology guidance.

### Option 2: Manual Files

Copy files directly to your Kiro directory:

```bash
# From the pai-orbit distribution
cp -r plugins/pai-orbit/dist/kiro/skills/ .kiro/skills/
cp -r plugins/pai-orbit/dist/kiro/steering/ .kiro/steering/
```

## Verify Installation

The steering files will auto-load and provide methodology guidance. Skills are available for manual activation:

```
Available skills: groom-mode, design-mode, build-mode, arch-mode, plan-mode, ux-mode, data-mode
Available operational skills: git-skill, deploy-skill, review-skill, test-skill, analysis-skill
```

## Usage

### Activating Modes

Use the `#skill-name` syntax to activate specific modes:

- `#groom-mode` - Feature requirements with 3-phase approach
- `#design-mode` - Technical decisions and architecture  
- `#build-mode` - Implementation session
- `#arch-mode` - System architecture declarations

### Activating Skills

Operational skills for specific procedures:

- `#git-skill` - Git operations following project conventions
- `#deploy-skill` - Guided deployment with safety checks
- `#review-skill` - Structured code review process
- `#test-skill` - Test planning and execution

### Automatic Guidance

The methodology steering files (`pai-orbit-methodology.md`, `mode-switching-guide.md`) auto-load and will:

- Guide conversation toward appropriate modes
- Suggest mode switches when detecting workflow changes
- Enforce mode discipline and documentation practices
- Provide context about the pai-orbit structured approach

## Example Session

```
User: I want to add a new user authentication feature

Kiro: I detect you're starting work on a new feature. Let me activate groom-mode to establish the requirements properly.

#groom-mode

Now I'm in GROOM MODE following the 3-phase approach:

Phase 1: Establish Purpose
- What problem does user authentication solve?
- Who is this for (specific user types)?
- What outcome should they achieve?

[Continues with structured grooming...]
```

## What Gets Created

pai-orbit maintains the same documentation structure regardless of tool:

```
docs/
├── features/
│   └── user-auth/
│       ├── requirements.md    # from #groom-mode
│       ├── design.md          # from #design-mode  
│       └── test-plan.md       # from #test-skill
├── architecture/
│   ├── system.md              # from #arch-mode
│   └── constraints.md
└── decisions/                 # ADRs from design/arch modes
    └── 2024-01-15-auth-approach.md
```

## Benefits in Kiro

- **Consistent methodology** across team members using different AI tools
- **Structured workflows** that prevent context loss
- **Local-first documentation** that gets committed with code  
- **Mode discipline** that keeps conversations focused
- **3-phase grooming** for better feature definition

## Tool Compatibility

The same methodology works with:
- **Claude Code** (full plugin with slash commands)
- **Cursor** (plugin with rules and agents)
- **Kiro** (skills and steering) ← You are here
- **GitHub Copilot** (instruction files)

Your team can mix tools while maintaining consistent workflow and documentation.