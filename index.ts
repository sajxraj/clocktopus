#!/usr/bin/env node

import 'dotenv/config';
import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { Clockify } from './clockify.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { completeLatestSession, getLatestSession } from './lib/db.js';
import { stopJiraTimer } from './lib/jira.js';

interface Project {
  id: string;
  name: string;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();
const clockify = new Clockify();

async function getLocalProjects(): Promise<Project[]> {
  const dataDir = path.join(__dirname, '../data');
  const localProjectsPath = path.join(dataDir, 'local-projects.json');
  try {
    // Ensure the data directory exists
    await fs.promises.mkdir(dataDir, { recursive: true });
    // If the file does not exist, create it with an empty array
    try {
      await fs.promises.access(localProjectsPath, fs.constants.F_OK);
    } catch {
      await fs.promises.writeFile(localProjectsPath, '[]', 'utf8');
    }
    const data = await fs.promises.readFile(localProjectsPath, 'utf8');
    return JSON.parse(data);
  } catch (_error: unknown) {
    return [];
  }
}

async function getWorkspaceAndUser() {
  const user = await clockify.getUser();

  if (!user) {
    console.log(chalk.red('[index] Could not connect to Clockify. Please check your API key.'));

    process.exit(1);
  }

  const workspaceId = user.defaultWorkspace;
  const userId = user.id;

  return {
    workspaceId,
    userId,
  };
}

program.name('tracker').description('A CLI to track your time in Clockify').version('1.0.0');

program
  .command('start')
  .description('Start a new time entry. Select a project interactively.')
  .argument('[message]', 'Description for the time entry')
  .option('-j, --jira <ticket>', 'Jira ticket number')
  .action(async (message, options) => {
    const { workspaceId } = await getWorkspaceAndUser();

    let projects: Project[] = await clockify.getProjects(workspaceId);
    let localProjects = await getLocalProjects();

    if (localProjects.length === 0) {
      // If local-projects.json is empty or doesn't exist, populate it with all project IDs and names
      const allProjects = projects.map((p) => ({ id: p.id, name: p.name }));
      const localProjectsPath = path.join(__dirname, '../data/local-projects.json');
      fs.writeFileSync(localProjectsPath, JSON.stringify(allProjects, null, 2), 'utf8');
      console.log(
        chalk.green(
          'All projects have been saved to data/local-projects.json. Please edit this file to select your preferred projects.',
        ),
      );
      localProjects = allProjects;
    }

    if (localProjects.length > 0) {
      const localProjectIds = localProjects.map((p) => p.id);
      projects = projects.filter((p) => localProjectIds.includes(p.id));
    }

    if (!projects || projects.length === 0) {
      console.log(chalk.yellow('No projects found in your workspace.'));

      return;
    }

    const { selectedProjectId } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedProjectId',
        message: 'Which project do you want to work on?',
        choices: projects.map((p: { name: string; id: string }) => ({ name: p.name, value: p.id })),
      },
    ]);

    const entry = await clockify.startTimer(workspaceId, selectedProjectId, message, options.jira);
    if (entry) {
      const projectName = projects.find((p: { name: string; id: string }) => p.id === selectedProjectId)?.name;
      console.log(chalk.green(`Timer started for project: ${chalk.bold(projectName)}`));
    }
  });

program
  .command('stop')
  .description('Stop the currently running time entry.')
  .action(async () => {
    const { workspaceId, userId } = await getWorkspaceAndUser();
    const latestSession = getLatestSession();
    const stoppedEntry = await clockify.stopTimer(workspaceId, userId);
    if (stoppedEntry) {
      const completedAt = new Date().toISOString();
      completeLatestSession(completedAt);
      if (latestSession.jiraTicket) {
        const timeSpentSeconds = Math.round(
          (new Date(completedAt).getTime() - new Date(latestSession.startedAt).getTime()) / 1000,
        );
        if (timeSpentSeconds >= 60) {
          try {
            await stopJiraTimer(latestSession.jiraTicket, timeSpentSeconds);
          } catch (error) {
            console.error('Error stopping Jira timer:', error);
          }
        }
      }
      console.log(chalk.red('Timer stopped.'));
    } else {
      console.log(chalk.yellow('No timer was running.'));
    }
  });

program
  .command('status')
  .description('Check the status of the current timer.')
  .action(async () => {
    const { workspaceId, userId } = await getWorkspaceAndUser();
    const activeEntry = await clockify.getActiveTimer(workspaceId, userId);

    if (activeEntry) {
      const startTime = new Date(activeEntry.timeInterval.start);
      const duration = (new Date().getTime() - startTime.getTime()) / 1000; // in seconds
      const hours = Math.floor(duration / 3600);
      const minutes = Math.floor((duration % 3600) / 60);

      console.log(chalk.green('🕒 A timer is currently running.'));
      console.log(`   - ${chalk.bold('Project:')} ${activeEntry.project.name}`);
      console.log(`   - ${chalk.bold('Running for:')} ${hours}h ${minutes}m`);
    } else {
      console.log(chalk.yellow('No timer is currently running.'));
    }
  });

function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

program
  .command('monitor')
  .description('Monitor system idle time and screen state, and stop the Clockify timer if idle or screen is off.')
  .action(async () => {
    const { workspaceId, userId } = await getWorkspaceAndUser();

    async function stopTimerAndLog(reason: string) {
      const activeEntry = await clockify.getActiveTimer(workspaceId, userId);
      if (!activeEntry) return false;

      console.log(chalk.yellow(reason));
      const completedAt = new Date().toISOString();
      const latestSession = getLatestSession();

      const stoppedEntry = await clockify.stopTimer(workspaceId, userId);
      if (!stoppedEntry) return false;

      completeLatestSession(completedAt, true);

      if (latestSession?.jiraTicket) {
        const timeSpentSeconds = Math.round(
          (new Date(completedAt).getTime() - new Date(latestSession.startedAt).getTime()) / 1000,
        );
        if (timeSpentSeconds >= 60) {
          try {
            await stopJiraTimer(latestSession.jiraTicket, timeSpentSeconds);
          } catch (err) {
            console.error('Error stopping Jira timer:', err);
          }
        }
      }

      console.log(chalk.red('Timer stopped.'));
      return true;
    }

    // Safer restart w/ cooldown; only resume a recent auto-completed session
    let lastResumeAt = 0;
    const RESUME_COOLDOWN_MS = 10_000;

    async function safeRestartTimerIfNeeded() {
      const now = Date.now();
      if (now - lastResumeAt < RESUME_COOLDOWN_MS) return;

      // Small delay lets services settle after wake/activity
      await sleep(800);

      const latestSession = getLatestSession();
      if (!latestSession) return;

      const activeEntry = await clockify.getActiveTimer(workspaceId, userId);
      if (activeEntry) return;

      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
      const completedAt = latestSession.completedAt ? new Date(latestSession.completedAt).getTime() : 0;

      const eligible = latestSession.isAutoCompleted && completedAt > twoHoursAgo && !!latestSession.projectId;

      if (!eligible) return;

      await clockify.startTimer(workspaceId, latestSession.projectId, latestSession.description);
      console.log(chalk.green('Timer restarted for the last used project.'));
      lastResumeAt = Date.now();
    }

    console.log(chalk.blue('Monitoring display events (Unified Log) and idle time...'));

    let isLocked = false;
    let pollInterval: NodeJS.Timeout | null = null;

    console.log(chalk.blue('Monitoring display/lock state (macos-notification-state) and idle time...'));

    try {
      if (process.platform === 'darwin') {
        const nsModule = await import('macos-notification-state');
        const getSessionState = nsModule.default?.getSessionState || nsModule.getSessionState;

        if (!getSessionState) {
          throw new Error('getSessionState not found in module');
        }

        pollInterval = setInterval(async () => {
          try {
            const state = getSessionState();
            const locked = state === 'SESSION_SCREEN_IS_LOCKED';

            if (locked && !isLocked) {
              isLocked = true;
              await stopTimerAndLog('Screen is locked/off. Stopping timer...');
            } else if (!locked && isLocked) {
              console.log(chalk.green('Screen is unlocked/on. Attempting to restart timer...'));
              await safeRestartTimerIfNeeded();
              isLocked = false;
            }
          } catch (error) {
            console.error('Error polling session state:', error);
          }
        }, 3000);
      } else {
        console.log(chalk.yellow('Display monitoring (lock state) is only supported on macOS. Skipping.'));
      }
    } catch (err) {
      console.error(chalk.red('Failed to load macos-notification-state. Display monitoring will be disabled.'));
      console.error(err);
    }

    const IDLE_THRESHOLD_SECONDS = 300; // 5 minutes
    let lastIdle = false;

    const idleInterval = setInterval(async () => {
      try {
        const idleModule = await import('desktop-idle');
        const idleTime = idleModule.default.getIdleTime();

        if (idleTime >= IDLE_THRESHOLD_SECONDS) {
          const stopped = await stopTimerAndLog(`System idle for ${Math.floor(idleTime)} seconds. Stopping timer...`);
          if (stopped) lastIdle = true;
        } else {
          // User active again → resume even if display log events were missed
          if (lastIdle) {
            await safeRestartTimerIfNeeded();
          }
          lastIdle = false;
        }
      } catch (e) {
        // swallow; desktop-idle can occasionally throw on wake races
      }
    }, 5000);

    function cleanupAndExit(code = 0) {
      try {
        clearInterval(idleInterval);
      } catch {}
      try {
        if (pollInterval) clearInterval(pollInterval);
      } catch {}
      process.exit(code);
    }

    process.on('SIGINT', () => {
      console.log(chalk.gray('\nStopping monitor...'));
      cleanupAndExit(0);
    });

    process.on('SIGTERM', () => cleanupAndExit(0));
  });

program.parse(process.argv);
