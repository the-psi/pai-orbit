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