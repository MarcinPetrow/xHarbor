import { TASK_STATUSES } from "@xharbor/contracts";

export function assertKnownTaskStatus(status) {
  if (!TASK_STATUSES.includes(status)) {
    throw new Error(`Unknown task status: ${status}`);
  }
}

export function nextCommentID(taskID, comments) {
  return `comment-${taskID}-${comments.filter((comment) => comment.taskID === taskID).length + 1}`;
}

export function nextTaskEventID(taskID, taskEvents) {
  return `task-event-${taskID}-${taskEvents.filter((event) => event.taskID === taskID).length + 1}`;
}

export function statusLabel(status) {
  if (status === "new") return "New";
  if (status === "in_progress") return "In Progress";
  if (status === "done") return "Done";
  return status;
}

export function transitionTask(task, nextStatus, actorUserID, taskEvents) {
  assertKnownTaskStatus(nextStatus);
  const previousStatus = task.status;
  if (previousStatus === nextStatus) {
    return null;
  }

  const now = new Date().toISOString();
  task.status = nextStatus;
  task.updatedAt = now;
  task.completedAt = nextStatus === "done" ? now : null;

  const event = {
    id: nextTaskEventID(task.id, taskEvents),
    taskID: task.id,
    type: "task.status.changed",
    actorUserID,
    createdAt: now,
    detail: `Status changed from ${statusLabel(previousStatus)} to ${statusLabel(nextStatus)}.`
  };
  taskEvents.push(event);
  return event;
}

export function recordTaskCreated(task, actorUserID, taskEvents) {
  taskEvents.push({
    id: nextTaskEventID(task.id, taskEvents),
    taskID: task.id,
    type: "task.created",
    actorUserID,
    createdAt: task.createdAt,
    detail: "Task created."
  });
}

export function recordTaskUpdated(task, actorUserID, taskEvents, detail) {
  taskEvents.push({
    id: nextTaskEventID(task.id, taskEvents),
    taskID: task.id,
    type: "task.updated",
    actorUserID,
    createdAt: task.updatedAt,
    detail
  });
}

export function recordTaskCommented(taskID, actorUserID, createdAt, taskEvents) {
  taskEvents.push({
    id: nextTaskEventID(taskID, taskEvents),
    taskID,
    type: "task.comment.created",
    actorUserID,
    createdAt,
    detail: "Comment added."
  });
}
