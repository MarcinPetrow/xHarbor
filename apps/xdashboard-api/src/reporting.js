export function buildDashboardPayload(state) {
  const { workspace, backlog } = state.snapshot;
  const { teams, users, memberships } = workspace;
  const { projects, tasks, comments = [], taskEvents = [] } = backlog;

  const assignedTasks = tasks.filter((task) => task.assigneeUserID);
  const unassignedTasks = tasks.filter((task) => !task.assigneeUserID);
  const inProgressTasks = tasks.filter((task) => task.status === "in_progress");
  const doneTasks = tasks.filter((task) => task.status === "done");
  const newTasks = tasks.filter((task) => task.status === "new");
  const statusBreakdown = [
    { id: "new", label: "New", count: newTasks.length },
    { id: "in_progress", label: "In Progress", count: inProgressTasks.length },
    { id: "done", label: "Done", count: doneTasks.length }
  ];

  const teamCards = teams.map((team) => {
    const teamProjects = projects.filter((project) => project.teamID === team.id);
    const projectIDs = new Set(teamProjects.map((project) => project.id));
    const teamMemberships = memberships.filter((membership) => membership.teamID === team.id);
    const teamTasks = tasks.filter((task) => projectIDs.has(task.projectID));
    const assignedCount = teamTasks.filter((task) => task.assigneeUserID).length;
    const doneCount = teamTasks.filter((task) => task.status === "done").length;
    const commentCount = comments.filter((comment) =>
      teamTasks.some((task) => task.id === comment.taskID)
    ).length;

    return {
      id: team.id,
      name: team.name,
      memberCount: teamMemberships.length,
      projectCount: teamProjects.length,
      taskCount: teamTasks.length,
      assignedTaskCount: assignedCount,
      unassignedTaskCount: teamTasks.length - assignedCount,
      blockedTaskCount: 0,
      doneTaskCount: doneCount,
      commentCount
    };
  });

  const userCards = users.map((user) => {
    const assigned = tasks.filter((task) => task.assigneeUserID === user.id);

    return {
      id: user.id,
      displayName: user.displayName,
      email: user.email,
      roles: memberships
        .filter((membership) => membership.userID === user.id)
        .map((membership) => membership.role),
      assignedTaskCount: assigned.length,
      blockedTaskCount: 0,
      completedTaskCount: assigned.filter((task) => task.status === "done").length
    };
  });

  const blockedTaskCards = [];

  const recentComments = comments
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 6)
    .map((comment) => {
      const author = users.find((item) => item.id === comment.authorUserID);
      const task = tasks.find((item) => item.id === comment.taskID);
      return {
        id: comment.id,
        body: comment.body,
        createdAt: comment.createdAt,
        authorUserID: comment.authorUserID,
        authorName: author?.displayName ?? comment.authorUserID,
        taskTitle: task?.title ?? comment.taskID
      };
    });

  const recentTaskChanges = taskEvents
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 8)
    .map((event) => {
      const author = users.find((item) => item.id === event.actorUserID);
      const task = tasks.find((item) => item.id === event.taskID);
      const project = task ? projects.find((item) => item.id === task.projectID) : null;
      return {
        id: event.id,
        type: event.type,
        detail: event.detail,
        createdAt: event.createdAt,
        actorUserID: event.actorUserID,
        actorName: author?.displayName ?? event.actorUserID,
        taskTitle: task?.title ?? event.taskID,
        projectName: project?.name ?? task?.projectID ?? "Unknown project"
      };
    });

  const recentlyCompletedTasks = tasks
    .filter((task) => task.completedAt)
    .slice()
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt))
    .slice(0, 6)
    .map((task) => {
      const project = projects.find((item) => item.id === task.projectID);
      const assignee = users.find((item) => item.id === task.assigneeUserID);
      return {
        id: task.id,
        title: task.title,
        completedAt: task.completedAt,
        projectName: project?.name ?? task.projectID,
        assigneeUserID: task.assigneeUserID ?? null,
        assigneeName: assignee?.displayName ?? "Unassigned"
      };
    });

  const risks = [
    ...unassignedTasks.map((task) => ({
      id: `risk-unassigned-${task.id}`,
      level: "medium",
      title: `Unassigned task: ${task.title}`,
      detail: `Task ${task.id} in project ${task.projectID} has no owner.`
    })),
    ...teamCards
      .filter((team) => team.projectCount === 0)
      .map((team) => ({
        id: `risk-team-${team.id}`,
        level: "high",
        title: `Team without project: ${team.name}`,
        detail: `${team.name} has active members but no connected backlog project.`
      }))
  ];

  return {
    reports: state.reports,
    summary: {
      organizationName: workspace.organization.name,
      teamCount: teams.length,
      userCount: users.length,
      membershipCount: memberships.length,
      projectCount: projects.length,
      taskCount: tasks.length,
      assignedTaskCount: assignedTasks.length,
      unassignedTaskCount: unassignedTasks.length,
      blockedTaskCount: 0,
      completedTaskCount: doneTasks.length,
      commentCount: comments.length,
      taskEventCount: taskEvents.length
    },
    statusBreakdown,
    teamCards,
    userCards,
    blockedTaskCards,
    recentComments,
    recentTaskChanges,
    recentlyCompletedTasks,
    risks,
    syncStatus: state.syncStatus
  };
}
