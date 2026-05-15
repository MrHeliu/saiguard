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
// i18n
// ==========================================
const LOCALE = CONFIG.locale || 'en';

const MSG = {
  status: {
    progress:     { en: 'Progress', zh: '项目进度' },
    phase:        { en: 'Phase', zh: '当前阶段' },
    review:       { en: 'Review', zh: '需要修复' },
    active:       { en: 'Active', zh: '活跃执行' },
    noActive:     { en: 'No active tasks', zh: '无活跃执行任务' },
    todo:         { en: 'Todo (Top 3)', zh: '待办队列 (Top 3)' },
    resumeTip:    { en: 'Run sai resume to continue', zh: '执行 sai resume 查看上下文并继续' },
    elapsedUnit:  { en: 'min', zh: '分钟' }
  },
  start: {
    notFound:     { en: 'Task not found', zh: '找不到任务 ID' },
    invalidFlow:  { en: 'Invalid transition', zh: '非法流转' },
    lockFailed:   { en: 'Cannot start task', zh: '无法启动任务' },
    depsNotDone:  { en: 'not done', zh: '尚未完成' },
    started:      { en: 'started. Plan created', zh: '已开始。已创建实施计划' },
    resumed:      { en: 'resumed', zh: '已恢复执行' }
  },
  finish: {
    notFound:     { en: 'Task not found', zh: '找不到任务 ID' },
    invalidFlow:  { en: 'Invalid transition', zh: '非法流转' },
    gatecheck:    { en: 'Running', zh: '正在启动' },
    outputMissing:{ en: 'Output dir missing', zh: '产物目录缺失' },
    outputEmpty:  { en: 'Output dir empty', zh: '产物目录为空' },
    outputOk:     { en: 'Output verified', zh: '产物校验通过' },
    files:        { en: 'files', zh: '文件' },
    passed:       { en: 'Passed!', zh: '验证通过！' },
    failed:       { en: 'Failed! Cannot mark as DONE.', zh: '验证失败！禁止标记为 DONE。' },
    done:         { en: 'done', zh: '已完成' },
    archived:     { en: 'events', zh: '条' }
  },
  fail: {
    notFound:     { en: 'Task not found', zh: '找不到任务 ID' },
    recorded:     { en: 'failure recorded', zh: '失败已记录' },
    failedLabel:  { en: 'Failed', zh: '执行失败' }
  },
  fix: {
    notFound:     { en: 'Task not found', zh: '找不到任务 ID' },
    started:      { en: 'fix started', zh: '修复计划已启动' },
    fixLabel:     { en: 'Fix started', zh: '启动修复流程' }
  },
  log: {
    ok:           { en: 'Event logged', zh: '事件已记录' }
  },
  sync: {
    ok:           { en: 'Dashboard synced', zh: '看板数据已同步' }
  },
  learn: {
    notFound:     { en: 'Archive not found. Run finish first', zh: '找不到归档日志。请先执行 finish' },
    action:       { en: 'Analyze', zh: '请分析' },
    update:       { en: 'and update knowledge.md', zh: '中的行为日志并更新 knowledge.md' }
  },
  check: {
    title:        { en: 'Runtime Audit Report', zh: '运行时状态审计报告' },
    zombie:       { en: 'Zombie tasks', zh: '僵尸任务' },
    dangling:     { en: 'Dangling agents', zh: '状态悬空' },
    outOfSync:    { en: 'Out of sync', zh: '状态不同步' },
    missingDeps:  { en: 'Missing deps', zh: '依赖缺失' },
    healthy:      { en: 'Healthy', zh: '无异常' },
    issues:       { en: 'Issues found', zh: '有异常' }
  },
  resume: {
    title:        { en: 'Resume', zh: '断点续接' },
    noActive:     { en: 'No active tasks. Run sai start <id> to begin', zh: '当前无进行中任务，使用 sai start <id> 开始新任务' },
    planLabel:    { en: 'Plan', zh: '实施计划内容' },
    finishTip:    { en: 'when done, or sai fail', zh: '完成后执行 sai finish' },
    onFailure:    { en: 'on failure', zh: '失败则执行 sai fail' }
  },
  test: {
    testRunning:  { en: 'Running tests', zh: '正在运行测试' },
    testPassed:   { en: 'Tests passed!', zh: '测试通过！' },
    testFailed:   { en: 'Tests failed!', zh: '测试失败！' },
    notFound:     { en: 'Task not found', zh: '找不到任务 ID' },
    noTestConfig: { en: 'No test command configured for this task type', zh: '该任务类型未配置测试命令' },
    noActiveTest: { en: 'No active task to test. Run sai start <id> first', zh: '无进行中任务，先执行 sai start <id>' }
  },
  init: {
    configCreated:{ en: 'config.json created from template', zh: 'config.json 已从模板创建' },
    templateMissing:{ en: 'config.template.json not found', zh: 'config.template.json 未找到' },
    configExists: { en: 'config.json already exists', zh: 'config.json 已存在' },
    created:      { en: 'Created', zh: '已创建' },
    exists:       { en: 'already exists', zh: '已存在' },
    initialized:  { en: 'Project initialized', zh: '项目已初始化' }
  }
};

const t = (section, key) => (MSG[section] && MSG[section][key] && MSG[section][key][LOCALE]) || MSG[section][key].en;

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
  const strategy = { cmd: s.cmd, msg: s.msg, outputDir: s.outputDir || null, testCmd: s.testCmd || null, testMsg: s.testMsg || null };

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
    console.log(`📊 ${t('status', 'progress')}: [${bar}] ${progress}%`);
    console.log(`🏁 ${t('status', 'phase')}: ${summary.phase || CONFIG.project.phase || 'Unknown'}`);
    console.log(`==========================================`);

    if (review.length > 0) {
      console.log(`\n⚠️  ${t('status', 'review')}:`);
      review.forEach(t => console.log(`   [${t.id}] ${t.title} - ${t.assignedAgent}`));
    }

    if (doing.length > 0) {
      console.log(`\n🚀 ${t('status', 'active')}:`);
      doing.forEach(t => {
        const elapsed = t.started_at
          ? Math.round((Date.now() - new Date(t.started_at).getTime()) / 60000)
          : '?';
        console.log(`   [${t.id}] ${t.title} (${t.assignedAgent}) - ${elapsed} ${t('status', 'elapsedUnit')}`);
      });
      console.log(`\n   💡 ${t('status', 'resumeTip')}`);
    } else {
      console.log(`\n💤 ${t('status', 'noActive')}`);
    }

    if (todo.length > 0) {
      console.log(`\n📅 ${t('status', 'todo')}:`);
      todo.slice(0, 3).forEach(t => console.log(`   [${t.id}] ${t.title} [${t.priority || 'P2'}]`));
    }
    console.log(`\n==========================================\n`);
  },

  start: (id) => {
    const tasks = loadJSON(PATHS.tasks);
    const task = tasks.find(t => t.id == id);
    if (!task) throw new Error(`${t('start', 'notFound')}: ${id}`);

    if (!VALID_FLOW[task.status].includes('doing')) {
      throw new Error(`${t('start', 'invalidFlow')}: ${task.status} -> doing`);
    }

    if (task.dependsOn && task.dependsOn.length > 0) {
      const pendingDeps = task.dependsOn.filter(depId => {
        const depTask = tasks.find(t => t.id == depId);
        return !depTask || depTask.status !== 'done';
      });
      if (pendingDeps.length > 0) {
        throw new Error(`[LOCK] ${t('start', 'lockFailed')} ${id}: dependencies [${pendingDeps.join(', ')}] ${t('start', 'depsNotDone')}.`);
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
      console.log(`[OK] Task ${id} ${t('start', 'started')}: ${planPath}`);
    } else {
      console.log(`[OK] Task ${id} ${t('start', 'resumed')}.`);
    }
  },

  finish: (id) => {
    const tasks = loadJSON(PATHS.tasks);
    const task = tasks.find(t => t.id == id);
    if (!task) throw new Error(`${t('finish', 'notFound')}: ${id}`);

    if (!VALID_FLOW[task.status].includes('done')) {
      throw new Error(`${t('finish', 'invalidFlow')}: ${task.status} -> done`);
    }

    const strategy = CHECK_STRATEGIES[task.type];
    if (strategy) {
      console.log(`[GATECHECK] ${t('finish', 'gatecheck')} ${strategy.msg}...`);
      try {
        const actualCwd = typeof strategy.cwd === 'function' ? strategy.cwd(id) : strategy.cwd;
        execSync(strategy.cmd, { cwd: actualCwd, stdio: 'inherit' });

        if (strategy.outputDir) {
          const outputAbs = path.join(actualCwd, strategy.outputDir);
          if (!fs.existsSync(outputAbs)) {
            console.error(`[GATECHECK] ${t('finish', 'outputMissing')}: ${strategy.outputDir}/`);
            process.exit(1);
          }
          const files = fs.readdirSync(outputAbs);
          if (files.length === 0) {
            console.error(`[GATECHECK] ${t('finish', 'outputEmpty')}: ${strategy.outputDir}/`);
            process.exit(1);
          }
          console.log(`[GATECHECK] ${t('finish', 'outputOk')} (${strategy.outputDir}/: ${files.length} ${t('finish', 'files')})`);
        }

        const errorLogPath = path.join(actualCwd, 'build_error.log');
        if (fs.existsSync(errorLogPath)) fs.unlinkSync(errorLogPath);
        console.log(`[GATECHECK] ${t('finish', 'passed')}`);

        // Test stage
        if (strategy.testCmd) {
          console.log(`[TESTCHECK] ${strategy.testMsg || t('test', 'testRunning')}...`);
          try {
            execSync(strategy.testCmd, { cwd: actualCwd, stdio: 'inherit' });
            console.log(`[TESTCHECK] ${t('test', 'testPassed')}`);
          } catch (e) {
            console.error(`[TESTCHECK] ${t('test', 'testFailed')}`);
            process.exit(1);
          }
        }
      } catch (e) {
        console.error(`[GATECHECK] ${t('finish', 'failed')}`);
        process.exit(1);
      }
    }

    const completedAt = getTimestamp();
    const startTime = task.started_at ? new Date(task.started_at).getTime() : 0;

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
      console.log(`[OK] Task ${id} ${t('finish', 'done')}. Archived ${taskEvents.length} ${t('finish', 'archived')}.`);
    } else {
      console.log(`[OK] Task ${id} ${t('finish', 'done')}.`);
    }
  },

  fail: (id, reason) => {
    const tasks = loadJSON(PATHS.tasks);
    const task = tasks.find(t => t.id == id);
    if (!task) throw new Error(`${t('fail', 'notFound')}: ${id}`);

    task.status = 'review';
    saveJSON(PATHS.tasks, tasks);
    updateAgentStatus(task.assignedAgent, 'idle');

    const failures = loadJSON(PATHS.failures);
    failures.push({
      timestamp: getTimestamp(), taskId: id, taskTitle: task.title,
      agent: task.assignedAgent, reason: reason, status: 'unresolved'
    });
    saveJSON(PATHS.failures, failures);

    commands.log(task.type, 'failure_reported', `TASK-${id}`, `${t('fail', 'failedLabel')}: ${reason}`);
    console.log(`[OK] Task ${id} ${t('fail', 'recorded')}.`);
  },

  fix: (id, plan) => {
    const tasks = loadJSON(PATHS.tasks);
    const task = tasks.find(t => t.id == id);
    if (!task) throw new Error(`${t('fix', 'notFound')}: ${id}`);

    task.status = 'doing';
    saveJSON(PATHS.tasks, tasks);
    updateAgentStatus(task.assignedAgent, 'busy');

    commands.log(task.type, 'fix_start', `TASK-${id}`, `${t('fix', 'fixLabel')}: ${plan}`);
    console.log(`[OK] Task ${id} ${t('fix', 'started')}.`);
  },

  log: (role, action, target, details) => {
    const events = loadJSON(PATHS.events);
    events.push({ timestamp: getTimestamp(), role, action, target, details });
    saveJSON(PATHS.events, events);
    console.log(`[OK] ${t('log', 'ok')}.`);
  },

  test: (id) => {
    if (!id) {
      const tasks = loadJSON(PATHS.tasks);
      const doing = tasks.filter(t => t.status === 'doing');
      if (doing.length === 0) {
        console.log(`[OK] ${t('test', 'noActiveTest')}.`);
        return;
      }
      id = doing[0].id;
    }
    const tasks = loadJSON(PATHS.tasks);
    const task = tasks.find(t => t.id == id);
    if (!task) throw new Error(`${t('test', 'notFound')}: ${id}`);

    const strategy = CHECK_STRATEGIES[task.type];
    if (!strategy || !strategy.testCmd) {
      console.log(`[SKIP] ${t('test', 'noTestConfig')}.`);
      return;
    }

    const actualCwd = typeof strategy.cwd === 'function' ? strategy.cwd(id) : strategy.cwd;
    console.log(`[TESTCHECK] ${strategy.testMsg || t('test', 'testRunning')}...`);
    try {
      execSync(strategy.testCmd, { cwd: actualCwd, stdio: 'inherit' });
      console.log(`[TESTCHECK] ${t('test', 'testPassed')}`);
      commands.log(task.type, 'test_pass', `TASK-${id}`, strategy.testMsg || 'Tests passed');
    } catch (e) {
      console.error(`[TESTCHECK] ${t('test', 'testFailed')}`);
      commands.log(task.type, 'test_fail', `TASK-${id}`, strategy.testMsg || 'Tests failed');
      process.exit(1);
    }
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

    const busyLabel = LOCALE === 'zh' ? '🔴 繁忙' : '🔴 Busy';
    const idleLabel = LOCALE === 'zh' ? '🟢 待命' : '🟢 Idle';
    const statusDone = LOCALE === 'zh' ? '已完成' : 'Done';
    const statusDoing = LOCALE === 'zh' ? '进行中' : 'In Progress';
    const statusTodo = LOCALE === 'zh' ? '待办' : 'Todo';

    const data = {
      progress,
      lastUpdate: formatTime(new Date()),
      overview: {
        projectName: project.name || CONFIG.project.name,
        currentPhase: summary.phase || CONFIG.project.phase,
        activeAgents: Object.values(project.agents).filter(a => a.status === 'busy').length,
        latestCommit: 'HEAD',
        latestAction: events.length > 0 ? events[events.length - 1].details : (LOCALE === 'zh' ? '等待指令' : 'Idle')
      },
      projectStatus: Object.entries(CONFIG.agents).map(([agentId, agentConf]) => {
        const agentStatus = project.agents[agentId];
        const isBusy = agentStatus && agentStatus.status === 'busy';
        return {
          title: agentConf.label, icon: 'cpu',
          status: isBusy ? busyLabel : idleLabel,
          currentTask: tasks.find(t => t.assignedAgent === agentId && t.status === 'doing')?.title || (LOCALE === 'zh' ? '无' : 'None'),
          latestAction: agentConf.label
        };
      }),
      gitStatus: { currentBranch: 'main', latestCommit: 'N/A', modifiedFiles: 0, uncommittedChanges: 'None' },
      memory: { architecture: 'S-AI-Guard v2.6 (Gatekeeper + Timeline)', standards: 'Single Source of Truth (Runtime Layer)' },
      blockers: {
        currentBlocker: tasks.find(t => t.status === 'review')?.title || null,
        failedTasks: tasks.filter(t => t.status === 'review').map(t => t.title),
        testFailures: []
      },
      aiBehaviorLogs: events.slice(-15).reverse().map(e => ({
        time: e.timestamp.replace('T', ' ').split('.')[0], agent: e.role,
        behavior: e.action, desc: e.details, status: LOCALE === 'zh' ? '🟢 成功' : '🟢 OK', files: [e.target]
      })),
      taskCenter: tasks.map(t => ({
        id: `TASK-${t.id}`, name: t.title, module: MODULE_MAP[t.type] || (LOCALE === 'zh' ? '通用' : 'General'),
        agent: t.assignedAgent, priority: t.priority || 'P1',
        status: t.status === 'done' ? statusDone : (t.status === 'doing' ? statusDoing : statusTodo)
      })),
      techStacks: CONFIG.techStacks
    };

    fs.writeFileSync(PATHS.dashboardData, `window.DASHBOARD_DATA = ${JSON.stringify(data, null, 2)};`, 'utf8');
    console.log(`[OK] ${t('sync', 'ok')}.`);
  },

  learn: (id) => {
    const logPath = path.join(PATHS.archive, `${id}.json`);
    if (!fs.existsSync(logPath)) throw new Error(`${t('learn', 'notFound')}: ${logPath}`);
    console.log(`[ACTION REQUIRED] ${t('learn', 'action')} ${id}.json ${t('learn', 'update')}.`);
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
    console.log(`🔍 ${t('check', 'title')}`);
    console.log('==========================================');
    console.log(`${zombieTasks.length ? '❌' : '✅'} ${t('check', 'zombie')}: ${zombieTasks.length}${zombieTasks.length ? ' (IDs: ' + zombieTasks.join(',') + ')' : ''}`);
    console.log(`${danglingAgents.length ? '❌' : '✅'} ${t('check', 'dangling')}: ${danglingAgents.length}${danglingAgents.length ? ' (' + danglingAgents.join(',') + ')' : ''}`);
    console.log(`${outOfSyncTasks.length ? '❌' : '✅'} ${t('check', 'outOfSync')}: ${outOfSyncTasks.length}${outOfSyncTasks.length ? ' (IDs: ' + outOfSyncTasks.join(',') + ')' : ''}`);
    console.log(`${missingDeps.length ? '❌' : '✅'} ${t('check', 'missingDeps')}: ${missingDeps.length}${missingDeps.length ? ' (' + missingDeps.join(',') + ')' : ''}`);
    console.log('==========================================');
    console.log(`System health: ${hasError ? '🔴 ' + t('check', 'issues') : '🟢 ' + t('check', 'healthy')}`);
    console.log('==========================================');
  },

  resume: () => {
    const tasks = loadJSON(PATHS.tasks);
    const doing = tasks.filter(t => t.status === 'doing');

    if (doing.length === 0) {
      console.log(`[OK] ${t('resume', 'noActive')}.`);
      return;
    }

    const task = doing[0];
    const planPath = path.join(PATHS.plans, `task_${task.id}.md`);
    const hasPlan = fs.existsSync(planPath);
    const elapsed = task.started_at ? Math.round((Date.now() - new Date(task.started_at).getTime()) / 60000) : '?';

    console.log(`\n==========================================`);
    console.log(`🔄 ${t('resume', 'title')}`);
    console.log(`==========================================`);
    console.log(`  Task ID:     ${task.id}`);
    console.log(`  Title:       ${task.title}`);
    console.log(`  Description: ${task.description}`);
    console.log(`  Agent:       ${task.assignedAgent}`);
    console.log(`  Priority:    ${task.priority || 'P1'}`);
    console.log(`  Elapsed:     ${elapsed} ${t('status', 'elapsedUnit')}`);
    console.log(`  Plan file:   ${hasPlan ? planPath : 'Not created'}`);
    if (task.dependsOn && task.dependsOn.length > 0) console.log(`  Depends on:  ${task.dependsOn.join(', ')}`);
    console.log(`==========================================`);
    if (hasPlan) {
      console.log(`\n📋 ${t('resume', 'planLabel')}:\n`);
      console.log(fs.readFileSync(planPath, 'utf8'));
    }
    console.log(`\n💡 ${t('resume', 'finishTip')} ${task.id} ${t('resume', 'onFailure')} ${task.id} <reason>`);
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
  console.log(`Commands: init, status, start, finish, fail, fix, log, sync-dashboard, learn, check, resume, test`);
}
