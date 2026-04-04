export const TEAM_ROLES = ["owner", "admin", "manager", "member", "guest"];
export const TASK_STATUSES = ["new", "in_progress", "done"];
export const USER_STATUSES = ["active", "suspended"];
export const TAG_PATTERN = /(^|[^a-z0-9_])#([a-z0-9][a-z0-9_-]*)/gi;

export function slugify(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeTag(value) {
  return String(value ?? "")
    .trim()
    .replace(/^#+/, "")
    .toLowerCase();
}

export function extractTags(value) {
  const source = String(value ?? "");
  const tags = new Set();
  for (const match of source.matchAll(TAG_PATTERN)) {
    const normalized = normalizeTag(match[2]);
    if (normalized) tags.add(normalized);
  }
  return [...tags];
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
          title: "Define #auth boundaries for xGroup",
          description: "Document #auth session authority boundaries, ownership rules, and service-to-service trust for #platform services.",
          assigneeUserID: "user-marcin",
          status: "in_progress",
          createdAt: "2026-03-29T09:15:00.000Z",
          updatedAt: "2026-03-29T10:05:00.000Z",
          completedAt: null
        },
        {
          id: "task-dashboard",
          projectID: "proj-launch",
          title: "Prepare #reporting KPIs",
          description: "Define the first #reporting KPI set for operational, workflow, and team-level reporting.",
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
          body: "Initial #auth boundary review is in progress for the #platform workspace.",
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
        body: "Kickoff for #auth boundaries and #platform integration.",
        createdAt: "2026-03-29T10:00:00.000Z"
      },
      {
        id: "msg-room-2",
        conversationID: "room-product-delivery",
        authorUserID: "user-anna",
        body: "Tracking #release readiness and launch dependencies for #reporting.",
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
        body: "Need final signal on #dashboard KPIs before tomorrow's #release review.",
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

export function createDemoDocsState() {
  const workspace = createDemoWorkspace().snapshot;

  return {
    snapshot: {
      workspace
    },
    pages: [
      {
        id: "page-engineering-handbook",
        slug: "engineering-handbook",
        title: "Engineering Handbook",
        parentPageID: null,
        content: [
          "# Engineering Handbook",
          "",
          "Welcome to the shared documentation space for xHarbor delivery teams and #platform owners.",
          "",
          "## Focus areas",
          "",
          "- architecture decisions",
          "- operational runbooks",
          "- onboarding notes"
        ].join("\n"),
        createdAt: "2026-03-29T09:00:00.000Z",
        updatedAt: "2026-03-29T09:30:00.000Z",
        createdByUserID: "user-marcin",
        updatedByUserID: "user-marcin"
      },
      {
        id: "page-release-runbook",
        slug: "release-runbook",
        title: "Release Runbook",
        parentPageID: "page-engineering-handbook",
        content: [
          "## Release Runbook",
          "",
          "Use this page to capture #release readiness checks.",
          "",
          "1. validate backlog status",
          "2. confirm ownership",
          "3. capture rollout notes"
        ].join("\n"),
        createdAt: "2026-03-29T09:20:00.000Z",
        updatedAt: "2026-03-29T10:10:00.000Z",
        createdByUserID: "user-anna",
        updatedByUserID: "user-anna"
      },
      {
        id: "page-onboarding",
        slug: "onboarding",
        title: "Onboarding",
        parentPageID: "page-engineering-handbook",
        content: [
          "## Onboarding",
          "",
          "New team members should review:",
          "",
          "- xGroup directory data",
          "- xTalk collaboration norms",
          "- xBacklog delivery flow",
          "",
          "Core onboarding themes: #onboarding #platform"
        ].join("\n"),
        createdAt: "2026-03-29T09:45:00.000Z",
        updatedAt: "2026-03-29T09:45:00.000Z",
        createdByUserID: "user-marcin",
        updatedByUserID: "user-marcin"
      }
    ],
    revisions: [
      {
        id: "rev-page-engineering-handbook-1",
        pageID: "page-engineering-handbook",
        version: 1,
        title: "Engineering Handbook",
        slug: "engineering-handbook",
        parentPageID: null,
        content: [
          "# Engineering Handbook",
          "",
          "Welcome to the shared documentation space for xHarbor delivery teams."
        ].join("\n"),
        authorUserID: "user-marcin",
        createdAt: "2026-03-29T09:00:00.000Z",
        summary: "Page created."
      },
      {
        id: "rev-page-engineering-handbook-2",
        pageID: "page-engineering-handbook",
        version: 2,
        title: "Engineering Handbook",
        slug: "engineering-handbook",
        parentPageID: null,
        content: [
          "# Engineering Handbook",
          "",
          "Welcome to the shared documentation space for xHarbor delivery teams.",
          "",
          "## Focus areas",
          "",
          "- architecture decisions",
          "- operational runbooks",
          "- onboarding notes"
        ].join("\n"),
        authorUserID: "user-marcin",
        createdAt: "2026-03-29T09:30:00.000Z",
        summary: "Added handbook scope."
      },
      {
        id: "rev-page-release-runbook-1",
        pageID: "page-release-runbook",
        version: 1,
        title: "Release Runbook",
        slug: "release-runbook",
        parentPageID: "page-engineering-handbook",
        content: [
          "## Release Runbook",
          "",
          "Use this page to capture release readiness checks."
        ].join("\n"),
        authorUserID: "user-anna",
        createdAt: "2026-03-29T09:20:00.000Z",
        summary: "Page created."
      },
      {
        id: "rev-page-release-runbook-2",
        pageID: "page-release-runbook",
        version: 2,
        title: "Release Runbook",
        slug: "release-runbook",
        parentPageID: "page-engineering-handbook",
        content: [
          "## Release Runbook",
          "",
          "Use this page to capture release readiness checks.",
          "",
          "1. validate backlog status",
          "2. confirm ownership",
          "3. capture rollout notes"
        ].join("\n"),
        authorUserID: "user-anna",
        createdAt: "2026-03-29T10:10:00.000Z",
        summary: "Added checklist steps."
      },
      {
        id: "rev-page-onboarding-1",
        pageID: "page-onboarding",
        version: 1,
        title: "Onboarding",
        slug: "onboarding",
        parentPageID: "page-engineering-handbook",
        content: [
          "## Onboarding",
          "",
          "New team members should review:",
          "",
          "- xGroup directory data",
          "- xTalk collaboration norms",
          "- xBacklog delivery flow"
        ].join("\n"),
        authorUserID: "user-marcin",
        createdAt: "2026-03-29T09:45:00.000Z",
        summary: "Page created."
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

export function createDemoTagState() {
  return {
    aliases: {},
    index: {
      tags: [],
      items: [],
      sources: [],
      refreshedAt: null
    },
    syncStatus: {
      sources: {
        xbacklog: "bootstrap",
        xtalk: "bootstrap",
        xdoc: "bootstrap"
      },
      lastSyncAt: null,
      lastSyncSucceeded: false,
      lastError: "Tag indexing not attempted yet"
    }
  };
}
