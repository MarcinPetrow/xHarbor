import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, openSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";

const root = process.cwd();
const runtimeRoot = join(root, ".xharbor");
const logRoot = join(runtimeRoot, "logs");

const stackServices = [
  { name: "xgroup-api", command: ["node", "apps/xgroup-api/src/server.js"], url: "http://127.0.0.1:8080" },
  { name: "xbacklog-api", command: ["node", "apps/xbacklog-api/src/server.js"], url: "http://127.0.0.1:8081" },
  { name: "xdashboard-api", command: ["node", "apps/xdashboard-api/src/server.js"], url: "http://127.0.0.1:8082" },
  { name: "xtalk-api", command: ["node", "apps/xtalk-api/src/server.js"], url: "http://127.0.0.1:8083" },
  { name: "xdoc-api", command: ["node", "apps/xdoc-api/src/server.js"], url: "http://127.0.0.1:8084" },
  { name: "xtag-api", command: ["node", "apps/xtag-api/src/server.js"], url: "http://127.0.0.1:8085" },
  { name: "xgroup-web", command: ["node", "apps/xgroup-web/src/server.js"], url: "http://127.0.0.1:3000" },
  { name: "xbacklog-web", command: ["node", "apps/xbacklog-web/src/server.js"], url: "http://127.0.0.1:3001" },
  { name: "xdashboard-web", command: ["node", "apps/xdashboard-web/src/server.js"], url: "http://127.0.0.1:3002" },
  { name: "xtalk-web", command: ["node", "apps/xtalk-web/src/server.js"], url: "http://127.0.0.1:3003" },
  { name: "xdoc-web", command: ["node", "apps/xdoc-web/src/server.js"], url: "http://127.0.0.1:3004" },
  { name: "xtag-web", command: ["node", "apps/xtag-web/src/server.js"], url: "http://127.0.0.1:3005" }
];

const workspaceServices = [
  ...stackServices,
  {
    name: "xtalk-macos",
    command: ["swift", "run", "xtalk-macos"],
    url: "macOS app",
    platform: "darwin"
  }
];

const profiles = {
  stack: {
    label: "Stack",
    statePath: join(runtimeRoot, "stack.json"),
    services: stackServices
  },
  workspace: {
    label: "Workspace",
    statePath: join(runtimeRoot, "workspace.json"),
    services: workspaceServices
  }
};

function isRunning(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureRuntimeDirs() {
  await mkdir(logRoot, { recursive: true });
}

async function readState(statePath) {
  if (!existsSync(statePath)) {
    return { services: [] };
  }
  return JSON.parse(await readFile(statePath, "utf8"));
}

async function writeState(statePath, state) {
  await ensureRuntimeDirs();
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

async function findActiveConflictingProfile(currentProfileKey) {
  const otherProfiles = Object.entries(profiles).filter(([profileKey]) => profileKey !== currentProfileKey);
  for (const [profileKey, profile] of otherProfiles) {
    const state = await readState(profile.statePath);
    const active = (state.services ?? []).filter((service) => isRunning(service.pid));
    if (active.length) {
      return { profileKey, profile, active };
    }
  }
  return null;
}

function resolveProfile(command) {
  if (command?.startsWith("workspace-")) {
    return { profileKey: "workspace", action: command.replace("workspace-", "") };
  }
  return { profileKey: "stack", action: command };
}

function resolveServices(profile) {
  return profile.services.filter((service) => !service.platform || service.platform === process.platform);
}

function formatServiceLine(service) {
  return `- ${service.name} pid=${service.pid} ${service.url}`;
}

async function startProfile(profileKey) {
  const profile = profiles[profileKey];
  const services = resolveServices(profile);
  await ensureRuntimeDirs();
  const conflict = await findActiveConflictingProfile(profileKey);
  if (conflict) {
    console.log(`${profile.label} cannot start while ${conflict.profile.label.toLowerCase()} is running:`);
    for (const service of conflict.active) {
      console.log(formatServiceLine(service));
    }
    return;
  }
  const current = await readState(profile.statePath);
  const active = current.services.filter((service) => isRunning(service.pid));
  if (active.length) {
    console.log(`${profile.label} already running:`);
    for (const service of active) {
      console.log(formatServiceLine(service));
    }
    return;
  }

  const state = {
    profile: profileKey,
    startedAt: new Date().toISOString(),
    services: []
  };

  for (const service of services) {
    const stdoutPath = join(logRoot, `${service.name}.out.log`);
    const stderrPath = join(logRoot, `${service.name}.err.log`);
    const stdoutFd = openSync(stdoutPath, "a");
    const stderrFd = openSync(stderrPath, "a");
    const child = spawn(service.command[0], service.command.slice(1), {
      cwd: root,
      detached: true,
      stdio: ["ignore", stdoutFd, stderrFd]
    });
    child.unref();

    state.services.push({
      name: service.name,
      pid: child.pid,
      url: service.url,
      stdoutPath,
      stderrPath,
      command: service.command
    });
    await sleep(service.name === "xtalk-macos" ? 600 : 150);
  }

  await writeState(profile.statePath, state);
  console.log(`${profile.label} started:`);
  for (const service of state.services) {
    console.log(formatServiceLine(service));
  }
}

async function stopProfile(profileKey) {
  const profile = profiles[profileKey];
  const state = await readState(profile.statePath);
  if (!state.services?.length) {
    console.log(`${profile.label} is not running.`);
    return;
  }

  for (const service of state.services) {
    if (!isRunning(service.pid)) continue;
    try {
      process.kill(-service.pid, "SIGTERM");
    } catch {
      try {
        process.kill(service.pid, "SIGTERM");
      } catch {}
    }
  }

  await sleep(500);

  for (const service of state.services) {
    if (!isRunning(service.pid)) continue;
    try {
      process.kill(-service.pid, "SIGKILL");
    } catch {
      try {
        process.kill(service.pid, "SIGKILL");
      } catch {}
    }
  }

  await rm(profile.statePath, { force: true });
  console.log(`${profile.label} stopped.`);
}

async function statusProfile(profileKey) {
  const profile = profiles[profileKey];
  const state = await readState(profile.statePath);
  if (!state.services?.length) {
    console.log(`${profile.label} is not running.`);
    return;
  }

  for (const service of state.services) {
    const running = isRunning(service.pid);
    console.log(`${running ? "up" : "down"} ${service.name} pid=${service.pid} ${service.url}`);
  }
}

async function logsProfile(profileKey) {
  const profile = profiles[profileKey];
  const state = await readState(profile.statePath);
  if (!state.services?.length) {
    console.log(`No ${profileKey} state found.`);
    return;
  }

  for (const service of state.services) {
    console.log(`${service.name}`);
    console.log(`  stdout: ${service.stdoutPath}`);
    console.log(`  stderr: ${service.stderrPath}`);
  }
}

async function restartProfile(profileKey) {
  await stopProfile(profileKey);
  await sleep(250);
  await startProfile(profileKey);
}

const command = process.argv[2];
const { profileKey, action } = resolveProfile(command);

if (!profiles[profileKey] || !["start", "stop", "restart", "status", "logs"].includes(action)) {
  console.error(
    "Usage: node scripts/dev-stack.mjs <start|stop|restart|status|logs|workspace-start|workspace-stop|workspace-restart|workspace-status|workspace-logs>"
  );
  process.exit(1);
}

if (action === "start") {
  await startProfile(profileKey);
} else if (action === "stop") {
  await stopProfile(profileKey);
} else if (action === "restart") {
  await restartProfile(profileKey);
} else if (action === "status") {
  await statusProfile(profileKey);
} else if (action === "logs") {
  await logsProfile(profileKey);
}
