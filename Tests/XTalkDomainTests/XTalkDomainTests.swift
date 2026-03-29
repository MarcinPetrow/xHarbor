import Testing
@testable import XTalkDomain

@Test
func directConversationTitleUsesPartnerName() {
    let payload = XTalkChatPayload(
        workspace: XTalkWorkspaceSnapshot(
            organization: XTalkOrganization(id: "org-xharbor", name: "xHarbor"),
            teams: [],
            users: [
                XTalkUser(id: "user-marcin", displayName: "Marcin", email: "marcin@xharbor.dev"),
                XTalkUser(id: "user-anna", displayName: "Anna", email: "anna@xharbor.dev")
            ],
            memberships: []
        ),
        rooms: [],
        roomMessages: [],
        directConversations: [
            XTalkDirectConversation(id: "dm-user-anna-user-marcin", participantUserIDs: ["user-anna", "user-marcin"])
        ],
        directMessages: [],
        syncStatus: XTalkSyncStatus(source: "test", lastSyncAt: nil, lastSyncSucceeded: true, lastError: nil)
    )

    #expect(payload.directConversationTitle(for: "dm-user-anna-user-marcin", currentUserID: "user-marcin") == "Anna")
}

@Test
func rolesFiltersMembershipsForUser() {
    let payload = XTalkChatPayload(
        workspace: XTalkWorkspaceSnapshot(
            organization: XTalkOrganization(id: "org-xharbor", name: "xHarbor"),
            teams: [],
            users: [],
            memberships: [
                XTalkTeamMembership(userID: "user-marcin", teamID: "team-core", role: "owner"),
                XTalkTeamMembership(userID: "user-marcin", teamID: "team-product", role: "manager"),
                XTalkTeamMembership(userID: "user-anna", teamID: "team-product", role: "member")
            ]
        ),
        rooms: [],
        roomMessages: [],
        directConversations: [],
        directMessages: [],
        syncStatus: XTalkSyncStatus(source: "test", lastSyncAt: nil, lastSyncSucceeded: true, lastError: nil)
    )

    #expect(payload.roles(for: "user-marcin") == ["owner", "manager"])
}
