import test from "node:test";
import assert from "node:assert/strict";
import { createDemoWorkspace } from "@xharbor/contracts";
import { createMembership } from "../src/admin.js";
import { acceptInvitation, createInvitation, revokeInvitation } from "../src/invitations.js";

function stateWithInvitations() {
  return {
    ...createDemoWorkspace(),
    invitations: []
  };
}

test("createInvitation adds pending invitation", () => {
  const state = stateWithInvitations();
  const invitation = createInvitation(state, {
    email: "ewa@xharbor.dev",
    displayName: "Ewa",
    teamID: "team-core",
    role: "member"
  });

  assert.equal(invitation.status, "pending");
  assert.equal(state.invitations.length, 1);
});

test("acceptInvitation provisions user and membership", () => {
  const state = stateWithInvitations();
  const invitation = createInvitation(state, {
    email: "ewa@xharbor.dev",
    displayName: "Ewa",
    teamID: "team-core",
    role: "member"
  });
  const result = acceptInvitation(state, invitation.id, "Ewa Nowak", createMembership);

  assert.equal(result.invitation.status, "accepted");
  assert.equal(result.user.email, "ewa@xharbor.dev");
  assert.equal(state.snapshot.memberships.some((item) => item.userID === result.user.id && item.teamID === "team-core"), true);
});

test("revokeInvitation marks invitation as revoked", () => {
  const state = stateWithInvitations();
  const invitation = createInvitation(state, {
    email: "ewa@xharbor.dev",
    displayName: "Ewa",
    teamID: "team-core",
    role: "member"
  });
  const revoked = revokeInvitation(state, invitation.id);

  assert.equal(revoked.status, "revoked");
  assert.equal(revoked.revokedAt !== null, true);
});
