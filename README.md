# Clocktopus

<p align="center">
  <img src="assets/logo.png" alt="Clocktopus Logo" width="300px" />
</p>

## About

Clocktopus is a powerful command-line interface tool designed to streamline your time tracking with platforms like Clockify and Jira. It offers a suite of features to automate and simplify the process of logging your work, ensuring accuracy and efficiency.

### Key Features

- **Automated Idle Monitoring:** Automatically stops and restarts timers based on your system's idle activity.
- **Jira Integration:** Seamlessly link your time entries to Jira tickets, fetching and prepending ticket titles to descriptions.
- **Google Calendar Integration:** Log your Google Calendar events directly as Clockify time entries, with intelligent project caching for recurring events.
- **Local Project Filtering:** Curate a personalized list of projects for quick selection, reducing clutter.
- **Session Management:** Start, stop, and check the status of your time entries directly from the terminal.
- **Database Cleanup:** Easily manage and clean up old session logs from the local SQLite database.

## Installation

To get started with the Clocktopus CLI, follow these steps:

1.  **Clone the repository:**

    ```bash
    git clone <repository_url>
    cd clocktopus
    ```

2.  **Install dependencies:**
    ```bash
    yarn install
    ```

## Configuration

### Clockify API Key

To connect to your Clockify account, you need to provide your API key. Create a `.env` file in the root directory of the project and add your Clockify API key:

```
CLOCKIFY_API_KEY="your_clockify_api_key_here"
ATLASSIAN_URL="https://your_org.atlassian.net/rest/api/3"
ATLASSIAN_API_TOKEN="your_atlassian_api_token_here"
ATLASSIAN_EMAIL="username@example.com"
GOOGLE_CLIENT_ID="google_client_id"
GOOGLE_CLIENT_SECRET="google_client_secret"
```

> Note: If you do not want to use Jira Integration, you can remove the ATLASSIAN variables.

Replace `"your_actual_clockify_api_key"` with your personal API key from your Clockify profile settings.

### Local Projects Filtering

The CLI allows you to filter the projects displayed when starting a new time entry. On the first run of the `clock start` command, the application will fetch all your Clockify projects and populate `data/local-projects.json` with their IDs and names. You can then edit this file to keep only the projects you frequently work on.

Example `data/local-projects.json`:

```json
[
  {
    "id": "671b783fbd91bc5e5ddcb944",
    "name": "2024 Project Management Traineeship"
  },
  {
    "id": "another_project_id",
    "name": "Another Project Name"
  }
]
```

Remove any project objects (both `id` and `name`) that you don't want to appear in the project selection list.

## Usage

### Build the application

Before running, you need to compile the TypeScript code:

```bash
yarn build
```

### Run the application

Once built, you can run the CLI commands using the following commands:

- **Monitor idle state and auto-manage timers:**

  ```bash
  yarn monitor
  ```

  This command will monitor your system's idle time and automatically manage your Clockify timer:
  - If you are idle for more than 5 minutes, the currently running timer will be stopped.
  - When you become active again (move the mouse, press a key, etc.), if your last session was auto-completed due to idleness, a new timer will automatically be created for the last used project.
  - All session events (start, stop, auto-complete, resume) are logged locally in the SQLite database, including project and description.

  This ensures your time tracking is accurate even if you step away from your computer or forget to manually stop and restart your timer.

  > Note: This ensures your time tracking is accurate even if you step away from your computer or forget to manually stop and restart your timer.
  > If you do not want the background process to check your idle state, you can skip this.

- **Start a new time entry:**

  ```bash
  yarn clock start "Task description"
  ```

  This will prompt you to select a project from your curated list.

- **Start a new time entry with a Jira ticket:**

  ```bash
  yarn clock start -j TICKET-123
  ```

  When you provide a Jira ticket number with the `-j` flag, the tool will automatically fetch the ticket's title from Jira and prepend it to your time entry description. For example, if the title of `TICKET-123` is "Fix the login button", the description will be saved as `TICKET-123 Fix the login button`. If you also provide a description, it will be appended after the Jira title.

- **Stop the currently running time entry:**

  ```bash
  yarn clock stop
  ```

- **Check the status of the current timer:**
  ```bash
  yarn clock status
  ```

### Manage Monitor

- **Restart the monitor process (after code changes):**

  ```bash
  yarn monitor:restart
  ```

  Use this command to restart the monitor process, for example after making code changes or updating dependencies. This ensures the monitor is running the latest version of your code.

- **Stop the monitor process:**

  ```bash
  yarn monitor:stop
  ```

  This command will stop the monitor process if it is running in the background. Use this when you want to fully halt all automatic idle monitoring and timer management.

- **Show monitor logs:**

  ```bash
  yarn monitor:logs
  ```

  This command will display logs related to the monitor process. Use it to review idle/active transitions, timer events, and session details that have been recorded while the monitor was running. This is useful for troubleshooting, auditing, or reviewing your time tracking history.

### Database Cleanup

To delete old session logs from the local SQLite database, use the `db:cleanup` command:

```bash
yarn db:cleanup <older-than-number-in-days>
```

- `<older-than-number-in-days>` (Optional): Specifies the number of days. Session logs older than this number of days will be deleted. If not provided, logs older than 5 days will be deleted by default.

Examples:

- Delete logs older than 5 days (default):

  ```bash
  yarn db:cleanup
  ```

- Delete logs older than 5 days:
  ```bash
  yarn db:cleanup 5
  ```

### Google Calendar Integration

This tool can log your Google Calendar events as time entries in Clockify. This is particularly useful for automatically tracking time spent in meetings or other scheduled events.

#### 1. Google Authentication

Before you can log calendar events, you need to authenticate with your Google account. This will grant the tool read-only access to your Google Calendar.

```bash
yarn google-auth
```

Follow the prompts in your browser to complete the authentication process. A token will be stored locally to maintain your session.

#### 2. Log Calendar Events

Once authenticated, you can log events for a specific date range:

```bash
yarn log-calendar -s <start-date> -e <end-date>
```

- `<start-date>`: The start date for fetching calendar events (e.g., `2025-07-21`).
- `<end-date>`: The end date for fetching calendar events (e.g., `2025-07-22`).

You can also log events for today using the `-t` or `--today` flag:

```bash
yarn log-calendar -t
```

For each calendar event, the tool will prompt you to select a Clockify project. Your selection will be cached based on the event's summary (name), so if you have recurring events with the same name, you will only be asked once for the project. If you provide a `project-id` using the `-p` flag, all events will be logged to that project without prompting.

Example:

```bash
yarn log-calendar -s 2025-07-21 -e 2025-07-22
```

Or, to log all events to a specific project:

```bash
yarn log-calendar -s 2025-07-21 -e 2025-07-22 -p your_clockify_project_id
```

## Troubleshooting

### No notifications on macOS

If you are not receiving notifications on macOS, you may need to adjust your system settings.

- **Check System Settings for Notifications:**
  - Go to **System Settings > Notifications**.
  - Look for **Terminal** (or your specific terminal application if you use another one like iTerm).
  - Make sure that **Allow Notifications** is turned on for it.
  - If you see an entry for **Node**, ensure it also has permissions.

Often, the first time a script tries to send a notification, macOS will ask for permission. If this was accidentally denied, you won't see any notifications.

## Linux Requirements

X server development package and pkg-config are required to run `desktop-idle` package:

```
apt install libxss-dev pkg-config build-essential
```

## Zsh Alias

If you super lazy just like me, then you can add aliases for different actions. Here is what I use:

```bash
# Clocktopus
CLOCKTOPUS_PATH="$HOME/Projects/Personal/clocktopus"

clocktopus() {
  cd "$CLOCKTOPUS_PATH" || return
  yarn "$@"
}

alias cbuild="clocktopus build"
alias cstart="clocktopus clock start"
alias cstop="clocktopus clock stop"
alias mstart="clocktopus monitor"
alias mstop="clocktopus monitor:stop"
alias mrestart="clocktopus monitor:restart"
alias mstatus="clocktopus monitor:status"
alias mlogs="clocktopus monitor:logs"
alias cgcalauth="clocktopus google-auth"
alias cgcal="clocktopus log-calendar"
```

Copy the above code in `.zshrc` file, change `CLOCKTOPUS_PATH` based on your path and save it. Then source the file using `source ~/.zshrc`.
