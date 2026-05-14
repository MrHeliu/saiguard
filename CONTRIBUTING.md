# Contributing to S-AI-Guard

Thank you for your interest! Here's how to contribute.

## Reporting Issues

- **Bug reports** — Open an issue with: OS, Node.js version, sai command you ran, full error output
- **Feature requests** — Open an issue with: use case, why existing commands don't cover it, proposed solution
- **Questions** — Open a discussion or issue, both are fine

## Submitting Changes

1. Fork the repo
2. Create a branch: `git checkout -b feat/your-feature`
3. Make changes — only modify files under `runtime/` or `.agents/`
4. Test your changes: `node runtime/sai.js init` then try the relevant commands
5. Commit with a clear message
6. Open a PR

## Design Principles

Keep these in mind when contributing:

- **No project-specific hardcoding** — Everything project-specific must go through `config.json`
- **Mechanical verification only** — Gatecheck relies on exit codes, never on LLM-generated strings
- **Single source of truth** — All state in `runtime/`, all changes through `sai.js` commands
- **Lightweight** — sai.js should stay under 500 lines. Prefer config over code

## Code Style

- Plain Node.js (no TypeScript, no bundler)
- `const` over `let`, no `var`
- No external dependencies
- Functions grouped by command name in the `commands` object

## Testing Your Changes

```bash
# In a temp directory
mkdir /tmp/test-saiguard && cd /tmp/test-saiguard
cp -r /path/to/saiguard/runtime .
cp -r /path/to/saiguard/.agents .

# Init and verify
node runtime/sai.js init
node runtime/sai.js status
node runtime/sai.js check

# Clean up
rm -rf /tmp/test-saiguard
```

Thank you for helping improve S-AI-Guard!
