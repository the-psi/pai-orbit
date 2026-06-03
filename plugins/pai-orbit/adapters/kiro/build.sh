#!/usr/bin/env bash
# Kiro adapter — converts pai-orbit modes and skills to Kiro format
# Outputs: skills/ (for modes and operational skills) + steering/ (for methodology)
set -euo pipefail

ADAPTER_DIR="$(cd "$(dirname "$0")" && pwd)"
PLUGIN_DIR="$(cd "$ADAPTER_DIR/../.." && pwd)"

CORE_DIR="${CORE_DIR:-$PLUGIN_DIR/core}"
DIST_DIR="${DIST_DIR:-$PLUGIN_DIR/dist/kiro}"

if [ ! -d "$CORE_DIR" ]; then
  echo "kiro adapter: CORE_DIR not found: $CORE_DIR" >&2
  exit 1
fi

rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR/skills"
mkdir -p "$DIST_DIR/steering"

# Convert modes to Kiro skills
echo "kiro: converting modes to skills..."
for mode_file in "$CORE_DIR/modes"/*.md; do
  if [ -f "$mode_file" ]; then
    mode_name="$(basename "$mode_file" .md)"
    echo "kiro: processing mode $mode_name"
    
    # Create skill file with Kiro-specific front matter
    cat > "$DIST_DIR/skills/${mode_name}-mode.md" << EOF
---
name: ${mode_name}-mode
description: pai-orbit ${mode_name} mode - $(grep -m1 "^This is" "$mode_file" | sed 's/This is //' | sed 's/\.//' || echo "structured development mode")
inclusion: manual
---

# pai-orbit ${mode_name^^} Mode

$(cat "$mode_file")

## Usage in Kiro
Activate this mode by using \`#${mode_name}-mode\` in your conversation or by typing "enter ${mode_name} mode".

The mode will guide you through the structured workflow and generate the appropriate documentation files.
EOF
  fi
done

# Convert core skills to Kiro skills
echo "kiro: converting skills..."
for skill_dir in "$CORE_DIR/skills"/*/; do
  if [ -d "$skill_dir" ] && [ -f "$skill_dir/SKILL.md" ]; then
    skill_name="$(basename "$skill_dir")"
    echo "kiro: processing skill $skill_name"
    
    # Extract description from skill file
    description="$(grep -m1 "^# " "$skill_dir/SKILL.md" | sed 's/^# //' || echo "pai-orbit operational skill")"
    
    cat > "$DIST_DIR/skills/${skill_name}-skill.md" << EOF
---
name: ${skill_name}-skill  
description: pai-orbit ${skill_name} skill - ${description}
inclusion: manual
---

# pai-orbit ${skill_name} Skill

$(cat "$skill_dir/SKILL.md")

## Usage in Kiro
Activate this skill by using \`#${skill_name}-skill\` in your conversation or by requesting "${skill_name}" operations.
EOF
  fi
done

# Create methodology steering file
echo "kiro: creating methodology steering..."
cat > "$DIST_DIR/steering/pai-orbit-methodology.md" << 'EOF'
---
name: pai-orbit-methodology
description: pai-orbit structured development methodology and mode discipline
inclusion: auto
---

# pai-orbit Methodology

You are working in a pai-orbit structured development environment. This methodology enforces mode discipline where each activity has its own headspace with defined inputs, outputs, and documentation.

## Core Principles

**Mode Discipline**: Each mode has a specific purpose and output destination. Switch modes explicitly when the work type changes.

**Local-First Documentation**: All modes write markdown files locally. Nothing important lives only in conversations.

**Producer/Consumer Contract**: Every mode declares what it reads and writes to prevent context loss.

## Available Modes

- **groom-mode**: Feature requirements with 3-phase approach (Purpose → Scenarios → Requirements)
- **design-mode**: Technical trade-offs and architecture decisions  
- **build-mode**: Implementation session - writing code, fixing bugs, shipping
- **arch-mode**: System-wide architecture declarations and constraints
- **plan-mode**: Roadmap and prioritization decisions
- **domain-mode**: Domain knowledge capture and expert insights
- **ux-mode**: User experience and flow design
- **data-mode**: Data exploration and analysis

## Available Skills

- **git-skill**: Git operations following project branching model
- **board-skill**: Task management operations (GitHub Issues, Linear, Jira)  
- **deploy-skill**: Guided deployment with safety checks
- **review-skill**: Structured code review against architecture and requirements
- **security-review-skill**: OWASP-based security analysis
- **test-skill**: Test planning and execution
- **analysis-skill**: Change impact and dependency analysis
- **simplify-skill**: Code simplification and cleanup
- **epic-skill**: Epic lifecycle management
- **setup-skill**: First-time project configuration

## Mode Flow

1. Start with **groom-mode** for new features (establishes purpose and scenarios)
2. Use **design-mode** for technical decisions (reads requirements, produces design)  
3. Use **build-mode** for implementation (reads all docs, produces code)
4. Use **review-skill** before merging
5. Use **deploy-skill** for safe releases

## Documentation Structure

All modes write to standardized locations:
- `docs/features/*/requirements.md` (from groom-mode)
- `docs/features/*/design.md` (from design-mode)  
- `docs/architecture/` (from arch-mode)
- `docs/decisions/` (ADRs from design/arch modes)
- `docs/domain/` (from domain-mode)

## Usage

When the user mentions work that fits a specific mode, proactively suggest or activate the appropriate mode skill. This maintains the structured workflow and ensures proper documentation.
EOF

# Create mode switching steering
cat > "$DIST_DIR/steering/mode-switching-guide.md" << 'EOF'
---
name: mode-switching-guide
description: Guidance on when and how to switch between pai-orbit modes
inclusion: auto
---

# pai-orbit Mode Switching Guide

## When to Switch Modes

**Switch TO groom-mode when**:
- Starting work on a new feature
- Requirements are unclear or disputed
- Acceptance criteria need definition

**Switch TO design-mode when**:
- Technical approach needs deciding
- Architecture decisions are required  
- Trade-offs need evaluation

**Switch TO build-mode when**:
- Requirements and design are clear
- Implementation work needs to happen
- Bugs need fixing

**Switch TO review-mode when**:
- Code is ready for review
- Architecture compliance check needed
- Before merging changes

## Mode Discipline

- **Never mix headspaces**: Don't do design work in build-mode or implementation in design-mode
- **Switch explicitly**: When conversation drifts from the current mode's purpose, switch modes
- **Complete the cycle**: Ensure each mode produces its expected documentation before switching
- **Read before write**: Each mode should read relevant docs from previous modes

## Switching Signals

Watch for these conversation patterns that indicate mode switching is needed:

- "How should we implement this?" → **design-mode**  
- "What exactly should this feature do?" → **groom-mode**
- "Let's start coding" → **build-mode**
- "Is this ready to merge?" → **review-mode**
- "How should we deploy this?" → **deploy-skill**

Always suggest the appropriate mode when you detect these patterns.
EOF

# Create setup instructions
cat > "$DIST_DIR/README.md" << 'EOF'
# pai-orbit for Kiro

This distribution contains pai-orbit modes and skills adapted for Kiro.

## Installation

1. Copy the contents of this directory to your Kiro workspace:
   ```bash
   cp -r skills/ .kiro/skills/
   cp -r steering/ .kiro/steering/
   ```

2. Restart Kiro or reload skills:
   ```bash
   # In Kiro, the steering files will auto-load
   # Skills can be activated manually with #skill-name
   ```

## Usage

### Modes (Major workflows)
- `#groom-mode` - Feature requirements (3-phase: Purpose → Scenarios → Requirements)
- `#design-mode` - Technical decisions and trade-offs
- `#build-mode` - Implementation and coding
- `#arch-mode` - Architecture declarations  
- `#plan-mode` - Prioritization and roadmapping

### Skills (Operational procedures)  
- `#git-skill` - Git operations
- `#deploy-skill` - Deployment procedures
- `#review-skill` - Code review process
- `#test-skill` - Testing workflows

### Automatic Guidance
The methodology steering files will automatically guide the conversation toward structured workflows and appropriate mode switching.

## First Run

After installation, try:
1. `#setup-skill` - Configure pai-orbit for your project
2. `#groom-mode` - Start defining a feature with the structured approach

The system will maintain context and produce documentation in the standard `docs/` structure.
EOF

echo "kiro: built $DIST_DIR"
echo "kiro: generated $(find "$DIST_DIR/skills" -name "*.md" | wc -l) skills and $(find "$DIST_DIR/steering" -name "*.md" | wc -l) steering files"