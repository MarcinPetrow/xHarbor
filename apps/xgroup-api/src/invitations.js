import { slugify } from "@xharbor/contracts";

function localPart(email) {
  return email.split("@")[0] ?? email;
}

export function createInvitation(state, { email, displayName, teamID, role }) {
  const existingPending = state.invitations.find((invitation) =>
    invitation.email === email &&
    invitation.teamID === teamID &&
    invitation.status === "pending"
  );
  if (existingPending) {
    throw new Error(`Pending invitation already exists for ${email} in ${teamID}`);
  }

  const invitation = {
    id: `invite-${slugify(`${email}-${teamID}`)}-${Date.now()}`,
    email,
    displayName,
    teamID,
    role,
    status: "pending",
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    acceptedUserID: null,
    revokedAt: null
  };
  state.invitations.push(invitation);
  return invitation;
}

export function resolveProvisionedUser(state, invitation, acceptedDisplayName) {
  const existingUser = state.snapshot.users.find((user) => user.email === invitation.email);
  if (existingUser) {
    return existingUser;
  }

  const baseID = `user-${slugify(acceptedDisplayName || invitation.displayName || localPart(invitation.email))}`;
  const candidateIDs = new Set(state.snapshot.users.map((user) => user.id));
  let userID = baseID;
  if (candidateIDs.has(userID)) {
    userID = `${baseID}-${Date.now()}`;
  }

  const user = {
    id: userID,
    displayName: acceptedDisplayName || invitation.displayName || localPart(invitation.email),
    firstName: acceptedDisplayName || invitation.displayName || localPart(invitation.email),
    lastName: "",
    nickname: null,
    department: "",
    title: "",
    managerUserID: null,
    avatarDataURL: null,
    email: invitation.email,
    status: "active"
  };
  state.snapshot.users.push(user);
  return user;
}

export function acceptInvitation(state, invitationID, acceptedDisplayName, createMembership) {
  const invitation = state.invitations.find((item) => item.id === invitationID);
  if (!invitation) {
    throw new Error(`Unknown invitation: ${invitationID}`);
  }
  if (invitation.status !== "pending") {
    throw new Error(`Invitation is not pending: ${invitationID}`);
  }

  const user = resolveProvisionedUser(state, invitation, acceptedDisplayName);
  createMembership(state, user.id, invitation.teamID, invitation.role);

  invitation.status = "accepted";
  invitation.acceptedAt = new Date().toISOString();
  invitation.acceptedUserID = user.id;
  return { invitation, user };
}

export function revokeInvitation(state, invitationID) {
  const invitation = state.invitations.find((item) => item.id === invitationID);
  if (!invitation) {
    throw new Error(`Unknown invitation: ${invitationID}`);
  }
  if (invitation.status !== "pending") {
    throw new Error(`Invitation is not pending: ${invitationID}`);
  }
  invitation.status = "revoked";
  invitation.revokedAt = new Date().toISOString();
  return invitation;
}
