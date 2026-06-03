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

## What You Get

pai-orbit brings structured development methodology to Kiro:

- **Mode discipline** - Each activity has its own headspace and documentation output
- **3-phase grooming** - Purpose → Scenarios → Requirements for better feature definition
- **Producer/consumer contracts** - Clear inputs and outputs prevent context loss
- **Local-first docs** - Everything important gets written to versioned markdown files

## Tool Compatibility

This is the same methodology that works with:
- Claude Code (full fidelity plugin)
- Cursor (plugin and rules) 
- GitHub Copilot (instructions)
- **Kiro** (skills and steering) ← You are here

Your team can use different tools while maintaining the same structured workflow.