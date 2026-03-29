import { TEAM_ROLES, USER_STATUSES } from "@xharbor/contracts";

export function assertKnownRole(role) {
  if (!TEAM_ROLES.includes(role)) {
    throw new Error("Invalid team role");
  }
}

export function assertKnownUserStatus(status) {
  if (!USER_STATUSES.includes(status)) {
    throw new Error("Invalid user status");
  }
}

export function findTeam(state, teamID) {
  return state.snapshot.teams.find((team) => team.id === teamID) ?? null;
}

export function findUser(state, userID) {
  return state.snapshot.users.find((user) => user.id === userID) ?? null;
}

export function membershipsForUser(state, userID) {
  return state.snapshot.memberships.filter((membership) => membership.userID === userID);
}

export function findMembership(state, userID, teamID) {
  return state.snapshot.memberships.find((membership) => membership.userID === userID && membership.teamID === teamID) ?? null;
}

export function teamMembershipCount(state, teamID) {
  return state.snapshot.memberships.filter((membership) => membership.teamID === teamID).length;
}

export function createMembership(state, userID, teamID, role) {
  if (findMembership(state, userID, teamID)) {
    throw new Error(`Membership already exists for ${userID} in ${teamID}`);
  }

  state.snapshot.memberships.push({ userID, teamID, role });
}

export function updateMembershipRole(state, userID, teamID, role) {
  const membership = findMembership(state, userID, teamID);
  if (!membership) {
    throw new Error(`Unknown membership for ${userID} in ${teamID}`);
  }

  membership.role = role;
}

export function removeMembership(state, userID, teamID) {
  const originalLength = state.snapshot.memberships.length;
  state.snapshot.memberships = state.snapshot.memberships.filter((membership) => !(membership.userID === userID && membership.teamID === teamID));
  return state.snapshot.memberships.length !== originalLength;
}

export function updateUserMembership(state, userID, teamID, role) {
  const membership = state.snapshot.memberships.find((item) => item.userID === userID);
  if (membership) {
    membership.teamID = teamID;
    membership.role = role;
    return;
  }

  state.snapshot.memberships.push({ userID, teamID, role });
}
