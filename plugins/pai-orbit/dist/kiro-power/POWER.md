# pai-orbit Power

**Structured Development Methodology for Kiro**

pai-orbit brings disciplined, mode-driven development workflows to Kiro, ensuring nothing important lives only in conversations.

## What This Power Provides

### Modes (Major Workflows)
- **groom-mode** - Feature requirements with 3-phase approach (Purpose → Scenarios → Requirements)
- **design-mode** - Technical decisions and architecture trade-offs
- **build-mode** - Implementation sessions with documentation updates
- **arch-mode** - System architecture declarations and constraints
- **plan-mode** - Roadmap prioritization and sequencing

### Skills (Operational Procedures)  
- **git-skill** - Git operations following project conventions
- **deploy-skill** - Guided deployment with safety checks
- **review-skill** - Structured code review against architecture
- **test-skill** - Test planning and execution workflows
- **analysis-skill** - Change impact and dependency analysis

### Methodology (Auto-Loading)
- **Mode discipline** - Each activity has its own headspace and outputs
- **Producer/consumer contracts** - Clear inputs/outputs prevent context loss
- **Local-first documentation** - Everything gets written to versioned markdown
- **Architecture governance** - Constraints and decisions are enforced

## Installation

This power installs automatically when you activate it. It includes:

1. **Skills** - All modes and operational procedures as Kiro skills
2. **Steering** - Methodology guidance that auto-loads and suggests mode switches
3. **Documentation** - Creates standard `docs/` structure for your project

## Usage

After activation, use skills with the `#skill-name` syntax:

```
#groom-mode     # Start feature requirements (3-phase approach)
#design-mode    # Make technical decisions  
#build-mode     # Implement features
#deploy-skill   # Deploy safely
#review-skill   # Code review process
```

The methodology steering auto-guides conversations toward structured workflows.

## What Gets Created

pai-orbit maintains consistent documentation across all tools:

```
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
```

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