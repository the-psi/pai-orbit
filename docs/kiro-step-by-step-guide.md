# pai-orbit with Kiro: Complete Step-by-Step Guide

This guide walks you through setting up and using pai-orbit methodology in any project with Kiro.

## Prerequisites

- Kiro installed and working in your project
- Basic understanding of your project structure
- Git repository initialized

---

## Step 1: Install pai-orbit Power

### Method A: Via Kiro Powers (Recommended)

1. **Open Kiro Powers configuration**:
   ```bash
   # In your project directory, invoke Kiro's power system
   kiroPowers configure
   ```

2. **Add pai-orbit power**:
   - In the powers UI, add this GitHub URL: `https://github.com/the-psi/pai-orbit`
   - Or if command-line install is available:
     ```bash
     kiro power install https://github.com/the-psi/pai-orbit
     ```

3. **Verify installation**:
   - The power should appear in your powers list
   - Auto-loading steering will activate methodology guidance

### Method B: Manual Installation (If Powers Don't Work)

1. **Download and copy files**:
   ```bash
   # Clone or download pai-orbit repo
   git clone https://github.com/the-psi/pai-orbit
   
   # Copy to your Kiro directory
   cp -r pai-orbit/plugins/pai-orbit/dist/kiro/skills/ .kiro/skills/
   cp -r pai-orbit/plugins/pai-orbit/dist/kiro/steering/ .kiro/steering/
   ```

---

## Step 2: First Setup

1. **Start Kiro in your project**:
   ```bash
   # Open Kiro in your project directory
   kiro
   ```

2. **Run initial setup**:
   ```
   #setup-skill
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

## Step 3: Your First Feature with pai-orbit

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
   #review-skill
   ```
   - Structured review against requirements and architecture
   - Creates review documentation

2. **Deploy safely**:
   ```
   #deploy-skill
   ```
   - Pre-flight safety checks
   - Guided deployment process
   - Post-deploy verification

---

## Step 4: Ongoing Usage Patterns

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

#review-skill

Reading your authentication design docs and architectural constraints...
```

---

## Step 5: Understanding the Documentation Structure

pai-orbit creates a standard documentation structure:

```
your-project/
├── docs/
│   ├── features/               # Feature-specific docs
│   │   └── password-reset/
│   │       ├── requirements.md # From #groom-mode  
│   │       ├── design.md       # From #design-mode
│   │       └── test-plan.md    # From #test-skill
│   ├── architecture/           # System-level docs
│   │   ├── system.md          # From #arch-mode
│   │   ├── constraints.md     # Enforcement rules
│   │   └── stack.md           # Technology choices
│   ├── decisions/             # Architecture Decision Records
│   │   └── 2024-01-15-session-storage.md
│   ├── domain/                # Business knowledge
│   │   └── user-auth-rules.md
│   └── plans/                 # Planning docs
│       └── q1-2024-roadmap.md
├── .kiro/
│   ├── skills/                # pai-orbit skills (installed)
│   └── steering/              # Auto-loading guidance (installed)
└── [your code files]
```

---

## Step 6: Advanced Workflows

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
#security-review-skill

# OWASP-based security analysis
```

---

## Step 7: Team Collaboration

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

#review-skill

# Creates comprehensive handoff with:
# - Current status
# - What's been done
# - What's remaining  
# - Key decisions made
# - Next steps
```

---

## Step 8: Troubleshooting

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

## Step 9: Tips for Success

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

## Step 10: Getting Help

### Available Guidance

```
#pai-orbit-methodology    # Core methodology overview
#pai-orbit-usage-guide   # Quick reference commands
```

### Command Reference

**Modes (Major workflows):**
- `#groom-mode` - Feature requirements (3-phase)
- `#design-mode` - Technical decisions
- `#build-mode` - Implementation  
- `#arch-mode` - Architecture
- `#plan-mode` - Prioritization

**Skills (Operations):**
- `#git-skill` - Git operations
- `#deploy-skill` - Deployment
- `#review-skill` - Code review
- `#test-skill` - Testing
- `#setup-skill` - Project setup

---

## Success Metrics

You'll know pai-orbit is working when:

✅ **Nothing important lives only in chat** - Everything gets written to files  
✅ **Context doesn't get lost** - New team members can read the docs and understand decisions  
✅ **Mode discipline is maintained** - Design stays in design mode, implementation in build mode  
✅ **Architecture constraints are followed** - The system enforces consistency  
✅ **Requirements are complete** - The 3-phase grooming catches gaps early

Welcome to structured development with pai-orbit and Kiro!