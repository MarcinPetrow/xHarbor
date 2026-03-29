import Foundation

public struct XTalkOrganization: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public var name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
    }
}

public struct XTalkUser: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public var displayName: String
    public var email: String

    public init(id: String, displayName: String, email: String) {
        self.id = id
        self.displayName = displayName
        self.email = email
    }
}

public enum XTalkPresence: String, Codable, Equatable, Sendable {
    case offline
    case brb
    case online
}

public struct XTalkPresenceEntry: Codable, Equatable, Sendable {
    public var userID: String
    public var status: String
    public var presence: XTalkPresence
    public var isOnline: Bool

    public init(userID: String, status: String, presence: XTalkPresence, isOnline: Bool) {
        self.userID = userID
        self.status = status
        self.presence = presence
        self.isOnline = isOnline
    }
}

public struct XTalkTeamMembership: Codable, Equatable, Sendable {
    public var userID: String
    public var teamID: String
    public var role: String

    public init(userID: String, teamID: String, role: String) {
        self.userID = userID
        self.teamID = teamID
        self.role = role
    }
}

public struct XTalkTeam: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public var organizationID: String
    public var name: String

    public init(id: String, organizationID: String, name: String) {
        self.id = id
        self.organizationID = organizationID
        self.name = name
    }
}

public struct XTalkWorkspaceSnapshot: Codable, Equatable, Sendable {
    public var organization: XTalkOrganization
    public var teams: [XTalkTeam]
    public var users: [XTalkUser]
    public var memberships: [XTalkTeamMembership]

    public init(organization: XTalkOrganization, teams: [XTalkTeam], users: [XTalkUser], memberships: [XTalkTeamMembership]) {
        self.organization = organization
        self.teams = teams
        self.users = users
        self.memberships = memberships
    }
}

public struct XTalkRoom: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public var teamID: String
    public var name: String

    public init(id: String, teamID: String, name: String) {
        self.id = id
        self.teamID = teamID
        self.name = name
    }
}

public struct XTalkDirectConversation: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public var participantUserIDs: [String]

    public init(id: String, participantUserIDs: [String]) {
        self.id = id
        self.participantUserIDs = participantUserIDs
    }
}

public struct XTalkMessage: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public var conversationID: String
    public var authorUserID: String
    public var body: String
    public var createdAt: String

    public init(id: String, conversationID: String, authorUserID: String, body: String, createdAt: String) {
        self.id = id
        self.conversationID = conversationID
        self.authorUserID = authorUserID
        self.body = body
        self.createdAt = createdAt
    }
}

public struct XTalkSyncStatus: Codable, Equatable, Sendable {
    public var source: String
    public var lastSyncAt: String?
    public var lastSyncSucceeded: Bool
    public var lastError: String?

    public init(source: String, lastSyncAt: String?, lastSyncSucceeded: Bool, lastError: String?) {
        self.source = source
        self.lastSyncAt = lastSyncAt
        self.lastSyncSucceeded = lastSyncSucceeded
        self.lastError = lastError
    }
}

public struct XTalkChatPayload: Codable, Equatable, Sendable {
    public var workspace: XTalkWorkspaceSnapshot
    public var rooms: [XTalkRoom]
    public var archivedRooms: [XTalkRoom]
    public var roomMessages: [XTalkMessage]
    public var directConversations: [XTalkDirectConversation]
    public var directMessages: [XTalkMessage]
    public var roomUnread: [String: Int]
    public var directUnread: [String: Int]
    public var syncStatus: XTalkSyncStatus

    public init(
        workspace: XTalkWorkspaceSnapshot,
        rooms: [XTalkRoom],
        archivedRooms: [XTalkRoom] = [],
        roomMessages: [XTalkMessage],
        directConversations: [XTalkDirectConversation],
        directMessages: [XTalkMessage],
        roomUnread: [String: Int] = [:],
        directUnread: [String: Int] = [:],
        syncStatus: XTalkSyncStatus
    ) {
        self.workspace = workspace
        self.rooms = rooms
        self.archivedRooms = archivedRooms
        self.roomMessages = roomMessages
        self.directConversations = directConversations
        self.directMessages = directMessages
        self.roomUnread = roomUnread
        self.directUnread = directUnread
        self.syncStatus = syncStatus
    }
}

public struct XTalkSessionResponse: Codable, Equatable, Sendable {
    public var authenticated: Bool
    public var user: XTalkUser?
    public var expiresAt: String?

    public init(authenticated: Bool, user: XTalkUser?, expiresAt: String? = nil) {
        self.authenticated = authenticated
        self.user = user
        self.expiresAt = expiresAt
    }
}

public extension XTalkChatPayload {
    func roles(for userID: String) -> [String] {
        workspace.memberships
            .filter { $0.userID == userID }
            .map(\.role)
    }

    func roomMessages(for roomID: String) -> [XTalkMessage] {
        roomMessages.filter { $0.conversationID == roomID }
    }

    func directMessages(for conversationID: String) -> [XTalkMessage] {
        directMessages.filter { $0.conversationID == conversationID }
    }

    func directConversationTitle(for conversationID: String, currentUserID: String) -> String {
        guard
            let conversation = directConversations.first(where: { $0.id == conversationID }),
            let partnerID = conversation.participantUserIDs.first(where: { $0 != currentUserID }),
            let partner = workspace.users.first(where: { $0.id == partnerID })
        else {
            return conversationID
        }

        return partner.displayName
    }

    func directConversationPartnerID(for conversationID: String, currentUserID: String) -> String? {
        directConversations
            .first(where: { $0.id == conversationID })?
            .participantUserIDs
            .first(where: { $0 != currentUserID })
    }
}
