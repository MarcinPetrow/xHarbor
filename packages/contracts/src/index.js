export const TEAM_ROLES = ["owner", "admin", "manager", "member", "guest"];
export const TASK_STATUSES = ["new", "in_progress", "done"];
export const USER_STATUSES = ["active", "suspended"];

export function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createDemoWorkspace() {
  return {
    snapshot: {
      organization: { id: "org-xharbor", name: "xHarbor" },
      teams: [
        { id: "team-core", organizationID: "org-xharbor", name: "Platform Core" },
        { id: "team-product", organizationID: "org-xharbor", name: "Product Delivery" },
        { id: "team-mobile", organizationID: "org-xharbor", name: "Messaging Clients" }
      ],
      users: [
        {
          id: "user-marcin",
          displayName: "Marcin Kowalski",
          firstName: "Marcin",
          lastName: "Kowalski",
          nickname: "marcin",
          department: "Platform",
          title: "Head of Engineering",
          managerUserID: null,
          email: "marcin@xharbor.dev",
          status: "active"
        },
        {
          id: "user-anna",
          displayName: "Anna Nowak",
          firstName: "Anna",
          lastName: "Nowak",
          nickname: "anna",
          department: "Product Delivery",
          title: "Delivery Lead",
          managerUserID: "user-marcin",
          email: "anna@xharbor.dev",
          status: "active"
        },
        {
          id: "user-ola",
          displayName: "Ola Zielinska",
          firstName: "Ola",
          lastName: "Zielinska",
          nickname: null,
          department: "Messaging Clients",
          title: "Mobile Engineer",
          managerUserID: "user-anna",
          email: "ola@xharbor.dev",
          status: "active"
        }
      ],
      memberships: [
        { userID: "user-marcin", teamID: "team-core", role: "owner" },
        { userID: "user-anna", teamID: "team-product", role: "manager" },
        { userID: "user-ola", teamID: "team-mobile", role: "member" }
      ]
    },
    events: [
      { name: "xgroup.organization.created", aggregateID: "org-xharbor", context: "xGroup" },
      { name: "xgroup.team.created", aggregateID: "team-mobile", context: "xGroup" },
      { name: "xgroup.user.provisioned", aggregateID: "user-ola", context: "xGroup" }
    ]
  };
}

export function createDemoBacklogState(workspace) {
  return {
    board: {
      workspace,
      projects: [
        { id: "proj-core", teamID: "team-core", name: "Core Platform" },
        { id: "proj-launch", teamID: "team-product", name: "Launch Readiness" }
      ],
      tasks: [
        {
          id: "task-auth",
          projectID: "proj-core",
          title: "Define auth boundaries for xGroup",
          description: "Document session authority boundaries, ownership rules, and service-to-service trust.",
          assigneeUserID: "user-marcin",
          status: "in_progress",
          createdAt: "2026-03-29T09:15:00.000Z",
          updatedAt: "2026-03-29T10:05:00.000Z",
          completedAt: null
        },
        {
          id: "task-dashboard",
          projectID: "proj-launch",
          title: "Prepare reporting KPIs",
          description: "Define the first KPI set for operational, workflow, and team-level reporting.",
          assigneeUserID: "user-anna",
          status: "new",
          createdAt: "2026-03-29T09:40:00.000Z",
          updatedAt: "2026-03-29T09:40:00.000Z",
          completedAt: null
        }
      ],
      comments: [
        {
          id: "comment-task-auth-1",
          taskID: "task-auth",
          authorUserID: "user-marcin",
          body: "Initial auth boundary review is in progress.",
          createdAt: "2026-03-29T10:05:00.000Z"
        }
      ],
      taskEvents: [
        {
          id: "task-event-task-auth-created",
          taskID: "task-auth",
          type: "task.created",
          actorUserID: "user-marcin",
          createdAt: "2026-03-29T09:15:00.000Z",
          detail: "Task created in Core Platform."
        },
        {
          id: "task-event-task-auth-started",
          taskID: "task-auth",
          type: "task.status.changed",
          actorUserID: "user-marcin",
          createdAt: "2026-03-29T10:05:00.000Z",
          detail: "Status changed from New to In Progress."
        }
      ]
    },
    syncStatus: {
      source: "bootstrap",
      lastSyncAt: null,
      lastSyncSucceeded: false,
      lastError: "xGroup sync not attempted yet"
    }
  };
}

export function createDemoDashboardState() {
  const workspace = createDemoWorkspace();
  const backlog = createDemoBacklogState(workspace.snapshot);

  return {
    reports: [
      {
        id: "report-platform-health",
        title: "Platform Health",
        description: "Cross-module operating picture for delivery teams.",
        kind: "summary"
      },
      {
        id: "report-team-workload",
        title: "Team Workload",
        description: "Projects and assigned work grouped by team.",
        kind: "team-workload"
      },
      {
        id: "report-delivery-risks",
        title: "Delivery Risks",
        description: "Unassigned work and teams without projects.",
        kind: "risk"
      }
    ],
    snapshot: {
      workspace: workspace.snapshot,
      backlog: {
        projects: backlog.board.projects,
        tasks: backlog.board.tasks,
        comments: backlog.board.comments
      }
    },
    syncStatus: {
      sources: {
        xgroup: "bootstrap",
        xbacklog: "bootstrap"
      },
      lastSyncAt: null,
      lastSyncSucceeded: false,
      lastError: "Dashboard sync not attempted yet"
    }
  };
}

export function createDemoTalkState() {
  const workspace = createDemoWorkspace().snapshot;

  return {
    workspace,
    rooms: [
      {
        id: "room-platform-core",
        teamID: "team-core",
        name: "Platform Core",
        archivedAt: null,
        archivedByUserID: null
      },
      {
        id: "room-product-delivery",
        teamID: "team-product",
        name: "Product Delivery",
        archivedAt: null,
        archivedByUserID: null
      }
    ],
    roomMessages: [
      {
        id: "msg-room-1",
        conversationID: "room-platform-core",
        authorUserID: "user-marcin",
        body: "Kickoff for auth boundaries and platform integration.",
        createdAt: "2026-03-29T10:00:00.000Z"
      },
      {
        id: "msg-room-2",
        conversationID: "room-product-delivery",
        authorUserID: "user-anna",
        body: "Tracking release readiness and launch dependencies.",
        createdAt: "2026-03-29T10:15:00.000Z"
      }
    ],
    directConversations: [
      {
        id: "dm-user-anna-user-marcin",
        participantUserIDs: ["user-anna", "user-marcin"]
      }
    ],
    directMessages: [
      {
        id: "msg-dm-1",
        conversationID: "dm-user-anna-user-marcin",
        authorUserID: "user-anna",
        body: "Need final signal on dashboard KPIs before tomorrow.",
        createdAt: "2026-03-29T10:25:00.000Z"
      }
    ],
    events: [
      {
        id: 1,
        name: "xtalk.bootstrap.loaded",
        aggregateID: "room-platform-core",
        actorUserID: "system",
        createdAt: "2026-03-29T10:00:00.000Z"
      }
    ],
    readStates: [
      {
        userID: "user-marcin",
        conversationID: "room-platform-core",
        lastReadAt: "2026-03-29T10:00:00.000Z"
      }
    ],
    syncStatus: {
      source: "bootstrap",
      lastSyncAt: null,
      lastSyncSucceeded: false,
      lastError: "xGroup sync not attempted yet"
    }
  };
}
