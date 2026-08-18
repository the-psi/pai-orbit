#!/usr/bin/env bash
# Kiro Power adapter — converts pai-orbit to a Kiro Power
# Outputs: POWER.md + skills/ + steering/ in power format
set -euo pipefail

ADAPTER_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$ADAPTER_DIR/../.." && pwd)"

CORE_DIR="${CORE_DIR:-$PLUGIN_DIR/core}"
DIST_DIR="${DIST_DIR:-$PLUGIN_DIR/dist/kiro-power}"

if [ ! -d "$CORE_DIR" ]; then
  echo "kiro-power adapter: CORE_DIR not found: $CORE_DIR" >&2
  exit 1
fi

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/skills"
mkdir -p "$DIST_DIR/steering"

# mode_entries/skill_entries collect "name|description" pairs as we generate each file,
# so POWER.md/steering/README below can list what was ACTUALLY generated instead of a
# hand-maintained copy that drifts every time core/ adds, renames, or promotes an entry.
mode_entries=()
skill_entries=()

# Convert modes to skills (same as regular Kiro adapter)
echo "kiro-power: converting modes to skills..."
for mode_file in "$CORE_DIR/modes"/*.md; do
  if [ -f "$mode_file" ]; then
    mode_name="$(basename "$mode_file" .md)"
    echo "kiro-power: processing mode $mode_name"
    mode_description="$(grep -m1 -E "^This is (a|an) " "$mode_file" | sed 's/This is //' | sed 's/\.//' || echo "structured development mode")"

    # Create skill file
    cat > "$DIST_DIR/skills/${mode_name}-mode.md" << EOF
---
name: ${mode_name}-mode
description: pai-orbit ${mode_name} mode - ${mode_description}
inclusion: manual
---

# pai-orbit ${mode_name^^} Mode

$(cat "$mode_file")

## Usage in Kiro
Activate this mode by using \`#${mode_name}-mode\` in your conversation or by typing "enter ${mode_name} mode".

The mode will guide you through the structured workflow and generate the appropriate documentation files.
EOF
    mode_entries+=("${mode_name}-mode|${mode_description}")
  fi
done

# Convert skills (same as regular Kiro adapter)
echo "kiro-power: converting skills..."
for skill_dir in "$CORE_DIR/skills"/*/; do
  if [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ]; then
    skill_name="$(basename "$skill_dir")"
    echo "kiro-power: processing skill $skill_name"

    # Extract description from frontmatter if present, otherwise from first header
    if grep -q "^---" "$skill_dir/SKILL.md"; then
      # Has frontmatter - extract multiline description using awk
      description="$(awk '
        /^---$/ { if(++dash_count == 2) exit }
        dash_count == 1 && /^description:/ {
          desc = substr($0, 13);
          while(getline && !/^[a-zA-Z_-]+:/ && !/^---$/) {
            desc = desc " " $0
          }
          if(!/^---$/) ungetline = $0
          print desc
          exit
        }
        END { if(ungetline) print ungetline | "cat >&2" }
      ' "$skill_dir/SKILL.md" | sed 's/^ *//' | sed 's/ *$//')"
      if [ -z "$description" ]; then
        description="pai-orbit operational skill"
      fi
      # Extract content after the frontmatter block (everything after second ---)
      skill_body="$(awk '/^---$/{if(++c==2){f=1;next}} f' "$skill_dir/SKILL.md")"
    else
      # No frontmatter - extract from first header and use full content
      description="$(grep -m1 "^# " "$skill_dir/SKILL.md" | sed 's/^# //' || echo "pai-orbit operational skill")"
      skill_body="$(cat "$skill_dir/SKILL.md")"
    fi

    cat > "$DIST_DIR/skills/${skill_name}-skill.md" << EOF
---
name: ${skill_name}-skill
description: pai-orbit ${skill_name} skill - ${description}
inclusion: manual
---

# pai-orbit ${skill_name} Skill

${skill_body}

## Usage in Kiro
Activate this skill by using \`#${skill_name}-skill\` in your conversation or by requesting "${skill_name}" operations.
EOF
    skill_entries+=("${skill_name}-skill|${description}")
  fi
done

# Build the "Available Modes"/"Available Skills" bullet lists from what was actually
# generated above, so POWER.md/steering never enumerate a name that doesn't exist.
modes_list=""
for entry in "${mode_entries[@]}"; do
  modes_list+="- **#${entry%%|*}**: ${entry#*|}"$'\n'
done
skills_list=""
for entry in "${skill_entries[@]}"; do
  skills_list+="- **#${entry%%|*}**: ${entry#*|}"$'\n'
done
total_generated=$(( ${#mode_entries[@]} + ${#skill_entries[@]} ))

# Create POWER.md - the main power definition
echo "kiro-power: creating POWER.md..."
cat > "$DIST_DIR/POWER.md" << EOF
# pai-orbit Power

**Structured Development Methodology for Kiro**

pai-orbit brings disciplined, mode-driven development workflows to Kiro, ensuring nothing important lives only in conversations.

## What This Power Provides

### Modes (Major Workflows)
${modes_list}
### Skills (Operational Procedures)
${skills_list}
### Methodology (Auto-Loading)
- **Mode discipline** - Each activity has its own headspace and outputs
- **Producer/consumer contracts** - Clear inputs/outputs prevent context loss
- **Local-first documentation** - Everything gets written to versioned markdown
- **Architecture governance** - Constraints and decisions are enforced

## Installation

This power installs automatically when you activate it. It includes:

1. **Skills** - All modes and operational procedures as Kiro skills
2. **Steering** - Methodology guidance that auto-loads and suggests mode switches
3. **Documentation** - Creates standard \`docs/\` structure for your project

## Usage

After activation, use skills with the \`#skill-name\` syntax:

\`\`\`
#groom-mode     # Start feature requirements (3-phase approach)
#design-mode    # Make technical decisions
#build-mode     # Implement features
#release-mode   # Deploy safely
#review-mode    # Code review process (ask for the security-focused pass within it)
\`\`\`

The methodology steering auto-guides conversations toward structured workflows.

## What Gets Created

pai-orbit maintains consistent documentation across all tools:

\`\`\`
docs/
├── features/
│   └── feature-name/
│       ├── requirements.md    # Purpose, scenarios, acceptance criteria
│       ├── design.md          # Technical decisions, trade-offs
│       └── test-plan.md       # Test cases and coverage
├── architecture/
│   ├── system.md              # Service map and boundaries
│   ├── constraints.md         # Enforcement rules
│   └── stack.md               # Technology choices
├── decisions/                 # Architecture Decision Records
└── domain/                    # Expert knowledge and business rules
\`\`\`

## Benefits

- **Context preservation** - Important decisions don't disappear
- **Mode discipline** - Prevents mixing design and implementation
- **Tool compatibility** - Same methodology works in Claude Code, Cursor, Copilot
- **Team alignment** - Consistent workflows regardless of AI tool choice

## Key Features

### 3-Phase Grooming
Improved requirements process:
1. **Establish Purpose** - What problem? For whom? What outcome?
2. **Define Scenarios** - Specific use cases with confirmation
3. **Analyze Requirements** - Only then derive functional requirements

### Architecture Governance
- Constraints enforcement in build mode
- ADR tracking for irreversible decisions
- Architecture validation against changes

### Operational Excellence
- Git safety (prevents force-push, bulk staging)
- Deployment safety checks
- Security review integration
- Test-driven development support

This power transforms Kiro from "smart autocomplete" into a **structured development partner** that maintains institutional knowledge.
EOF

# Create methodology steering (auto-loading)
echo "kiro-power: creating steering files..."
cat > "$DIST_DIR/steering/pai-orbit-methodology.md" << 'EOF'
---
name: pai-orbit-methodology
description: pai-orbit structured development methodology and mode discipline
inclusion: auto
---

# pai-orbit Methodology (Power Active)

You are working with the pai-orbit Power active in Kiro. This methodology enforces mode discipline where each activity has its own headspace with defined inputs, outputs, and documentation.

## Core Principles

**Mode Discipline**: Each mode has a specific purpose and output destination. Switch modes explicitly when the work type changes.

**Local-First Documentation**: All modes write markdown files locally. Nothing important lives only in conversations.

**Producer/Consumer Contract**: Every mode declares what it reads and writes to prevent context loss.

## Available Modes (Use with #skill-name)

EOF
printf '%s' "$modes_list" >> "$DIST_DIR/steering/pai-orbit-methodology.md"
cat >> "$DIST_DIR/steering/pai-orbit-methodology.md" << 'EOF'

## Available Skills (Use with #skill-name)

EOF
printf '%s' "$skills_list" >> "$DIST_DIR/steering/pai-orbit-methodology.md"
cat >> "$DIST_DIR/steering/pai-orbit-methodology.md" << 'EOF'

## Proactive Mode Suggestions

When you detect work that fits a specific mode, proactively suggest or activate the appropriate mode:

- Starting a new feature → **#groom-mode**
- Technical decisions needed → **#design-mode**
- Ready to implement → **#build-mode**
- Code ready for review → **#review-mode**
- Deployment needed → **#release-mode**

## Documentation Structure

All modes write to standardized locations:
- `docs/features/*/requirements.md` (from groom-mode)
- `docs/features/*/design.md` (from design-mode)  
- `docs/architecture/` (from arch-mode)
- `docs/decisions/` (ADRs from design/arch modes)
- `docs/domain/` (from domain-mode)

This maintains context and produces versioned documentation alongside code.
EOF

# Create usage guide steering  
cat > "$DIST_DIR/steering/pai-orbit-usage-guide.md" << 'EOF'
---
name: pai-orbit-usage-guide
description: Quick reference for pai-orbit Power usage in Kiro
inclusion: manual
---

# pai-orbit Power Usage Guide

## Quick Start

1. **For new features**: `#groom-mode`
   - 3-phase approach: Purpose → Scenarios → Requirements
   - Generates `docs/features/*/requirements.md`

2. **For technical decisions**: `#design-mode`
   - Evaluates options and trade-offs
   - Generates `docs/features/*/design.md` + ADRs

3. **For implementation**: `#build-mode`  
   - Reads all relevant docs first
   - Writes code + updates documentation

4. **For deployment**: `#release-mode`
   - Safety checks and guided deployment
   - Health verification

## Mode Flow Example

```
User: "I need to add user authentication"

Kiro: I'll help you start with proper requirements.

#groom-mode

Phase 1: Establish Purpose
- What specific authentication problem are we solving?
- Who are the target users?
- What's the expected outcome?

[Follows 3-phase structured approach...]
```

## Available Commands

### Modes (Major Workflows)

EOF
printf '%s' "$modes_list" >> "$DIST_DIR/steering/pai-orbit-usage-guide.md"
cat >> "$DIST_DIR/steering/pai-orbit-usage-guide.md" << 'EOF'

### Skills (Operational)

EOF
printf '%s' "$skills_list" >> "$DIST_DIR/steering/pai-orbit-usage-guide.md"
cat >> "$DIST_DIR/steering/pai-orbit-usage-guide.md" << 'EOF'

### Steering (Reference)
- `#pai-orbit-methodology` - Core methodology
- `#pai-orbit-usage-guide` - This guide

The power automatically guides toward structured workflows and appropriate mode switching.
EOF

# Create README for the power
cat > "$DIST_DIR/README.md" << EOF
# pai-orbit Kiro Power

This directory contains the pai-orbit power for Kiro, providing structured development methodology through skills and steering files.

## What's Included

- **POWER.md** - Main power documentation and overview
- **skills/** - All pai-orbit modes and operational skills as Kiro skills
- **steering/** - Auto-loading methodology guidance

## Installation via Kiro Powers

This power can be installed through Kiro's power system:

\`\`\`bash
# Add power (exact command depends on Kiro's power system)
# The power would be hosted and installable via GitHub URL
\`\`\`

## Manual Installation

If installing manually:

\`\`\`bash
cp -r skills/ ~/.kiro/skills/
cp -r steering/ ~/.kiro/steering/
\`\`\`

## Features

- **${total_generated} Skills**: All modes (\`groom-mode\`, \`build-mode\`, etc.) + operational skills (\`git-skill\`, \`analysis-skill\`, etc.)
- **Auto-loading methodology**: Steering files provide guidance and suggest mode switches
- **Structured documentation**: Consistent \`docs/\` output across all AI tools
- **3-phase grooming**: Improved requirements process (Purpose → Scenarios → Requirements)

## Usage

After installation, skills are activated with \`#skill-name\`:

- \`#groom-mode\` - Start feature requirements
- \`#build-mode\` - Implementation session
- \`#design-mode\` - Technical decisions
- \`#release-mode\` - Safe deployment
- \`#review-mode\` - Code review (ask for the security-focused pass within it)

The methodology steering automatically guides conversations toward appropriate workflows.
EOF

echo "kiro-power: built $DIST_DIR"
echo "kiro-power: generated $(find "$DIST_DIR/skills" -name "*.md" | wc -l) skills, $(find "$DIST_DIR/steering" -name "*.md" | wc -l) steering files, and POWER.md"
