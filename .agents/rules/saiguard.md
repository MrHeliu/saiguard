---
trigger: always_on
---

1. Run `sai status` at the start of every session to confirm current task state
2. All code changes must have a corresponding task. Run `sai start <id>` before making changes — never skip to coding
3. State changes only through sai start / sai finish / sai fail. Never manually edit JSON files under runtime/
4. sai finish runs mechanical verification. If verification fails, the task stays doing. Fix and re-finish. Never manually mark done
5. Only one task can be doing at a time. Confirm no other doing task before starting a new one
6. Tasks with unmet dependsOn cannot be started
7. Do not modify code outside your assigned agent role directory
8. If environment issues prevent finish, use `sai fail <id> <reason>` to record it. Never silently skip
9. Bug fixes are tasks too: `sai fail` the current task, fix it, then `sai start` again
10. After code changes, run `sai finish <id>` and wait for the result. Do not claim "fixed" until gatecheck passes
11. sai.js is config-driven. All project settings (paths, strategies, state machine, tech stacks) live in runtime/config.json. Never hardcode project-specific values — use CONFIG.xxx
12. If a doing task exists at session start, run `sai resume` to get context. Do not re-start it
