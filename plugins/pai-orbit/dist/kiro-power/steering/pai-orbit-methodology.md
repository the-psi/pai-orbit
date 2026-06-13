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

- **#groom-mode**: Feature requirements with 3-phase approach (Purpose → Scenarios → Requirements)
- **#design-mode**: Technical trade-offs and architecture decisions  
- **#build-mode**: Implementation session - writing code, fixing bugs, shipping
- **#arch-mode**: System-wide architecture declarations and constraints
- **#plan-mode**: Roadmap and prioritization decisions
- **#domain-mode**: Domain knowledge capture and expert insights
- **#ux-mode**: User experience and flow design
- **#data-mode**: Data exploration and analysis

## Available Skills (Use with #skill-name)

- **#git-skill**: Git operations following project branching model
- **#board-skill**: Task management operations (GitHub Issues, Linear, Jira)  
- **#deploy-skill**: Guided deployment with safety checks
- **#review-skill**: Structured code review against architecture and requirements
- **#security-review-skill**: OWASP-based security analysis
- **#test-skill**: Test planning and execution
- **#analysis-skill**: Change impact and dependency analysis
- **#simplify-skill**: Code simplification and cleanup
- **#epic-skill**: Epic lifecycle management
- **#setup-skill**: First-time project configuration

## Proactive Mode Suggestions

When you detect work that fits a specific mode, proactively suggest or activate the appropriate mode:

- Starting a new feature → **#groom-mode**
- Technical decisions needed → **#design-mode**  
- Ready to implement → **#build-mode**
- Code ready for review → **#review-skill**
- Deployment needed → **#deploy-skill**

## Documentation Structure

All modes write to standardized locations:
- `docs/features/*/requirements.md` (from groom-mode)
- `docs/features/*/design.md` (from design-mode)  
- `docs/architecture/` (from arch-mode)
- `docs/decisions/` (ADRs from design/arch modes)
- `docs/domain/` (from domain-mode)

This maintains context and produces versioned documentation alongside code.
