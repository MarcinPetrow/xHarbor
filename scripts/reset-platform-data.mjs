import { extractTags, normalizeTag, slugify } from "@xharbor/contracts";
import { SqliteStateStore } from "@xharbor/sqlite-store";
import { buildTagIndex } from "../apps/xtag-api/src/tags.js";

const dbPath = new URL("../data/sqlite/xharbor.db", import.meta.url).pathname;
const organization = { id: "org-northstar", name: "Northstar Software" };
const baseTime = new Date("2026-03-10T08:00:00.000Z").getTime();
const usedUserIDs = new Set();
const users = [];
const teams = [];
const memberships = [];
const events = [];
const invitations = [];
const teamMembers = new Map();
const rng = mulberry32(42);

const stores = {
  xgroup: new SqliteStateStore(dbPath, "xgroup"),
  xbacklog: new SqliteStateStore(dbPath, "xbacklog"),
  xdashboard: new SqliteStateStore(dbPath, "xdashboard"),
  xtalk: new SqliteStateStore(dbPath, "xtalk"),
  xdoc: new SqliteStateStore(dbPath, "xdoc"),
  xtag: new SqliteStateStore(dbPath, "xtag"),
  sessions: new SqliteStateStore(dbPath, "sessions")
};

const tagCatalog = {
  platform: ["platform", "auth", "api", "workflow", "automation", "observability", "search"],
  delivery: ["release", "delivery", "reporting", "roadmap", "risk", "planning", "execution"],
  client: ["mobile", "web", "ux", "chat", "collaboration", "accessibility", "engagement"],
  infra: ["infra", "security", "compliance", "incident", "reliability", "finops", "governance"],
  data: ["data", "analytics", "reporting", "etl", "governance", "warehouse", "metrics"]
};

const divisionSpecs = [
  {
    department: "Platform Engineering",
    userDepartment: "Platform",
    vp: ["Katarzyna", "Zielinska", "VP Platform Engineering"],
    tags: tagCatalog.platform,
    directorNames: [
      ["Jakub", "Adamski"],
      ["Alicja", "Kurek"],
      ["Bartek", "Mazur"],
      ["Maja", "Nowak"]
    ],
    teams: [
      "Core Platform",
      "Developer Experience",
      "Identity Access",
      "Integration Services",
      "Workflow Automation",
      "Platform Search",
      "Observability",
      "Platform Data"
    ]
  },
  {
    department: "Product Delivery",
    userDepartment: "Delivery",
    vp: ["Piotr", "Krol", "VP Product Delivery"],
    tags: tagCatalog.delivery,
    directorNames: [
      ["Anna", "Nowak"],
      ["Pawel", "Maj"],
      ["Julia", "Czarnecka"],
      ["Patryk", "Zawada"]
    ],
    teams: [
      "Delivery Operations",
      "Program Delivery",
      "Release Management",
      "Billing Systems",
      "Customer Workflow",
      "Analytics Products",
      "Reporting Studio",
      "Product Excellence"
    ]
  },
  {
    department: "Client Engineering",
    userDepartment: "Clients",
    vp: ["Natalia", "Wisniewska", "VP Client Engineering"],
    tags: tagCatalog.client,
    directorNames: [
      ["Tomasz", "Sikora"],
      ["Ola", "Zielinska"],
      ["Karol", "Stepien"],
      ["Ewa", "Wojcik"]
    ],
    teams: [
      "Messaging Clients",
      "Mobile Experience",
      "Web Experience",
      "Collaboration UX",
      "Design Systems",
      "Client Quality",
      "Engagement Platform"
    ]
  },
  {
    department: "Infrastructure and Security",
    userDepartment: "Infrastructure",
    vp: ["Damian", "Lis", "VP Infrastructure and Security"],
    tags: [...tagCatalog.infra, ...tagCatalog.data],
    directorNames: [
      ["Igor", "Wrobel"],
      ["Konrad", "Beta"],
      ["Szymon", "Walczak"],
      ["Weronika", "Kania"]
    ],
    teams: [
      "Cloud Infrastructure",
      "Site Reliability",
      "Security Operations",
      "Governance Risk",
      "FinOps",
      "Data Protection",
      "Internal IT"
    ]
  }
];

const firstNames = [
  "Amelia", "Antoni", "Agnieszka", "Bartosz", "Beata", "Celina", "Cezary", "Dagmara", "Daria", "Dominik",
  "Eliza", "Emil", "Filip", "Gabriela", "Grzegorz", "Hubert", "Iga", "Ireneusz", "Joanna", "Kacper",
  "Karina", "Kinga", "Klaudia", "Lena", "Lidia", "Lukasz", "Maciej", "Magda", "Malgorzata", "Marek",
  "Mateusz", "Michal", "Mikolaj", "Milena", "Nadia", "Nikodem", "Oskar", "Patrycja", "Paulina", "Przemyslaw",
  "Rafal", "Sandra", "Sylwia", "Tymon", "Urszula", "Weronika", "Wiktor", "Wioletta", "Zofia", "Zuzanna"
];

const lastNames = [
  "Bielecki", "Brzezinski", "Chmielewski", "Cieslak", "Dabrowska", "Dudek", "Fronczak", "Gorski", "Grabowska", "Jankowski",
  "Janik", "Kaminska", "Kaczmarek", "Kalinowski", "Krawczyk", "Kwiatkowska", "Lewandowski", "Malinowski", "Michalak", "Nowicki",
  "Olszewski", "Pawlak", "Piasecki", "Pietrzak", "Przybylska", "Rutkowski", "Sadowski", "Sawicka", "Szczepanski", "Szewczyk",
  "Tomczak", "Urbanski", "Walczak", "Wasilewski", "Witkowski", "Wlodarczyk", "Wojcik", "Wrobel", "Zakrzewski", "Zawadzka",
  "Zielinski", "Zych", "Kozlowski", "Pawlowski", "Sobczak", "Sokolowska", "Bednarek", "Krupa", "Majewski", "Wrona"
];

function mulberry32(seed) {
  return function next() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function sample(items) {
  return items[Math.floor(rng() * items.length)];
}

function shuffle(items) {
  const copy = items.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function pickTags(pool, count = 3) {
  return shuffle(pool).slice(0, count);
}

function at(dayOffset, hour, minute = 0) {
  return new Date(baseTime + ((((dayOffset * 24) + hour) * 60) + minute) * 60 * 1000).toISOString();
}

function uniqueUserID(firstName, lastName) {
  const base = `user-${slugify(`${firstName} ${lastName}`)}`;
  if (!usedUserIDs.has(base)) {
    usedUserIDs.add(base);
    return base;
  }

  let suffix = 2;
  while (usedUserIDs.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  const userID = `${base}-${suffix}`;
  usedUserIDs.add(userID);
  return userID;
}

function createUser({
  firstName,
  lastName,
  title,
  department,
  managerUserID = null,
  nickname = null,
  status = "active"
}) {
  const displayName = `${firstName} ${lastName}`;
  const id = uniqueUserID(firstName, lastName);
  const user = {
    id,
    displayName,
    firstName,
    lastName,
    nickname: nickname ?? firstName.toLowerCase(),
    department,
    title,
    managerUserID,
    avatarDataURL: null,
    email: `${slugify(`${firstName}.${lastName}`)}@northstar.software`,
    status
  };
  users.push(user);
  events.push({
    name: "xgroup.user.provisioned",
    aggregateID: user.id,
    context: "xGroup"
  });
  return user;
}

function addMembership(userID, teamID, role) {
  memberships.push({ userID, teamID, role });
  if (!teamMembers.has(teamID)) {
    teamMembers.set(teamID, []);
  }
  teamMembers.get(teamID).push(userID);
}

function createTeam(name) {
  const team = {
    id: `team-${slugify(name)}`,
    organizationID: organization.id,
    name
  };
  teams.push(team);
  teamMembers.set(team.id, []);
  events.push({
    name: "xgroup.team.created",
    aggregateID: team.id,
    context: "xGroup"
  });
  return team;
}

function nextGeneratedName() {
  while (true) {
    const firstName = firstNames[Math.floor(rng() * firstNames.length)];
    const lastName = lastNames[Math.floor(rng() * lastNames.length)];
    const key = `${firstName} ${lastName}`;
    if (!users.some((user) => user.displayName === key)) {
      return [firstName, lastName];
    }
  }
}

function roleForTeamIndex(index) {
  if (index % 6 === 0) return "admin";
  if (index % 3 === 0) return "manager";
  return "member";
}

function buildWorkspace() {
  const root = createUser({
    firstName: "Marcin",
    lastName: "Petrow",
    title: "Chief Technology Officer",
    department: "Executive",
    nickname: "marcin"
  });

  const allManagers = [];
  const allDirectors = [];
  const allVPs = [];
  const teamDirectory = [];

  for (const division of divisionSpecs) {
    const [vpFirstName, vpLastName, vpTitle] = division.vp;
    const vp = createUser({
      firstName: vpFirstName,
      lastName: vpLastName,
      title: vpTitle,
      department: division.userDepartment,
      managerUserID: root.id
    });
    allVPs.push(vp);

    const directorUsers = division.directorNames.map(([firstName, lastName]) => createUser({
      firstName,
      lastName,
      title: `${division.department} Director`,
      department: division.userDepartment,
      managerUserID: vp.id
    }));
    allDirectors.push(...directorUsers);

    division.teams.forEach((teamName, teamIndex) => {
      const director = directorUsers[Math.floor(teamIndex / 2)];
      const [managerFirstName, managerLastName] = nextGeneratedName();
      const manager = createUser({
        firstName: managerFirstName,
        lastName: managerLastName,
        title: `${teamName} Manager`,
        department: division.userDepartment,
        managerUserID: director.id
      });
      allManagers.push(manager);

      const team = createTeam(teamName);
      teamDirectory.push({
        team,
        manager,
        director,
        vp,
        department: division.department,
        userDepartment: division.userDepartment,
        tags: division.tags
      });

      addMembership(manager.id, team.id, "owner");

      for (let icIndex = 0; icIndex < 5; icIndex += 1) {
        const [firstName, lastName] = nextGeneratedName();
        const title = sample([
          "Senior Software Engineer",
          "Software Engineer",
          "Backend Engineer",
          "Frontend Engineer",
          "Mobile Engineer",
          "QA Engineer",
          "Site Reliability Engineer",
          "Product Analyst",
          "Data Engineer",
          "Product Designer"
        ]);
        const contributor = createUser({
          firstName,
          lastName,
          title,
          department: division.userDepartment,
          managerUserID: manager.id
        });
        addMembership(contributor.id, team.id, roleForTeamIndex(icIndex));
      }
    });
  }

  for (const teamInfo of teamDirectory) {
    addMembership(root.id, teamInfo.team.id, "owner");
    addMembership(teamInfo.vp.id, teamInfo.team.id, "admin");
    addMembership(teamInfo.director.id, teamInfo.team.id, "admin");
  }

  invitations.push(
    {
      id: "invite-platform-architect",
      email: "future.architect@northstar.software",
      teamID: "team-core-platform",
      role: "member",
      status: "pending",
      createdAt: at(25, 9, 0),
      updatedAt: at(25, 9, 0)
    },
    {
      id: "invite-release-manager",
      email: "future.release@northstar.software",
      teamID: "team-release-management",
      role: "manager",
      status: "pending",
      createdAt: at(26, 10, 0),
      updatedAt: at(26, 10, 0)
    },
    {
      id: "invite-client-qa",
      email: "future.qa@northstar.software",
      teamID: "team-client-quality",
      role: "member",
      status: "revoked",
      createdAt: at(20, 8, 30),
      updatedAt: at(24, 16, 10)
    }
  );

  return {
    snapshot: {
      organization,
      teams,
      users,
      memberships
    },
    events,
    invitations,
    teamDirectory,
    root
  };
}

function projectNameForTeam(teamName, variant) {
  const suffixes = [
    "Roadmap",
    "Modernization",
    "Scale Out",
    "Experience Refresh",
    "Reliability Sprint"
  ];
  return `${teamName} ${suffixes[variant % suffixes.length]}`;
}

function buildBacklog(workspaceBundle) {
  const projects = [];
  const tasks = [];
  const comments = [];
  const taskEvents = [];
  let commentCounter = 0;

  workspaceBundle.teamDirectory.forEach((teamInfo, teamIndex) => {
    const project = {
      id: `proj-${slugify(teamInfo.team.name)}`,
      teamID: teamInfo.team.id,
      name: projectNameForTeam(teamInfo.team.name, teamIndex)
    };
    projects.push(project);

    const teamUserIDs = teamMembers.get(teamInfo.team.id);
    const contributorUserIDs = teamUserIDs.filter((userID) =>
      ![workspaceBundle.root.id, teamInfo.vp.id, teamInfo.director.id].includes(userID)
    );
    const taskTemplates = [
      ["Harden", "rollout boundaries"],
      ["Automate", "handoff flow"],
      ["Refine", "operating model"],
      ["Scale", "usage reporting"],
      ["Ship", "user workflow"],
      ["Stabilize", "release criteria"],
      ["Document", "runbook coverage"],
      ["Track", "cross-team dependencies"]
    ];

    for (let taskIndex = 0; taskIndex < taskTemplates.length; taskIndex += 1) {
      const [verb, noun] = taskTemplates[taskIndex];
      const tags = pickTags(teamInfo.tags, 3);
      const taskID = `task-${slugify(`${project.id}-${taskIndex + 1}`)}`;
      const createdAt = at(teamIndex + taskIndex, 8 + (taskIndex % 6), (taskIndex * 7) % 60);
      const status = taskIndex % 5 === 0 ? "done" : taskIndex % 2 === 0 ? "in_progress" : "new";
      const updatedAt = status === "new"
        ? createdAt
        : at(teamIndex + taskIndex + 2, 13 + (taskIndex % 5), (taskIndex * 11) % 60);
      const completedAt = status === "done"
        ? at(teamIndex + taskIndex + 4, 16 + (taskIndex % 4), (taskIndex * 13) % 60)
        : null;
      const assigneeUserID = contributorUserIDs[taskIndex % contributorUserIDs.length];
      const title = `${verb} #${tags[0]} ${noun} for ${teamInfo.team.name}`;
      const description = [
        `Drive #${tags[0]} work for ${teamInfo.team.name} while coordinating #${tags[1]} and #${tags[2]} outcomes.`,
        "",
        `Success criteria:`,
        `- clear ownership for #${tags[0]}`,
        `- measurable progress for #${tags[1]}`,
        `- production readiness around #${tags[2]}`
      ].join("\n");

      const task = {
        id: taskID,
        projectID: project.id,
        title,
        description,
        assigneeUserID,
        status,
        createdAt,
        updatedAt: completedAt || updatedAt,
        completedAt
      };
      tasks.push(task);

      taskEvents.push({
        id: `task-event-${task.id}-1`,
        taskID: task.id,
        type: "task.created",
        actorUserID: teamInfo.manager.id,
        createdAt,
        detail: `Task created for #${tags[0]} planning.`
      });

      if (status !== "new") {
        taskEvents.push({
          id: `task-event-${task.id}-2`,
          taskID: task.id,
          type: "task.status.changed",
          actorUserID: assigneeUserID,
          createdAt: updatedAt,
          detail: "Status changed from New to In Progress."
        });
      }

      if (status === "done") {
        taskEvents.push({
          id: `task-event-${task.id}-3`,
          taskID: task.id,
          type: "task.status.changed",
          actorUserID: assigneeUserID,
          createdAt: completedAt,
          detail: "Status changed from In Progress to Done."
        });
      }

      for (let commentIndex = 0; commentIndex < 2; commentIndex += 1) {
        commentCounter += 1;
        const authorUserID = contributorUserIDs[(taskIndex + commentIndex + 1) % contributorUserIDs.length];
        const createdAtComment = at(teamIndex + taskIndex + commentIndex + 1, 11 + commentIndex, (commentIndex * 17) % 60);
        comments.push({
          id: `comment-${commentCounter}`,
          taskID,
          authorUserID,
          body: `Progress update on #${tags[0]} and #${tags[1]} for ${teamInfo.team.name}. Watching #${tags[2]} risk.`,
          createdAt: createdAtComment
        });
        taskEvents.push({
          id: `task-event-${task.id}-${taskEvents.filter((event) => event.taskID === task.id).length + 1}`,
          taskID: task.id,
          type: "task.comment.created",
          actorUserID: authorUserID,
          createdAt: createdAtComment,
          detail: "Comment added."
        });
      }
    }
  });

  return {
    board: {
      workspace: workspaceBundle.snapshot,
      projects,
      tasks,
      comments,
      taskEvents
    },
    syncStatus: {
      source: "generated",
      lastSyncAt: new Date().toISOString(),
      lastSyncSucceeded: true,
      lastError: null
    }
  };
}

function buildTalk(workspaceBundle) {
  const rooms = workspaceBundle.teamDirectory.slice(0, 20).map((teamInfo) => ({
    id: `room-${slugify(teamInfo.team.name)}`,
    teamID: teamInfo.team.id,
    name: teamInfo.team.name,
    archivedAt: null,
    archivedByUserID: null
  }));
  const roomMessages = [];
  const directConversations = [];
  const directMessages = [];
  const readStates = [];
  const events = [];
  const rootUserID = workspaceBundle.root.id;

  rooms.forEach((room, roomIndex) => {
    const teamInfo = workspaceBundle.teamDirectory.find((item) => item.team.id === room.teamID);
    const members = teamMembers.get(room.teamID).filter((userID) =>
      ![rootUserID, teamInfo.vp.id, teamInfo.director.id].includes(userID)
    );
    const tags = pickTags(teamInfo.tags, 3);

    for (let messageIndex = 0; messageIndex < 18; messageIndex += 1) {
      const authorUserID = messageIndex % 6 === 0
        ? teamInfo.manager.id
        : members[messageIndex % members.length];
      roomMessages.push({
        id: `msg-room-${roomIndex + 1}-${messageIndex + 1}`,
        conversationID: room.id,
        authorUserID,
        body: sample([
          `Sync on #${tags[0]} and #${tags[1]} before the next delivery checkpoint.`,
          `Tracking #${tags[0]} rollout risk and #${tags[2]} mitigation for ${room.name}.`,
          `Please capture blockers around #${tags[1]} and #${tags[2]} in today's update.`,
          `We need a final readout for #${tags[0]} and #${tags[2]} before release.`,
          `Documenting #${tags[1]} follow-ups and #${tags[0]} owners in this thread.`
        ]),
        createdAt: at(roomIndex + Math.floor(messageIndex / 3), 9 + (messageIndex % 8), (messageIndex * 9) % 60)
      });
    }

    const rootMessages = roomMessages.filter((message) => message.conversationID === room.id);
    readStates.push({
      userID: rootUserID,
      conversationID: room.id,
      lastReadAt: rootMessages.at(-2)?.createdAt || rootMessages.at(-1)?.createdAt
    });
  });

  const dmPairs = [];
  const managers = workspaceBundle.teamDirectory.map((item) => item.manager);
  const directors = [...new Set(workspaceBundle.teamDirectory.map((item) => item.director))];
  const contributors = users.filter((user) =>
    ![workspaceBundle.root.id, ...managers.map((user) => user.id), ...directors.map((user) => user.id)].includes(user.id)
  );

  for (let index = 0; index < 18; index += 1) {
    dmPairs.push([rootUserID, managers[index].id]);
  }
  for (let index = 0; index < 18; index += 1) {
    dmPairs.push([managers[index].id, contributors[index * 2].id]);
  }

  dmPairs.forEach((pair, index) => {
    const participantUserIDs = pair.slice().sort();
    const conversationID = `dm-${participantUserIDs.join("-")}`;
    directConversations.push({ id: conversationID, participantUserIDs });
    const firstUser = users.find((user) => user.id === participantUserIDs[0]);
    const secondUser = users.find((user) => user.id === participantUserIDs[1]);
    const tags = pickTags([
      ...tagCatalog.platform,
      ...tagCatalog.delivery,
      ...tagCatalog.client,
      ...tagCatalog.infra
    ], 3);

    for (let messageIndex = 0; messageIndex < 8; messageIndex += 1) {
      const authorUserID = participantUserIDs[messageIndex % 2];
      directMessages.push({
        id: `msg-dm-${index + 1}-${messageIndex + 1}`,
        conversationID,
        authorUserID,
        body: sample([
          `Can you review the #${tags[0]} update before we close #${tags[1]}?`,
          `I left notes on #${tags[2]} and #${tags[0]} for the next release.`,
          `Let's align on #${tags[1]} ownership and #${tags[2]} risk tomorrow.`,
          `Sharing a quick status on #${tags[0]} for ${secondUser.firstName} and ${firstUser.firstName}.`
        ]),
        createdAt: at(5 + index, 10 + (messageIndex % 6), (messageIndex * 12) % 60)
      });
    }

    if (participantUserIDs.includes(rootUserID)) {
      const messages = directMessages.filter((message) => message.conversationID === conversationID);
      readStates.push({
        userID: rootUserID,
        conversationID,
        lastReadAt: messages.at(-2)?.createdAt || messages.at(-1)?.createdAt
      });
    }
  });

  events.push({
    id: 1,
    name: "xtalk.bootstrap.loaded",
    aggregateID: rooms[0].id,
    actorUserID: "system",
    createdAt: at(0, 8, 0)
  });

  return {
    workspace: workspaceBundle.snapshot,
    rooms,
    roomMessages,
    directConversations,
    directMessages,
    events,
    readStates,
    syncStatus: {
      source: "generated",
      lastSyncAt: new Date().toISOString(),
      lastSyncSucceeded: true,
      lastError: null
    }
  };
}

function buildDocs(workspaceBundle) {
  const roots = [
    ["Engineering Handbook", tagCatalog.platform],
    ["Platform Guides", tagCatalog.platform],
    ["Delivery Playbooks", tagCatalog.delivery],
    ["Client Apps", tagCatalog.client],
    ["Security and Compliance", tagCatalog.infra],
    ["Reliability and Operations", tagCatalog.infra],
    ["Data and Analytics", tagCatalog.data],
    ["Product Strategy", tagCatalog.delivery],
    ["People and Onboarding", ["onboarding", "delivery", "platform", "docs", "culture", "learning", "growth"]],
    ["Internal Tools", ["automation", "workflow", "platform", "search", "reporting", "docs", "productivity"]]
  ];

  const pages = [];
  const revisions = [];
  const candidateAuthors = users.filter((user) =>
    ["Platform", "Delivery", "Clients", "Infrastructure"].includes(user.department)
  );

  roots.forEach(([rootTitle, rootTags], rootIndex) => {
    const author = candidateAuthors[rootIndex];
    const rootPageID = `page-${slugify(rootTitle)}`;
    const rootContent = [
      `# ${rootTitle}`,
      "",
      `This section collects reference material for #${rootTags[0]} and #${rootTags[1]} across Northstar Software.`,
      "",
      "## Coverage",
      "",
      `- #${rootTags[0]} operating model`,
      `- #${rootTags[1]} ownership`,
      `- #${rootTags[2]} delivery notes`
    ].join("\n");

    pages.push({
      id: rootPageID,
      slug: slugify(rootTitle),
      title: rootTitle,
      parentPageID: null,
      content: rootContent,
      createdAt: at(rootIndex, 9, 0),
      updatedAt: at(rootIndex, 11, 30),
      createdByUserID: author.id,
      updatedByUserID: author.id
    });

    revisions.push(
      {
        id: `rev-${rootPageID}-1`,
        pageID: rootPageID,
        version: 1,
        title: rootTitle,
        slug: slugify(rootTitle),
        parentPageID: null,
        content: `# ${rootTitle}\n\nInitial notes for #${rootTags[0]} and #${rootTags[1]}.`,
        authorUserID: author.id,
        createdAt: at(rootIndex, 9, 0),
        summary: "Page created."
      },
      {
        id: `rev-${rootPageID}-2`,
        pageID: rootPageID,
        version: 2,
        title: rootTitle,
        slug: slugify(rootTitle),
        parentPageID: null,
        content: rootContent,
        authorUserID: author.id,
        createdAt: at(rootIndex, 11, 30),
        summary: "Expanded reference coverage."
      }
    );

    for (let childIndex = 0; childIndex < 5; childIndex += 1) {
      const title = `${rootTitle} ${childIndex + 1}`;
      const tags = pickTags(rootTags, 3);
      const pageID = `page-${slugify(`${rootTitle}-${childIndex + 1}`)}`;
      const childAuthor = candidateAuthors[(rootIndex + childIndex + 3) % candidateAuthors.length];
      const content = [
        `# ${title}`,
        "",
        `This article explains how Northstar teams approach #${tags[0]}, #${tags[1]} and #${tags[2]}.`,
        "",
        "## Key points",
        "",
        `- coordinate #${tags[0]} ownership`,
        `- review #${tags[1]} signals weekly`,
        `- document #${tags[2]} learnings after each release`
      ].join("\n");

      pages.push({
        id: pageID,
        slug: slugify(title),
        title,
        parentPageID: rootPageID,
        content,
        createdAt: at(rootIndex + childIndex + 1, 10, childIndex * 6),
        updatedAt: at(rootIndex + childIndex + 2, 15, childIndex * 7),
        createdByUserID: childAuthor.id,
        updatedByUserID: childAuthor.id
      });

      revisions.push(
        {
          id: `rev-${pageID}-1`,
          pageID,
          version: 1,
          title,
          slug: slugify(title),
          parentPageID: rootPageID,
          content: `# ${title}\n\nInitial notes on #${tags[0]}.`,
          authorUserID: childAuthor.id,
          createdAt: at(rootIndex + childIndex + 1, 10, childIndex * 6),
          summary: "Page created."
        },
        {
          id: `rev-${pageID}-2`,
          pageID,
          version: 2,
          title,
          slug: slugify(title),
          parentPageID: rootPageID,
          content,
          authorUserID: childAuthor.id,
          createdAt: at(rootIndex + childIndex + 2, 15, childIndex * 7),
          summary: "Added operating guidance."
        }
      );
    }
  });

  return {
    snapshot: {
      workspace: workspaceBundle.snapshot
    },
    pages,
    revisions,
    syncStatus: {
      source: "generated",
      lastSyncAt: new Date().toISOString(),
      lastSyncSucceeded: true,
      lastError: null
    }
  };
}

function buildDocsCatalog(docsState) {
  return docsState.pages.flatMap((page) => {
    const tags = extractTags(page.content);
    if (!tags.length) return [];
    return [{
      source: "xdoc",
      kind: "page",
      id: page.id,
      pageID: page.id,
      title: page.title,
      excerpt: page.content.split("\n").find((line) => line.trim() && !line.trim().startsWith("#")) || "Page content contains the requested tag.",
      slug: page.slug,
      tags,
      matches: [{ field: "content", value: page.content }]
    }];
  });
}

function buildBacklogCatalog(backlogState) {
  const projectMap = new Map(backlogState.board.projects.map((project) => [project.id, project]));
  return backlogState.board.tasks.flatMap((task) => {
    const project = projectMap.get(task.projectID);
    const taskComments = backlogState.board.comments.filter((comment) => comment.taskID === task.id);
    const matches = [
      { field: "title", value: task.title },
      { field: "description", value: task.description },
      ...taskComments.map((comment) => ({
        field: "comment",
        value: comment.body,
        commentID: comment.id,
        authorUserID: comment.authorUserID,
        createdAt: comment.createdAt
      }))
    ];
    const tags = [...new Set(matches.flatMap((match) => extractTags(match.value)))];
    if (!tags.length) return [];
    return [{
      source: "xbacklog",
      kind: "task",
      id: task.id,
      title: task.title,
      excerpt: task.description || taskComments[0]?.body || "Task contains the requested tag.",
      projectID: task.projectID,
      projectName: project?.name || task.projectID,
      teamID: project?.teamID || null,
      taskID: task.id,
      tags,
      matches
    }];
  });
}

function buildTalkCatalog(talkState) {
  const roomItems = talkState.rooms.flatMap((room) => {
    const matches = talkState.roomMessages
      .filter((message) => message.conversationID === room.id)
      .filter((message) => extractTags(message.body).length)
      .map((message) => ({
        field: "message",
        value: message.body,
        messageID: message.id,
        authorUserID: message.authorUserID,
        createdAt: message.createdAt
      }));
    const tags = [...new Set(matches.flatMap((match) => extractTags(match.value)))];
    if (!tags.length) return [];
    return [{
      source: "xtalk",
      kind: "room",
      id: room.id,
      conversationID: room.id,
      title: room.name,
      excerpt: matches.at(-1)?.value || "Conversation contains the requested tag.",
      teamID: room.teamID,
      tags,
      matches
    }];
  });

  const directItems = talkState.directConversations.flatMap((conversation) => {
    const matches = talkState.directMessages
      .filter((message) => message.conversationID === conversation.id)
      .filter((message) => extractTags(message.body).length)
      .map((message) => ({
        field: "message",
        value: message.body,
        messageID: message.id,
        authorUserID: message.authorUserID,
        createdAt: message.createdAt
      }));
    const tags = [...new Set(matches.flatMap((match) => extractTags(match.value)))];
    if (!tags.length) return [];
    const title = conversation.participantUserIDs
      .map((userID) => users.find((user) => user.id === userID)?.displayName || userID)
      .join(" / ");
    return [{
      source: "xtalk",
      kind: "direct",
      id: conversation.id,
      conversationID: conversation.id,
      title,
      excerpt: matches.at(-1)?.value || "Direct conversation contains the requested tag.",
      participantUserIDs: conversation.participantUserIDs,
      tags,
      matches
    }];
  });

  return [...roomItems, ...directItems];
}

function buildDashboard(workspaceBundle, backlogState) {
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
      workspace: workspaceBundle.snapshot,
      backlog: {
        projects: backlogState.board.projects,
        tasks: backlogState.board.tasks,
        comments: backlogState.board.comments,
        taskEvents: backlogState.board.taskEvents
      }
    },
    syncStatus: {
      sources: {
        xgroup: "generated",
        xbacklog: "generated"
      },
      lastSyncAt: new Date().toISOString(),
      lastSyncSucceeded: true,
      lastError: null
    }
  };
}

async function main() {
  const workspaceBundle = buildWorkspace();
  const backlogState = buildBacklog(workspaceBundle);
  const talkState = buildTalk(workspaceBundle);
  const docsState = buildDocs(workspaceBundle);
  const dashboardState = buildDashboard(workspaceBundle, backlogState);

  const tagPayloads = [
    { source: "xbacklog", items: buildBacklogCatalog(backlogState) },
    { source: "xtalk", items: buildTalkCatalog(talkState) },
    { source: "xdoc", items: buildDocsCatalog(docsState) }
  ];
  const tagIndex = buildTagIndex(tagPayloads, {});
  const xtagState = {
    workspace: workspaceBundle.snapshot,
    aliases: {},
    index: {
      ...tagIndex,
      sources: tagPayloads.map((payload) => ({
        id: payload.source,
        itemCount: payload.items.length
      })),
      refreshedAt: new Date().toISOString()
    },
    syncStatus: {
      sources: {
        xbacklog: "generated",
        xtalk: "generated",
        xdoc: "generated"
      },
      lastSyncAt: new Date().toISOString(),
      lastSyncSucceeded: true,
      lastError: null
    }
  };

  await stores.xgroup.save({
    snapshot: workspaceBundle.snapshot,
    events: workspaceBundle.events,
    invitations
  });
  await stores.xbacklog.save(backlogState);
  await stores.xdashboard.save(dashboardState);
  await stores.xtalk.save(talkState);
  await stores.xdoc.save(docsState);
  await stores.xtag.save(xtagState);
  await stores.sessions.save({ sessions: {} });

  console.log("Platform data reset complete.");
  console.log(JSON.stringify({
    organization: workspaceBundle.snapshot.organization.name,
    users: workspaceBundle.snapshot.users.length,
    teams: workspaceBundle.snapshot.teams.length,
    memberships: workspaceBundle.snapshot.memberships.length,
    projects: backlogState.board.projects.length,
    tasks: backlogState.board.tasks.length,
    backlogComments: backlogState.board.comments.length,
    rooms: talkState.rooms.length,
    roomMessages: talkState.roomMessages.length,
    directConversations: talkState.directConversations.length,
    directMessages: talkState.directMessages.length,
    docsPages: docsState.pages.length,
    docsRevisions: docsState.revisions.length,
    indexedTags: xtagState.index.tags.length,
    indexedItems: xtagState.index.items.length
  }, null, 2));
}

await main();
