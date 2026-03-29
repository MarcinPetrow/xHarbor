import Foundation

public struct XTalkAPIConfiguration: Sendable {
    public var xgroupBaseURL: URL
    public var xtalkBaseURL: URL

    public init(
        xgroupBaseURL: URL = URL(string: "http://127.0.0.1:8080")!,
        xtalkBaseURL: URL = URL(string: "http://127.0.0.1:8083")!
    ) {
        self.xgroupBaseURL = xgroupBaseURL
        self.xtalkBaseURL = xtalkBaseURL
    }
}

public enum XTalkAPIError: Error, LocalizedError, Sendable {
    case invalidResponse
    case http(statusCode: Int, message: String)

    public var errorDescription: String? {
        switch self {
        case .invalidResponse:
            return "Invalid response from server."
        case let .http(statusCode, message):
            return "HTTP \(statusCode): \(message)"
        }
    }
}

public final class XTalkAPIClient: @unchecked Sendable {
    private let configuration: XTalkAPIConfiguration
    private let session: URLSession
    private let decoder: JSONDecoder
    private let encoder: JSONEncoder

    public init(configuration: XTalkAPIConfiguration = XTalkAPIConfiguration()) {
        self.configuration = configuration
        let sessionConfiguration = URLSessionConfiguration.default
        sessionConfiguration.httpCookieStorage = HTTPCookieStorage.shared
        sessionConfiguration.httpShouldSetCookies = true
        self.session = URLSession(configuration: sessionConfiguration)
        self.decoder = JSONDecoder()
        self.encoder = JSONEncoder()
    }

    public func fetchUsers() async throws -> [XTalkUser] {
        try await get(path: "/api/users", baseURL: configuration.xgroupBaseURL)
    }

    public func fetchSession() async throws -> XTalkSessionResponse {
        try await get(path: "/api/session", baseURL: configuration.xgroupBaseURL)
    }

    public func fetchPresence() async throws -> [XTalkPresenceEntry] {
        try await get(path: "/api/presence", baseURL: configuration.xgroupBaseURL)
    }

    public func signIn(userID: String) async throws -> XTalkSessionResponse {
        try await request(
            path: "/api/session",
            baseURL: configuration.xgroupBaseURL,
            method: "POST",
            body: ["userID": userID]
        )
    }

    public func signOut() async throws {
        let (data, response) = try await rawRequest(
            path: "/api/session",
            baseURL: configuration.xgroupBaseURL,
            method: "DELETE",
            bodyData: nil
        )
        try validate(response: response, data: data)
    }

    public func updatePresence(_ presence: XTalkPresence) async throws {
        let (data, response) = try await rawRequest(
            path: "/api/session/presence",
            baseURL: configuration.xgroupBaseURL,
            method: "POST",
            bodyData: try encoder.encode(["presence": presence.rawValue])
        )
        try validate(response: response, data: data)
    }

    public func fetchChat() async throws -> XTalkChatPayload {
        try await get(path: "/api/chat", baseURL: configuration.xtalkBaseURL)
    }

    public func refreshWorkspace() async throws -> XTalkSyncStatus {
        try await request(path: "/api/chat/refresh-workspace", baseURL: configuration.xtalkBaseURL, method: "POST", body: Optional<[String: String]>.none)
    }

    public func createRoom(name: String, teamID: String) async throws -> XTalkRoom {
        try await request(path: "/api/rooms", baseURL: configuration.xtalkBaseURL, method: "POST", body: ["name": name, "teamID": teamID])
    }

    public func createDirectConversation(participantUserID: String) async throws -> XTalkDirectConversation {
        try await request(
            path: "/api/direct-conversations",
            baseURL: configuration.xtalkBaseURL,
            method: "POST",
            body: ["participantUserID": participantUserID]
        )
    }

    public func postRoomMessage(roomID: String, body: String) async throws -> XTalkMessage {
        try await request(
            path: "/api/rooms/\(roomID)/messages",
            baseURL: configuration.xtalkBaseURL,
            method: "POST",
            body: ["body": body]
        )
    }

    public func postDirectMessage(conversationID: String, body: String) async throws -> XTalkMessage {
        try await request(
            path: "/api/direct-conversations/\(conversationID)/messages",
            baseURL: configuration.xtalkBaseURL,
            method: "POST",
            body: ["body": body]
        )
    }

    public func markRoomRead(roomID: String) async throws {
        let (data, response) = try await rawRequest(
            path: "/api/rooms/\(roomID)/read",
            baseURL: configuration.xtalkBaseURL,
            method: "POST",
            bodyData: try encoder.encode([String: String]())
        )
        try validate(response: response, data: data)
    }

    public func markDirectConversationRead(conversationID: String) async throws {
        let (data, response) = try await rawRequest(
            path: "/api/direct-conversations/\(conversationID)/read",
            baseURL: configuration.xtalkBaseURL,
            method: "POST",
            bodyData: try encoder.encode([String: String]())
        )
        try validate(response: response, data: data)
    }

    private func get<Response: Decodable>(
        path: String,
        baseURL: URL
    ) async throws -> Response {
        let (data, response) = try await rawRequest(path: path, baseURL: baseURL, method: "GET", bodyData: nil)
        try validate(response: response, data: data)
        return try decoder.decode(Response.self, from: data)
    }

    private func request<Response: Decodable, Body: Encodable>(
        path: String,
        baseURL: URL,
        method: String = "GET",
        body: Body? = nil
    ) async throws -> Response {
        let bodyData = try body.map { try encoder.encode($0) }
        let (data, response) = try await rawRequest(path: path, baseURL: baseURL, method: method, bodyData: bodyData)
        try validate(response: response, data: data)
        return try decoder.decode(Response.self, from: data)
    }

    private func rawRequest(
        path: String,
        baseURL: URL,
        method: String,
        bodyData: Data?
    ) async throws -> (Data, URLResponse) {
        var request = URLRequest(url: baseURL.appending(path: path))
        request.httpMethod = method

        if let bodyData {
            request.httpBody = bodyData
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        return try await session.data(for: request)
    }

    private func validate(response: URLResponse, data: Data) throws {
        guard let httpResponse = response as? HTTPURLResponse else {
            throw XTalkAPIError.invalidResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let message = String(data: data, encoding: .utf8) ?? "Request failed"
            throw XTalkAPIError.http(statusCode: httpResponse.statusCode, message: message)
        }
    }
}
