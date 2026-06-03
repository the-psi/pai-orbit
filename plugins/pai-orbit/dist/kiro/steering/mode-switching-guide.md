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

**Switch TO review-skill when**:
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
- "Is this ready to merge?" → **review-skill**
- "How should we deploy this?" → **deploy-skill**

Always suggest the appropriate mode when you detect these patterns.