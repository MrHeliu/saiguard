const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ==========================================
// Bootstrap
// ==========================================
const BASE_DIR = path.resolve(__dirname, '..');
const RUNTIME_DIR = path.resolve(__dirname);
const CONFIG_FILE = path.join(RUNTIME_DIR, 'config.json');
const TEMPLATE_FILE = path.join(RUNTIME_DIR, 'config.template.json');

const [,, cmd, ...args] = process.argv;
const normalizedCmd = cmd ? cmd.replace(/-/g, '_') : null;

// init works without config.json — early exit
if (normalizedCmd === 'init') {
  if (!fs.existsSync(CONFIG_FILE)) {
    if (fs.existsSync(TEMPLATE_FILE)) {
      fs.copyFileSync(TEMPLATE_FILE, CONFIG_FILE);
      console.log('[OK] config.json created from template.');
    } else {
      console.error('[ERROR] config.template.json not found.');
      process.exit(1);
    }
  } else {
    console.log('[SKIP] config.json already exists.');
  }

  const CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
  const plansDir = path.join(RUNTIME_DIR, 'plans');
  const files = {
    tasks: path.join(RUNTIME_DIR, 'tasks.json'),
    events: path.join(RUNTIME_DIR, 'events.json'),
    failures: path.join(RUNTIME_DIR, 'failures.json'),
    summary: path.join(RUNTIME_DIR, 'summary.json'),
    project: path.join(RUNTIME_DIR, 'project.json')
  };

  const initData = {
    tasks: [],
    events: [],
    failures: [],
    summary: {
      project: CONFIG.project.name,
      phase: CONFIG.project.phase,
      last_update: new Date().toISOString(),
      overall_status: 'initialized',
      milestones: {},
      failures: 0,
      next_step: 'Add tasks to tasks.json and start working.'
    },
    project: { name: CONFIG.project.name, agents: {} }
  };

  Object.entries(CONFIG.agents).forEach(([id, conf]) => {
    initData.project.agents[id] = { type: conf.type, status: 'idle' };
  });

  const keyToData = { tasks: initData.tasks, events: initData.events, failures: initData.failures, summary: initData.summary, project: initData.project };
  Object.entries(files).forEach(([key, filePath]) => {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(keyToData[key], null, 2));
      console.log(`[OK] Created ${path.basename(filePath)}`);
    } else {
      console.log(`[SKIP] ${path.basename(filePath)} already exists`);
    }
  });

  if (!fs.existsSync(plansDir)) fs.mkdirSync(plansDir, { recursive: true });
  console.log('[OK] Project initialized. Edit config.json, then run `sai status`.');
  process.exit(0);
}

// All other commands require config.json
if (!fs.existsSync(CONFIG_FILE)) {
  console.error('[ERROR] config.json not found. Run: node runtime/sai.js init');
  process.exit(1);
}

const CONFIG = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

// ==========================================
// Path Resolution
// ==========================================
const resolveCwd = (key) => {
  const dotAccess = (obj, keys) => keys.reduce((o, k) => o && o[k], obj);
  if (key === 'base') return BASE_DIR;
  if (key.startsWith('agents.')) {
    const agentPath = dotAccess(CONFIG.paths, key.split('.'));
    return agentPath ? path.join(BASE_DIR, agentPath) : BASE_DIR;
  }
  return BASE_DIR;
};

const PATHS = {
  base: BASE_DIR,
  tasks: path.join(RUNTIME_DIR, 'tasks.json'),
  project: path.join(RUNTIME_DIR, 'project.json'),
  events: path.join(RUNTIME_DIR, 'events.json'),
  summary: path.join(RUNTIME_DIR, 'summary.json'),
  plans: path.join(RUNTIME_DIR, 'plans'),
  failures: path.join(RUNTIME_DIR, 'failures.json'),
  dashboardData: path.join(BASE_DIR, ...CONFIG.paths.dashboard.split('/')),
  archive: path.join(BASE_DIR, ...CONFIG.paths.archive.split('/'))
};

// Build check strategies from config
const CHECK_STRATEGIES = {};
Object.entries(CONFIG.checkStrategies).forEach(([type, s]) => {
  const strategy = { cmd: s.cmd, msg: s.msg, outputDir: s.outputDir || null };

  if (type === 'web') {
    strategy.cwd = (taskId) => {
      const tasks = JSON.parse(fs.readFileSync(PATHS.tasks, 'utf8'));
      const task = tasks.find(t => t.id == taskId);
      if (task && s.cwdAlternates) {
        for (const alt of s.cwdAlternates) {
          if (task.title.includes(alt.keyword)) return resolveCwd(alt.path);
        }
      }
      return resolveCwd(s.cwd);
    };
  } else if (type === 'db' && s.sqlFile) {
    strategy.cmd = s.cmd.replace('{sqlFile}', s.sqlFile);
    strategy.cwd = resolveCwd(s.cwd);
  } else {
    strategy.cwd = resolveCwd(s.cwd);
  }

  CHECK_STRATEGIES[type] = strategy;
});

const VALID_FLOW = CONFIG.validFlow;
const MODULE_MAP = CONFIG.moduleMap;

// ==========================================
// Utilities
// ==========================================
const loadJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const saveJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));
const getTimestamp = () => new Date().toISOString();

const updateAgentStatus = (agentName, status) => {
  const project = loadJSON(PATHS.project);
  if (project.agents[agentName]) {
    project.agents[agentName].status = status;
    saveJSON(PATHS.project, project);
  }
};

// ==========================================
// Commands
// ==========================================
const commands = {

  status: () => {
    const tasks = loadJSON(PATHS.tasks);
    const summary = loadJSON(PATHS.summary);

    const total = tasks.length;
    const done = tasks.filter(t => t.status === 'done').length;
    const doing = tasks.filter(t => t.status === 'doing');
    const review = tasks.filter(t => t.status === 'review');
    const todo = tasks.filter(t => t.status === 'todo');

    const progress = total > 0 ? Math.round((done / total) * 100) : 0;
    const barWidth = 20;
    const filledWidth = Math.round((progress / 100) * barWidth);
    const bar = '█'.repeat(filledWidth) + '░'.repeat(barWidth - filledWidth);

    console.log(`\n==========================================`);
    console.log(`📊 Progress: [${bar}] ${progress}%`);
    console.log(`🏁 Phase: ${summary.phase || CONFIG.project.phase || 'Unknown'}`);
    console.log(`==========================================`);

    if (review.length > 0) {
      console.log(`\n⚠️  Review:`);
      review.forEach(t => console.log(`   [${t.id}] ${t.title} - ${t.assignedAgent}`));
    }

    if (doing.length > 0) {
      console.log(`\n🚀 Active:`);
      doing.forEach(t => {
        const elapsed = t.started_at
          ? Math.round((Date.now() - new Date(t.started_at).getTime()) / 60000)
          : '?';
        console.log(`   [${t.id}] ${t.title} (${t.assignedAgent}) - ${elapsed} min`);
      });
      console.log(`\n   💡 Run sai resume to continue`);
    } else {
      console.log(`\n💤 No active tasks`);
    }

    if (todo.length > 0) {
      console.log(`\n📅 Todo (Top 3):`);
      todo.slice(0, 3).forEach(t => console.log(`   [${t.id}] ${t.title} [${t.priority || 'P2'}]`));
    }
    console.log(`\n==========================================\n`);
  },

  start: (id) => {
    const tasks = loadJSON(PATHS.tasks);
    const task = tasks.find(t => t.id == id);
    if (!task) throw new Error(`Task not found: ${id}`);

    if (!VALID_FLOW[task.status].includes('doing')) {
      throw new Error(`Invalid transition: ${task.status} -> doing`);
    }

    if (task.dependsOn && task.dependsOn.length > 0) {
      const pendingDeps = task.dependsOn.filter(depId => {
        const depTask = tasks.find(t => t.id == depId);
        return !depTask || depTask.status !== 'done';
      });
      if (pendingDeps.length > 0) {
        throw new Error(`[LOCK] Cannot start task ${id}: dependencies [${pendingDeps.join(', ')}] not done.`);
      }
    }

    task.status = 'doing';
    task.started_at = getTimestamp();
    saveJSON(PATHS.tasks, tasks);
    updateAgentStatus(task.assignedAgent, 'busy');

    const planPath = path.join(PATHS.plans, `task_${id}.md`);
    if (!fs.existsSync(planPath)) {
      const template = `# Task Plan: TASK-${id} - ${task.title}\n\n## 1. Objective\n${task.description}\n\n## 2. Steps\n- [ ] Step 1: Environment check\n- [ ] Step 2: Implementation\n- [ ] Step 3: Self-test\n\n## 3. Risks\n- None\n\n## 4. Progress\n- ${getTimestamp()}: Task started`;
      fs.writeFileSync(planPath, template, 'utf8');
      console.log(`[OK] Task ${id} started. Plan created: ${planPath}`);
    } else {
      console.log(`[OK] Task ${id} resumed.`);
    }
  },

  finish: (id) => {
    const tasks = loadJSON(PATHS.tasks);
    const task = tasks.find(t => t.id == id);
    if (!task) throw new Error(`Task not found: ${id}`);

    if (!VALID_FLOW[task.status].includes('done')) {
      throw new Error(`Invalid transition: ${task.status} -> done`);
    }

    const strategy = CHECK_STRATEGIES[task.type];
    if (strategy) {
      console.log(`[GATECHECK] Running ${strategy.msg}...`);
      try {
        const actualCwd = typeof strategy.cwd === 'function' ? strategy.cwd(id) : strategy.cwd;
        execSync(strategy.cmd, { cwd: actualCwd, stdio: 'inherit' });

        if (strategy.outputDir) {
          const outputAbs = path.join(actualCwd, strategy.outputDir);
          if (!fs.existsSync(outputAbs)) {
            console.error(`[GATECHECK] Output dir missing: ${strategy.outputDir}/`);
            process.exit(1);
          }
          const files = fs.readdirSync(outputAbs);
          if (files.length === 0) {
            console.error(`[GATECHECK] Output dir empty: ${strategy.outputDir}/`);
            process.exit(1);
          }
          console.log(`[GATECHECK] Output verified (${strategy.outputDir}/: ${files.length} files)`);
        }

        const errorLogPath = path.join(actualCwd, 'build_error.log');
        if (fs.existsSync(errorLogPath)) fs.unlinkSync(errorLogPath);
        console.log(`[GATECHECK] Passed!`);
      } catch (e) {
        console.error(`[GATECHECK] Failed! Cannot mark as DONE.`);
        process.exit(1);
      }
    }

    const completedAt = getTimestamp();
    const startTime = new Date(task.started_at).getTime();

    task.status = 'done';
    task.completed_at = completedAt;
    saveJSON(PATHS.tasks, tasks);
    updateAgentStatus(task.assignedAgent, 'idle');

    const events = loadJSON(PATHS.events);
    const taskEvents = events.filter(e => {
      const eventTime = new Date(e.timestamp).getTime();
      const isTargeted = (e.target && e.target.includes(id)) || (e.details && e.details.includes(id));
      const isInWindow = eventTime >= startTime && eventTime <= new Date(completedAt).getTime();
      const isSameRole = e.role === task.type;
      return isTargeted || (isInWindow && isSameRole);
    });

    if (taskEvents.length > 0) {
      if (!fs.existsSync(PATHS.archive)) fs.mkdirSync(PATHS.archive, { recursive: true });
      fs.writeFileSync(path.join(PATHS.archive, `${id}.json`), JSON.stringify(taskEvents, null, 2));
      saveJSON(PATHS.events, events.filter(e => !taskEvents.includes(e)));
      console.log(`[OK] Task ${id} done. Archived ${taskEvents.length} events.`);
    } else {
      console.log(`[OK] Task ${id} done.`);
    }
  },

  fail: (id, reason) => {
    const tasks = loadJSON(PATHS.tasks);
    const task = tasks.find(t => t.id == id);
    if (!task) throw new Error(`Task not found: ${id}`);

    task.status = 'review';
    saveJSON(PATHS.tasks, tasks);
    updateAgentStatus(task.assignedAgent, 'idle');

    const failures = loadJSON(PATHS.failures);
    failures.push({
      timestamp: getTimestamp(), taskId: id, taskTitle: task.title,
      agent: task.assignedAgent, reason: reason, status: 'unresolved'
    });
    saveJSON(PATHS.failures, failures);

    commands.log(task.type, 'failure_reported', `TASK-${id}`, `Failed: ${reason}`);
    console.log(`[OK] Task ${id} failure recorded.`);
  },

  fix: (id, plan) => {
    const tasks = loadJSON(PATHS.tasks);
    const task = tasks.find(t => t.id == id);
    if (!task) throw new Error(`Task not found: ${id}`);

    task.status = 'doing';
    saveJSON(PATHS.tasks, tasks);
    updateAgentStatus(task.assignedAgent, 'busy');

    commands.log(task.type, 'fix_start', `TASK-${id}`, `Fix started: ${plan}`);
    console.log(`[OK] Task ${id} fix started.`);
  },

  log: (role, action, target, details) => {
    const events = loadJSON(PATHS.events);
    events.push({ timestamp: getTimestamp(), role, action, target, details });
    saveJSON(PATHS.events, events);
    console.log(`[OK] Event logged.`);
  },

  sync_dashboard: () => {
    const tasks = loadJSON(PATHS.tasks);
    const events = loadJSON(PATHS.events);
    const summary = loadJSON(PATHS.summary);
    const project = loadJSON(PATHS.project);

    const totalTasks = tasks.length;
    const doneTasks = tasks.filter(t => t.status === 'done').length;
    const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
    const formatTime = (date) => date.toISOString().replace('T', ' ').substring(0, 19);

    const data = {
      progress,
      lastUpdate: formatTime(new Date()),
      overview: {
        projectName: project.name || CONFIG.project.name,
        currentPhase: summary.phase || CONFIG.project.phase,
        activeAgents: Object.values(project.agents).filter(a => a.status === 'busy').length,
        latestCommit: 'HEAD',
        latestAction: events.length > 0 ? events[events.length - 1].details : 'Idle'
      },
      projectStatus: Object.entries(CONFIG.agents).map(([agentId, agentConf]) => {
        const agentStatus = project.agents[agentId];
        const isBusy = agentStatus && agentStatus.status === 'busy';
        return {
          title: agentConf.label, icon: 'cpu',
          status: isBusy ? '🔴 Busy' : '🟢 Idle',
          currentTask: tasks.find(t => t.assignedAgent === agentId && t.status === 'doing')?.title || 'None',
          latestAction: agentConf.label
        };
      }),
      gitStatus: { currentBranch: 'main', latestCommit: 'N/A', modifiedFiles: 0, uncommittedChanges: 'None' },
      memory: { architecture: 'AI Runtime Core v2.6 (Gatekeeper + Timeline)', standards: 'Single Source of Truth (Runtime Layer)' },
      blockers: {
        currentBlocker: tasks.find(t => t.status === 'review')?.title || null,
        failedTasks: tasks.filter(t => t.status === 'review').map(t => t.title),
        testFailures: []
      },
      aiBehaviorLogs: events.slice(-15).reverse().map(e => ({
        time: e.timestamp.replace('T', ' ').split('.')[0], agent: e.role,
        behavior: e.action, desc: e.details, status: '🟢 OK', files: [e.target]
      })),
      taskCenter: tasks.map(t => ({
        id: `TASK-${t.id}`, name: t.title, module: MODULE_MAP[t.type] || 'General',
        agent: t.assignedAgent, priority: t.priority || 'P1',
        status: t.status === 'done' ? 'Done' : (t.status === 'doing' ? 'In Progress' : 'Todo')
      })),
      techStacks: CONFIG.techStacks
    };

    fs.writeFileSync(PATHS.dashboardData, `window.DASHBOARD_DATA = ${JSON.stringify(data, null, 2)};`, 'utf8');
    console.log(`[OK] Dashboard synced.`);
  },

  learn: (id) => {
    const logPath = path.join(PATHS.archive, `${id}.json`);
    if (!fs.existsSync(logPath)) throw new Error(`Archive not found: ${logPath}. Run finish first.`);
    console.log(`[ACTION REQUIRED] Analyze ${id}.json and update knowledge.md.`);
    commands.log('prd', 'learning_start', `TASK-${id}`, 'Knowledge extraction started');
  },

  check: () => {
    const tasks = loadJSON(PATHS.tasks);
    const project = loadJSON(PATHS.project);
    const now = new Date();

    let zombieTasks = [], danglingAgents = [], outOfSyncTasks = [], missingDeps = [];

    tasks.forEach(t => {
      if (t.status === 'doing' && t.started_at) {
        if (now - new Date(t.started_at) > CONFIG.zombieThresholdHours * 3600000) zombieTasks.push(t.id);
      }
    });

    const doingByAgent = {};
    tasks.forEach(t => {
      if (t.status === 'doing' && t.assignedAgent) {
        if (!doingByAgent[t.assignedAgent]) doingByAgent[t.assignedAgent] = [];
        doingByAgent[t.assignedAgent].push(t.id);
      }
    });

    Object.keys(project.agents).forEach(aId => {
      if (project.agents[aId].status === 'busy' && (!doingByAgent[aId] || doingByAgent[aId].length === 0)) danglingAgents.push(aId);
    });

    tasks.forEach(t => {
      if (t.status === 'doing' && t.assignedAgent && project.agents[t.assignedAgent].status !== 'busy') outOfSyncTasks.push(t.id);
    });

    const allIds = new Set(tasks.map(t => t.id));
    tasks.forEach(t => {
      if (t.status !== 'done' && t.dependsOn) {
        t.dependsOn.forEach(d => { if (!allIds.has(d)) missingDeps.push(`T${t.id}->D${d}`); });
      }
    });

    const hasError = zombieTasks.length || danglingAgents.length || outOfSyncTasks.length || missingDeps.length;

    console.log('==========================================');
    console.log('🔍 Runtime Audit Report');
    console.log('==========================================');
    console.log(`${zombieTasks.length ? '❌' : '✅'} Zombie tasks: ${zombieTasks.length}${zombieTasks.length ? ' (IDs: ' + zombieTasks.join(',') + ')' : ''}`);
    console.log(`${danglingAgents.length ? '❌' : '✅'} Dangling agents: ${danglingAgents.length}${danglingAgents.length ? ' (' + danglingAgents.join(',') + ')' : ''}`);
    console.log(`${outOfSyncTasks.length ? '❌' : '✅'} Out of sync: ${outOfSyncTasks.length}${outOfSyncTasks.length ? ' (IDs: ' + outOfSyncTasks.join(',') + ')' : ''}`);
    console.log(`${missingDeps.length ? '❌' : '✅'} Missing deps: ${missingDeps.length}${missingDeps.length ? ' (' + missingDeps.join(',') + ')' : ''}`);
    console.log('==========================================');
    console.log(`System health: ${hasError ? '🔴 Issues found' : '🟢 Healthy'}`);
    console.log('==========================================');
  },

  resume: () => {
    const tasks = loadJSON(PATHS.tasks);
    const doing = tasks.filter(t => t.status === 'doing');

    if (doing.length === 0) {
      console.log(`[OK] No active tasks. Run sai start <id> to begin.`);
      return;
    }

    const task = doing[0];
    const planPath = path.join(PATHS.plans, `task_${task.id}.md`);
    const hasPlan = fs.existsSync(planPath);
    const elapsed = task.started_at ? Math.round((Date.now() - new Date(task.started_at).getTime()) / 60000) : '?';

    console.log(`\n==========================================`);
    console.log(`🔄 Resume`);
    console.log(`==========================================`);
    console.log(`  Task ID:     ${task.id}`);
    console.log(`  Title:       ${task.title}`);
    console.log(`  Description: ${task.description}`);
    console.log(`  Agent:       ${task.assignedAgent}`);
    console.log(`  Priority:    ${task.priority || 'P1'}`);
    console.log(`  Elapsed:     ${elapsed} min`);
    console.log(`  Plan file:   ${hasPlan ? planPath : 'Not created'}`);
    if (task.dependsOn && task.dependsOn.length > 0) console.log(`  Depends on:  ${task.dependsOn.join(', ')}`);
    console.log(`==========================================`);
    if (hasPlan) {
      console.log(`\n📋 Plan:\n`);
      console.log(fs.readFileSync(planPath, 'utf8'));
    }
    console.log(`\n💡 Run sai finish ${task.id} when done, or sai fail ${task.id} <reason> on failure.`);
    console.log(`==========================================\n`);
  }
};

// ==========================================
// CLI Entry Point
// ==========================================
if (commands[normalizedCmd]) {
  try {
    commands[normalizedCmd](...args);
  } catch (err) {
    console.error(`[ERROR] ${err.message}`);
    process.exit(1);
  }
} else {
  console.log(`Usage: node runtime/sai.js <command> [args]`);
  console.log(`Commands: init, status, start, finish, fail, fix, log, sync-dashboard, learn, check, resume`);
}
