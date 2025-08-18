import { AxiosInstance } from 'axios';
import { HttpClient } from './lib/http-client.js';
import { logSessionStart } from './lib/db.js';
import { v4 as uuidv4 } from 'uuid';
import { NotificationCenter } from 'node-notifier';
import { getJiraTicket } from './lib/jira.js';

interface ClockifyProject {
  id: string;
  name: string;
}

export class Clockify {
  private readonly httpClient: AxiosInstance;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly notifier: any;

  constructor() {
    this.httpClient = new HttpClient().getClient();
    this.notifier = new NotificationCenter();
  }

  private sendNotification(
    title: string,
    message: string,
    actions?: string[],
    callback?: (err: unknown, response: unknown, metadata: { activationValue?: string }) => void,
  ) {
    this.notifier.notify(
      {
        title,
        message,
        sound: true,
        wait: true,
        actions,
      },
      callback,
    );
  }

  async getUser() {
    try {
      const response = await this.httpClient.get('/user');

      return response.data;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('[clockify] Could not connect to Clockify. Please check your API key.', error.message);
      } else {
        console.error('[clockify] An unknown error occurred.');
      }
      return null;
    }
  }

  async getProjects(workspaceId: string): Promise<ClockifyProject[]> {
    try {
      let allProjects: ClockifyProject[] = [];
      let page = 1;
      const pageSize = 50;
      let hasMore = true;

      while (hasMore) {
        const response = await this.httpClient.get(`/workspaces/${workspaceId}/projects`, {
          params: {
            page: page,
            'page-size': pageSize,
            archived: false,
          },
        });

        if (response.data.length > 0) {
          allProjects = allProjects.concat(response.data);
          page++;
        } else {
          hasMore = false;
        }
      }

      return allProjects;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error fetching projects:', error.message);
      } else {
        console.error('Error fetching projects: An unknown error occurred.');
      }
      return [];
    }
  }

  async getProjectById(workspaceId: string, projectId: string): Promise<ClockifyProject | null> {
    try {
      const response = await this.httpClient.get(`/workspaces/${workspaceId}/projects/${projectId}`);
      return response.data;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error fetching project:', error.message);
      } else {
        console.error('Error fetching project: An unknown error occurred.');
      }
      return null;
    }
  }

  async startTimer(workspaceId: string, projectId: string, description = 'Working on a task...', jiraTicket?: string) {
    try {
      const user = await this.getUser();
      if (!user) {
        return null;
      }

      let finalDescription = description;
      if (jiraTicket) {
        const ticket = await getJiraTicket(jiraTicket);
        if (ticket) {
          finalDescription = `${jiraTicket} ${ticket.fields.summary}`;
        }
      }

      const startedAt = new Date().toISOString();
      const sessionId = uuidv4();
      const response = await this.httpClient.post(`/workspaces/${workspaceId}/time-entries`, {
        projectId: projectId,
        description: finalDescription,
        start: startedAt,
      });

      // Log session to SQLite
      logSessionStart(sessionId, projectId, finalDescription, startedAt, jiraTicket);

      const project = await this.getProjectById(workspaceId, projectId);

      this.sendNotification(
        `Timer started for ${project ? project.name : 'a project'}`,
        finalDescription,
        ['Stop'],
        (err, response, metadata) => {
          if (err) {
            console.error(err);
            return;
          }
          if (metadata.activationValue === 'Stop') {
            this.stopTimer(workspaceId, user.id);
          }
        },
      );

      return response.data;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error starting timer:', error.message);
      } else {
        console.error('Error starting timer: An unknown error occurred.');
      }
      return null;
    }
  }

  async stopTimer(workspaceId: string, userId: string) {
    try {
      const response = await this.httpClient.patch(`/workspaces/${workspaceId}/user/${userId}/time-entries`, {
        end: new Date().toISOString(),
      });

      this.sendNotification('Timer stopped', 'Your timer has been stopped.');

      return response.data;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error stopping timer:', error.message);
      } else {
        console.error('Error stopping timer: An unknown error occurred.');
      }
      return null;
    }
  }

  async getActiveTimer(workspaceId: string, userId: string) {
    try {
      const response = await this.httpClient.get(
        `/workspaces/${workspaceId}/user/${userId}/time-entries?in-progress=true`,
      );
      return response.data[0];
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error fetching active timer:', error.message);
      } else {
        console.error('Error fetching active timer: An unknown error occurred.');
      }
      return null;
    }
  }

  async logTime(workspaceId: string, projectId: string | null, start: string, end: string, description: string) {
    if (!projectId) {
      return null;
    }

    try {
      const response = await this.httpClient.post(`/workspaces/${workspaceId}/time-entries`, {
        projectId: projectId,
        start: start,
        end: end,
        description: description,
      });
      return response.data;
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error('Error logging time:', error.message);
      } else {
        console.error('Error logging time: An unknown error occurred.');
      }

      return null;
    }
  }
}
