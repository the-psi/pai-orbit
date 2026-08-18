# pai-orbit for Kiro (Beta) - Installation & Usage Guide

pai-orbit brings structured development methodology to Kiro through powers, skills, and steering files. This guide covers installation and complete usage workflows.

## Prerequisites

- Kiro installed and working in your project
- Basic understanding of your project structure
- Git repository initialized

## Installation

### Kiro Power (Automatic Installation)

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

### Verify Installation

The steering files will auto-load and provide methodology guidance. Skills are available for manual activation:

```
Available modes: groom-mode, design-mode, build-mode, arch-mode, plan-mode, ux-mode, data-mode,
  domain-mode, test-mode, review-mode, setup-mode, incident-mode, release-mode, suggest-skills-mode
Available operational skills: git-skill, analysis-skill, epic-skill, board-skill,
  data-model-skill, simplify-skill
```

---

## Initial Project Setup

### First-Time Configuration

1. **Start Kiro in your project**:
   ```bash
   # Open Kiro in your project directory
   kiro
   ```

2. **Run initial setup**:
   ```
   #setup-mode
   ```
   
   This will:
   - Discover your project structure and tech stack
   - Ask about your task board (GitHub Issues, Linear, Jira)
   - Set up branching model (GitHub Flow, GitFlow, etc.)
   - Create basic configuration files
   - Generate documentation scaffold

3. **Answer setup questions**:
   - **Project type**: Single repo or monorepo?
   - **Task management**: What board system do you use?
   - **Git workflow**: What branching model?
   - **Deployment**: Where do you deploy?
   - **Team**: Who are your team members?

---

## Usage

### Activating Modes

Use the `#skill-name` syntax to activate specific modes:

- `#groom-mode` - Feature requirements with 3-phase approach
- `#design-mode` - Technical decisions and architecture  
- `#build-mode` - Implementation session
- `#arch-mode` - System architecture declarations
- `#plan-mode` - Roadmap and prioritization decisions
- `#domain-mode` - Domain knowledge capture
- `#ux-mode` - User experience design
- `#data-mode` - Data exploration and analysis
- `#test-mode` - Test planning and execution
- `#review-mode` - Structured code review (ask for a security-focused pass within this mode for the OWASP checklist)
- `#setup-mode` - Project configuration
- `#incident-mode` - Production incident fast-path
- `#release-mode` - Guided deployment with safety checks
- `#suggest-skills-mode` - Discover recurring patterns worth encoding as project skills

### Activating Skills

Operational skills for specific procedures:

- `#git-skill` - Git operations following project conventions
- `#analysis-skill` - Change impact analysis
- `#epic-skill` - Epic lifecycle management
- `#board-skill` - Task management operations
- `#data-model-skill` - Schema reference and migration management
- `#simplify-skill` - Code simplification and cleanup

### Automatic Guidance

The methodology steering files (`pai-orbit-methodology.md`, `mode-switching-guide.md`) auto-load and will:

- Guide conversation toward appropriate modes
- Suggest mode switches when detecting workflow changes
- Enforce mode discipline and documentation practices
- Provide context about the pai-orbit structured approach

---

## Complete Feature Development Workflow

Let's walk through adding a complete feature using pai-orbit methodology.

### Phase 1: Requirements (Groom Mode)

1. **Start with grooming**:
   ```
   #groom-mode
   ```

2. **Follow the 3-phase approach**:
   
   **Phase 1: Establish Purpose**
   - Kiro will ask: "What problem does this feature solve?"
   - Example: "Users can't reset their passwords when they forget them"
   - Kiro will ask: "Who is this for?"
   - Example: "Existing users who have forgotten their passwords"
   - Kiro will ask: "What outcome should they achieve?"
   - Example: "Successfully reset password and regain account access"

   **Phase 2: Define Scenarios**
   - Kiro will list specific use cases:
     - "When user clicks 'Forgot Password' on login page..."
     - "When user enters invalid email for reset..."
     - "When user clicks reset link after it expires..."
   - Confirm each scenario before proceeding

   **Phase 3: Analyze Requirements**
   - Only now will Kiro read existing docs and derive detailed requirements
   - Creates `docs/features/password-reset/requirements.md`

### Phase 2: Technical Design

1. **Switch to design mode**:
   ```
   #design-mode
   ```

2. **Kiro will**:
   - Read the requirements from groom mode
   - Present 2-3 technical approaches with trade-offs
   - Flag any architectural constraints
   - Create `docs/features/password-reset/design.md`
   - May create ADRs in `docs/decisions/`

### Phase 3: Implementation

1. **Switch to build mode**:
   ```
   #build-mode
   ```

2. **Kiro will**:
   - Read all relevant documentation
   - Check your task board status
   - Start implementing according to the design
   - Update documentation as it codes
   - Follow architectural constraints

### Phase 4: Review and Deploy

1. **Code review**:
   ```
   #review-mode
   ```
   - Structured review against requirements and architecture
   - Creates review documentation

2. **Deploy safely**:
   ```
   #release-mode
   ```
   - Pre-flight safety checks
   - Guided deployment process
   - Post-deploy verification

---

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

---

## Ongoing Usage Patterns

### Starting Work on Existing Issues

```
User: "I need to work on issue #123 about user authentication"

Kiro: I'll help you approach this systematically. Let me check if this needs requirements clarification first.

#groom-mode

Looking at issue #123, I need to establish the purpose clearly...
```

### Technical Questions During Development

```
User: "How should we store the user sessions?"

Kiro: This is a technical design decision. Let me switch to design mode.

#design-mode

For session storage, I see three main approaches:
1. Database sessions (persistent, scalable)
2. Memory sessions (fast, simple) 
3. JWT tokens (stateless, distributed)

Let me analyze the trade-offs...
```

### Code Review Before Merging

```
User: "Can you review my authentication changes before I merge?"

Kiro: I'll do a structured code review against your architecture and requirements.

#review-mode

Reading your authentication design docs and architectural constraints...
```

---

## What Gets Created

pai-orbit maintains the same documentation structure regardless of tool:

```
docs/
├── features/
│   └── user-auth/
│       ├── requirements.md    # from #groom-mode
│       ├── design.md          # from #design-mode  
│       └── test-plan.md       # from #test-mode
├── architecture/
│   ├── system.md              # from #arch-mode
│   └── constraints.md         # Enforcement rules
├── decisions/                 # ADRs from design/arch modes
│   └── YYYY-MM-DD-auth-approach.md
└── domain/                    # Expert knowledge
    └── user-auth-rules.md
```

---

## Advanced Workflows

### Architecture Declaration

```
#arch-mode

# For system-wide architecture decisions
```

### Data Analysis

```
#data-mode

# For exploring databases, analyzing usage patterns
```

### Epic Management

```
#epic-skill

# Create and manage multi-feature epics
```

### Security Review

```
#review-mode

# Ask for the security-focused pass (OWASP checklist) within review-mode
```

---

## Team Collaboration

### Consistent Methodology

Every team member using pai-orbit (whether in Kiro, Claude Code, or Cursor) will:
- Follow the same 3-phase grooming process
- Create identical documentation structures  
- Maintain the same mode discipline
- Generate compatible outputs

### Handoffs

```
User: "I need to hand this feature off to Sarah"

Kiro: Let me create a proper handoff document with all the context.

#review-mode

# Creates comprehensive handoff with:
# - Current status and next steps
# - Key decisions made
# - Remaining work
```

---

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

---

## Troubleshooting

### If Skills Don't Activate

1. **Check installation**:
   ```bash
   ls .kiro/skills/
   # Should show: groom-mode.md, build-mode.md, etc.
   ```

2. **Restart Kiro** or reload skills

3. **Try manual activation**:
   ```
   Please enter groom mode and help me define requirements
   ```

### If Methodology Isn't Auto-Loading

1. **Check steering files**:
   ```bash
   ls .kiro/steering/  
   # Should show: pai-orbit-methodology.md, mode-switching-guide.md
   ```

2. **Manual activation**:
   ```
   #pai-orbit-methodology
   ```

---

## Tips for Success

### 1. Always Start with Groom Mode
```
#groom-mode
```
Don't jump straight to coding. Establish purpose and scenarios first.

### 2. Respect Mode Boundaries
- Don't do design work in build mode
- Don't implement in design mode
- Switch explicitly when the conversation drifts

### 3. Trust the Process
Let pai-orbit guide you through the phases. The methodology prevents common pitfalls:
- Half-specified features
- Lost context
- Architecture drift
- Missing documentation

### 4. Use the Documentation
The generated docs aren't just artifacts - they're working documents that inform future decisions.

---

## Command Reference

### Available Guidance

```
#pai-orbit-methodology    # Core methodology overview
#pai-orbit-usage-guide   # Quick reference commands
```

### Modes (Major Workflows)
- `#groom-mode` - Feature requirements (3-phase)
- `#design-mode` - Technical decisions
- `#build-mode` - Implementation  
- `#arch-mode` - Architecture
- `#plan-mode` - Prioritization
- `#domain-mode` - Domain knowledge capture
- `#ux-mode` - User experience design
- `#data-mode` - Data exploration and analysis
- `#test-mode` - Testing
- `#review-mode` - Code review (including the security-focused pass)
- `#setup-mode` - Project setup
- `#incident-mode` - Production incident fast-path
- `#release-mode` - Deployment
- `#suggest-skills-mode` - Discover recurring patterns worth encoding as skills

### Skills (Operations)
- `#git-skill` - Git operations
- `#analysis-skill` - Change impact analysis
- `#epic-skill` - Epic lifecycle management
- `#board-skill` - Task management operations
- `#data-model-skill` - Schema reference and migration management
- `#simplify-skill` - Code simplification and cleanup

---

## Success Metrics

You'll know pai-orbit is working when:

✅ **Nothing important lives only in chat** - Everything gets written to files  
✅ **Context doesn't get lost** - New team members can read the docs and understand decisions  
✅ **Mode discipline is maintained** - Design stays in design mode, implementation in build mode  
✅ **Architecture constraints are followed** - The system enforces consistency  
✅ **Requirements are complete** - The 3-phase grooming catches gaps early

Welcome to structured development with pai-orbit and Kiro!
