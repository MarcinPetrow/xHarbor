public enum ConversationKind: String, Sendable {
    case room
    case direct
}

public struct Conversation: Identifiable, Equatable, Sendable {
    public let id: String
    public var name: String
    public var kind: ConversationKind

    public init(id: String, name: String, kind: ConversationKind) {
        self.id = id
        self.name = name
        self.kind = kind
    }
}
