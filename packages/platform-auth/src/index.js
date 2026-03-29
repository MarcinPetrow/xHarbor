export class AuthorizationError extends Error {
  constructor(statusCode, message) {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = statusCode;
  }
}

export const permissions = {
  manageDirectory: "manageDirectory",
  manageBacklog: "manageBacklog",
  viewDashboard: "viewDashboard",
  createProject: (teamID) => ({ type: "createProject", teamID }),
  createTask: (teamID) => ({ type: "createTask", teamID })
};

export function authorize(snapshot, actingUserID, permission) {
  if (!actingUserID) {
    throw new AuthorizationError(401, "Missing acting user. Pass X-User-ID header.");
  }

  const user = snapshot.users.find((item) => item.id === actingUserID);
  if (!user) {
    throw new AuthorizationError(401, `Unknown acting user: ${actingUserID}`);
  }
  if (user.status && user.status !== "active") {
    throw new AuthorizationError(403, `Inactive acting user: ${actingUserID}`);
  }

  const memberships = snapshot.memberships.filter((item) => item.userID === actingUserID);
  const canManageDirectory = memberships.some((item) => item.role === "owner" || item.role === "admin");
  const canManageBacklog = memberships.some((item) => item.role === "owner" || item.role === "admin" || item.role === "manager");

  if (permission === permissions.manageDirectory && !canManageDirectory) {
    throw new AuthorizationError(403, "Forbidden for permission: manageDirectory");
  }

  if (permission === permissions.manageBacklog && !canManageBacklog) {
    throw new AuthorizationError(403, "Forbidden for permission: manageBacklog");
  }

  if (permission === permissions.viewDashboard) {
    return user;
  }

  if (permission?.type === "createProject" || permission?.type === "createTask") {
    const allowed = memberships.some((item) =>
      item.teamID === permission.teamID &&
      (item.role === "owner" || item.role === "admin" || item.role === "manager")
    );

    if (!allowed) {
      throw new AuthorizationError(403, `Forbidden for permission: ${permission.type}(${permission.teamID})`);
    }
  }

  return user;
}
