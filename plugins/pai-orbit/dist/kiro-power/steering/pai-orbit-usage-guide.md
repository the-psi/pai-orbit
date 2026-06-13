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

4. **For deployment**: `#deploy-skill`
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
- `#groom-mode` - 3-phase feature requirements
- `#design-mode` - Technical decisions  
- `#build-mode` - Implementation
- `#arch-mode` - Architecture declarations
- `#plan-mode` - Prioritization

### Skills (Operational)
- `#git-skill` - Git operations
- `#deploy-skill` - Deployment
- `#review-skill` - Code review  
- `#test-skill` - Testing workflows
- `#setup-skill` - Project setup

### Steering (Reference)
- `#pai-orbit-methodology` - Core methodology
- `#pai-orbit-usage-guide` - This guide

The power automatically guides toward structured workflows and appropriate mode switching.
