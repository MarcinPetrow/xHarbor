#if os(macOS)
import SwiftUI
import Observation
import AppKit
import XTalkDomain

@Observable
@MainActor
final class XTalkMacOSViewModel {
    enum ThreadKind: String {
        case room
        case direct
    }

    var users: [XTalkUser] = []
    var session: XTalkSessionResponse = .init(authenticated: false, user: nil, expiresAt: nil)
    var chat: XTalkChatPayload?
    var presenceEntries: [XTalkPresenceEntry] = []
    var status = "Disconnected"
    var selectedLoginUserID = ""
    var selectedDMUserID = ""
    var roomName = ""
    var messageBody = ""
    var errorMessage: String?
    var selectedThreadKind: ThreadKind = .room
    var selectedThreadID = ""

    private let client = XTalkAPIClient()
    private var inactivityTask: Task<Void, Never>?
    private var currentPresence: XTalkPresence = .offline
    private let inactivityTimeoutNanoseconds: UInt64 = 60_000_000_000

    func bootstrap() async {
        do {
            users = try await client.fetchUsers()
            if selectedLoginUserID.isEmpty {
                selectedLoginUserID = users.first?.id ?? ""
            }
            session = try await client.fetchSession()
            try await reloadChatIfNeeded()
        } catch {
            errorMessage = error.localizedDescription
            status = "Unable to load users"
        }
    }

    func signIn() async {
        guard !selectedLoginUserID.isEmpty else { return }
        do {
            session = try await client.signIn(userID: selectedLoginUserID)
            startPresenceAutomation()
            try await reloadChat()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func signOut() async {
        do {
            stopPresenceAutomation()
            try await client.signOut()
            session = .init(authenticated: false, user: nil, expiresAt: nil)
            chat = nil
            presenceEntries = []
            messageBody = ""
            status = "Signed out"
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshWorkspace() async {
        do {
            let sync = try await client.refreshWorkspace()
            status = sync.lastSyncAt.map { "Workspace synced \($0)" } ?? "Workspace synced"
            try await reloadChat()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createRoom() async {
        guard !roomName.isEmpty, let preferredTeamID else { return }
        do {
            let room = try await client.createRoom(name: roomName, teamID: preferredTeamID)
            roomName = ""
            selectedThreadKind = .room
            selectedThreadID = room.id
            try await reloadChat()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func createDM() async {
        guard !selectedDMUserID.isEmpty else { return }
        do {
            let conversation = try await client.createDirectConversation(participantUserID: selectedDMUserID)
            selectedThreadKind = .direct
            selectedThreadID = conversation.id
            try await reloadChat()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func sendMessage() async {
        guard !selectedThreadID.isEmpty, !messageBody.isEmpty else { return }
        do {
            if selectedThreadKind == .room {
                _ = try await client.postRoomMessage(roomID: selectedThreadID, body: messageBody)
            } else {
                _ = try await client.postDirectMessage(conversationID: selectedThreadID, body: messageBody)
            }
            messageBody = ""
            try await reloadChat()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func markCurrentThreadRead() async {
        guard !selectedThreadID.isEmpty else { return }
        do {
            if selectedThreadKind == .room {
                try await client.markRoomRead(roomID: selectedThreadID)
            } else {
                try await client.markDirectConversationRead(conversationID: selectedThreadID)
            }
            try await reloadChat()
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func selectRoom(_ roomID: String) {
        selectedThreadKind = .room
        selectedThreadID = roomID
        noteUserInteraction()
    }

    func selectDirect(_ conversationID: String) {
        selectedThreadKind = .direct
        selectedThreadID = conversationID
        noteUserInteraction()
    }

    func noteUserInteraction() {
        guard session.authenticated else { return }
        startPresenceAutomation()
    }

    func sceneBecameActive() {
        guard session.authenticated else { return }
        noteUserInteraction()
    }

    func sceneBecameInactive() {
        guard session.authenticated else { return }
        Task {
            await setPresence(.brb)
        }
    }

    func presence(for userID: String) -> XTalkPresence {
        presenceEntries.first(where: { $0.userID == userID })?.presence ?? .offline
    }

    func color(for presence: XTalkPresence) -> Color {
        switch presence {
        case .offline:
            return Color.white.opacity(0.55)
        case .brb:
            return Color(red: 1.0, green: 0.60, blue: 0.29)
        case .online:
            return Color(red: 0.35, green: 0.87, blue: 0.56)
        }
    }

    var currentUserID: String? {
        session.user?.id
    }

    var preferredTeamID: String? {
        guard let currentUserID, let chat else { return nil }
        return chat.workspace.memberships.first(where: { $0.userID == currentUserID })?.teamID
    }

    var roomThreads: [XTalkRoom] {
        chat?.rooms ?? []
    }

    var directThreads: [XTalkDirectConversation] {
        chat?.directConversations ?? []
    }

    var activeMessages: [XTalkMessage] {
        guard let chat else { return [] }
        if selectedThreadKind == .room {
            return chat.roomMessages(for: selectedThreadID)
        }
        return chat.directMessages(for: selectedThreadID)
    }

    var activeTitle: String {
        guard let chat, let currentUserID else { return "Conversation" }
        if selectedThreadKind == .room {
            return chat.rooms.first(where: { $0.id == selectedThreadID })?.name ?? "Conversation"
        }
        return chat.directConversationTitle(for: selectedThreadID, currentUserID: currentUserID)
    }

    var activeSubtitle: String {
        guard let chat, let currentUserID else { return "Chat thread" }
        if selectedThreadKind == .room {
            let teamID = chat.rooms.first(where: { $0.id == selectedThreadID })?.teamID
            return chat.workspace.teams.first(where: { $0.id == teamID })?.name ?? "Team room"
        }
        let partnerID = chat.directConversationPartnerID(for: selectedThreadID, currentUserID: currentUserID) ?? ""
        switch presence(for: partnerID) {
        case .online:
            return "Direct conversation · online"
        case .brb:
            return "Direct conversation · BRB"
        case .offline:
            return "Direct conversation · offline"
        }
    }

    var activeDirectPresence: XTalkPresence? {
        guard let chat, let currentUserID, selectedThreadKind == .direct else {
            return nil
        }
        let partnerID = chat.directConversationPartnerID(for: selectedThreadID, currentUserID: currentUserID) ?? ""
        return presence(for: partnerID)
    }

    func unreadCount(for room: XTalkRoom) -> Int {
        chat?.roomUnread[room.id] ?? 0
    }

    func unreadCount(for conversation: XTalkDirectConversation) -> Int {
        chat?.directUnread[conversation.id] ?? 0
    }

    func directTitle(for conversation: XTalkDirectConversation) -> String {
        guard let currentUserID, let chat else { return conversation.id }
        return chat.directConversationTitle(for: conversation.id, currentUserID: currentUserID)
    }

    func directPresence(for conversation: XTalkDirectConversation) -> XTalkPresence {
        guard let currentUserID, let chat else { return .offline }
        let partnerID = chat.directConversationPartnerID(for: conversation.id, currentUserID: currentUserID) ?? ""
        return presence(for: partnerID)
    }

    func authorPresence(for userID: String) -> XTalkPresence {
        presence(for: userID)
    }

    func user(for userID: String) -> XTalkUser? {
        chat?.workspace.users.first(where: { $0.id == userID }) ?? users.first(where: { $0.id == userID })
    }

    func managerName(for user: XTalkUser) -> String? {
        guard let managerUserID = user.managerUserID else { return nil }
        return self.user(for: managerUserID)?.displayName
    }

    private func reloadChatIfNeeded() async throws {
        if session.authenticated {
            startPresenceAutomation()
            try await reloadChat()
        } else {
            stopPresenceAutomation()
            status = "Choose a user to sign in"
        }
    }

    private func reloadChat() async throws {
        async let chatPayload = client.fetchChat()
        async let presencePayload = client.fetchPresence()
        let payload = try await chatPayload
        presenceEntries = try await presencePayload
        chat = payload
        status = payload.syncStatus.lastSyncAt.map { "Chat loaded \($0)" } ?? "Chat loaded"

        if let currentUserID {
            selectedDMUserID = payload.workspace.users.first(where: { $0.id != currentUserID })?.id ?? ""
        }

        let visibleRoomIDs = Set(payload.rooms.map(\.id))
        let visibleDirectIDs = Set(payload.directConversations.map(\.id))
        let selectionStillValid = selectedThreadKind == .room
            ? visibleRoomIDs.contains(selectedThreadID)
            : visibleDirectIDs.contains(selectedThreadID)

        if !selectionStillValid {
            if let firstRoom = payload.rooms.first {
                selectedThreadKind = .room
                selectedThreadID = firstRoom.id
            } else if let firstDirect = payload.directConversations.first {
                selectedThreadKind = .direct
                selectedThreadID = firstDirect.id
            } else {
                selectedThreadID = ""
            }
        }
    }

    private func startPresenceAutomation() {
        scheduleBRB()
        Task {
            await setPresence(.online)
        }
    }

    private func stopPresenceAutomation() {
        inactivityTask?.cancel()
        inactivityTask = nil
        currentPresence = .offline
    }

    private func scheduleBRB() {
        inactivityTask?.cancel()
        let timeout = inactivityTimeoutNanoseconds
        inactivityTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: timeout)
            guard !Task.isCancelled else { return }
            await self?.setPresence(.brb)
        }
    }

    private func setPresence(_ presence: XTalkPresence) async {
        guard session.authenticated else { return }
        if currentPresence == presence {
            if presence == .online {
                scheduleBRB()
            }
            return
        }

        currentPresence = presence
        do {
            try await client.updatePresence(presence)
            presenceEntries = try await client.fetchPresence()
        } catch {
            errorMessage = error.localizedDescription
        }

        if presence == .online {
            scheduleBRB()
        }
    }
}

struct XTalkMacOSAppView: View {
    @State private var model = XTalkMacOSViewModel()

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.18, green: 0.07, blue: 0.07),
                    Color(red: 0.05, green: 0.06, blue: 0.12),
                    Color(red: 0.04, green: 0.05, blue: 0.10)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                topBar
                content
            }
            .padding(20)
        }
        .background(ActivityMonitorView {
            model.noteUserInteraction()
        })
        .task {
            await model.bootstrap()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didBecomeActiveNotification)) { _ in
            model.sceneBecameActive()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSApplication.didResignActiveNotification)) { _ in
            model.sceneBecameInactive()
        }
        .frame(minWidth: 1240, minHeight: 820)
        .alert("Request Failed", isPresented: Binding(
            get: { model.errorMessage != nil },
            set: { _ in model.errorMessage = nil }
        )) {
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
        .preferredColorScheme(.dark)
    }

    private var topBar: some View {
        HStack(spacing: 12) {
            PlatformMarkIcon()
                .frame(width: 34, height: 34)

            VStack(alignment: .leading, spacing: 2) {
                Text("xHarbor:xTalk")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                Text("Rooms and direct collaboration")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.72))
                    .lineLimit(1)
                    .truncationMode(.tail)
            }

            Spacer(minLength: 12)

            if model.session.authenticated {
                HStack(spacing: 10) {
                    if let user = model.session.user {
                        UserHoverAnchor(user: user, managerName: model.managerName(for: user)) {
                            Text(user.displayName)
                                .font(.system(size: 13, weight: .semibold))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Color.white.opacity(0.06), in: RoundedRectangle(cornerRadius: 10))
                        }
                    }

                    Button("Refresh") {
                        Task { await model.refreshWorkspace() }
                    }
                    .buttonStyle(TopBarButtonStyle(primary: false))

                    Button("Sign Out") {
                        Task { await model.signOut() }
                    }
                    .buttonStyle(TopBarButtonStyle(primary: false))
                }
            } else {
                HStack(spacing: 10) {
                    Picker("Sign in as", selection: $model.selectedLoginUserID) {
                        ForEach(model.users) { user in
                            Text(user.displayName).tag(user.id)
                        }
                    }
                    .labelsHidden()
                    .frame(width: 200)

                    Button("Sign In") {
                        Task { await model.signIn() }
                    }
                    .buttonStyle(TopBarButtonStyle(primary: true))
                }
            }
        }
        .padding(.horizontal, 18)
        .padding(.vertical, 14)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .padding(.bottom, 14)
    }

    @ViewBuilder
    private var content: some View {
        if let chat = model.chat, model.session.authenticated {
            VStack(alignment: .leading, spacing: 12) {
                Text(model.status)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.52))
                    .lineLimit(1)

                HStack(alignment: .top, spacing: 12) {
                    chatSidebar(chat: chat)
                        .frame(width: 290)

                    activeConversation(chat: chat)
                }
            }
        } else {
            VStack(alignment: .leading, spacing: 10) {
                Text("Chat Access")
                    .font(.system(size: 42, weight: .bold, design: .rounded))
                Text("Sign in from the top-right controls to use xTalk.")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.white.opacity(0.72))
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .padding(24)
            .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 20))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
        }
    }

    private func chatSidebar(chat: XTalkChatPayload) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            roomSidebarSection
            directSidebarSection(chat: chat)
        }
        .padding(14)
        .frame(maxHeight: .infinity, alignment: .top)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }

    private func activeConversation(chat: XTalkChatPayload) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                if model.selectedThreadKind == .direct,
                   let currentUserID = model.currentUserID,
                   let partnerID = chat.directConversationPartnerID(for: model.selectedThreadID, currentUserID: currentUserID),
                   let partner = model.user(for: partnerID) {
                    UserHoverAnchor(user: partner, managerName: model.managerName(for: partner)) {
                        titleWithPresence(model.activeTitle, presence: model.activeDirectPresence)
                    }
                } else {
                    titleWithPresence(model.activeTitle, presence: model.activeDirectPresence)
                }
                Text(model.activeSubtitle)
                    .font(.system(size: 13))
                    .foregroundStyle(Color.white.opacity(0.68))
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 12)
            .background(Color.white.opacity(0.03), in: RoundedRectangle(cornerRadius: 14))
            .overlay(
                RoundedRectangle(cornerRadius: 14)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )

            ScrollView {
                LazyVStack(alignment: .leading, spacing: 8) {
                    if model.activeMessages.isEmpty {
                        Text("No messages yet.")
                            .foregroundStyle(Color.white.opacity(0.6))
                            .padding(.horizontal, 4)
                    } else {
                        ForEach(model.activeMessages) { message in
                            MessageRow(
                                author: chat.workspace.users.first(where: { $0.id == message.authorUserID })?.displayName ?? message.authorUserID,
                                authorPresence: model.authorPresence(for: message.authorUserID),
                                user: model.user(for: message.authorUserID),
                                managerName: model.user(for: message.authorUserID).flatMap { model.managerName(for: $0) },
                                messageBody: message.body,
                                timestamp: message.createdAt
                            )
                        }
                    }
                }
                .padding(.vertical, 2)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)

            VStack(spacing: 8) {
                TextField("Write a message", text: $model.messageBody, axis: .vertical)
                    .textFieldStyle(ChatFieldStyle())
                    .lineLimit(3, reservesSpace: true)

                HStack(spacing: 8) {
                    Button("Send") {
                        Task { await model.sendMessage() }
                    }
                    .buttonStyle(TopBarButtonStyle(primary: true))

                    Button("Mark as Read") {
                        Task { await model.markCurrentThreadRead() }
                    }
                    .buttonStyle(TopBarButtonStyle(primary: false))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(14)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 18))
        .overlay(
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }

    private var roomSidebarSection: some View {
        sidebarSection(
            title: "Rooms",
            accessory: { addThreadMenu(kind: .room) }
        ) {
            ForEach(model.roomThreads) { room in
                threadButton(
                    title: room.name,
                    subtitle: "",
                    unread: model.unreadCount(for: room),
                    isActive: model.selectedThreadKind == .room && model.selectedThreadID == room.id
                ) {
                    model.selectRoom(room.id)
                }
            }
        }
    }

    private func directSidebarSection(chat: XTalkChatPayload) -> some View {
        sidebarSection(
            title: "Direct Messages",
            accessory: { addThreadMenu(kind: .direct, chat: chat) }
        ) {
            ForEach(model.directThreads) { conversation in
                let partnerID = chat.directConversationPartnerID(for: conversation.id, currentUserID: model.currentUserID ?? "")
                threadButton(
                    title: model.directTitle(for: conversation),
                    subtitle: "",
                    unread: model.unreadCount(for: conversation),
                    isActive: model.selectedThreadKind == .direct && model.selectedThreadID == conversation.id,
                    presence: model.directPresence(for: conversation),
                    user: partnerID.flatMap { model.user(for: $0) },
                    managerName: partnerID.flatMap { model.user(for: $0) }.flatMap { model.managerName(for: $0) }
                ) {
                    model.selectDirect(conversation.id)
                }
            }
        }
    }

    private enum SidebarAddKind {
        case room
        case direct
    }

    private func addThreadMenu(kind: SidebarAddKind, chat: XTalkChatPayload? = nil) -> some View {
        Menu {
            if kind == .room {
                TextField("New room", text: $model.roomName)
                Divider()
                Button("Create Room") {
                    Task { await model.createRoom() }
                }
                .disabled(model.roomName.isEmpty || model.preferredTeamID == nil)
            } else if let chat {
                Picker("User", selection: $model.selectedDMUserID) {
                    ForEach(chat.workspace.users.filter { $0.id != model.currentUserID }) { user in
                        Text(user.displayName).tag(user.id)
                    }
                }
                Divider()
                Button("Open DM") {
                    Task { await model.createDM() }
                }
                .disabled(model.selectedDMUserID.isEmpty)
            }
        } label: {
            Image(systemName: "plus")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(.white)
                .frame(width: 22, height: 22)
                .background(Color.white.opacity(0.05), in: Circle())
                .overlay(Circle().stroke(Color.white.opacity(0.08), lineWidth: 1))
        }
        .menuStyle(.borderlessButton)
        .buttonStyle(.plain)
    }

    private func sidebarSection<Accessory: View, Content: View>(
        title: String,
        @ViewBuilder accessory: () -> Accessory,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .center, spacing: 8) {
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Color.white.opacity(0.46))
                    .textCase(.uppercase)
                    .tracking(1.4)
                Spacer(minLength: 6)
                accessory()
            }
            .padding(.bottom, 2)
            content()
        }
    }

    private func sidebarSection<Content: View>(
        title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        sidebarSection(title: title, accessory: { EmptyView() }, content: content)
    }

    private func presenceDot(_ presence: XTalkPresence?) -> some View {
        Circle()
            .fill(model.color(for: presence ?? .offline))
            .frame(width: 7, height: 7)
            .overlay(Circle().stroke(Color.white.opacity(0.14), lineWidth: 1))
    }

    private func labelWithPresence(_ title: String, presence: XTalkPresence?) -> some View {
        HStack(spacing: 6) {
            Text(title)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
                .lineLimit(1)
                .truncationMode(.tail)
            if presence != nil {
                presenceDot(presence)
            }
        }
    }

    private func titleWithPresence(_ title: String, presence: XTalkPresence?) -> some View {
        HStack(spacing: 7) {
            Text(title)
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
                .lineLimit(1)
                .truncationMode(.tail)
            if presence != nil {
                presenceDot(presence)
            }
        }
    }

    private func threadButton(
        title: String,
        subtitle: String,
        unread: Int,
        isActive: Bool,
        presence: XTalkPresence? = nil,
        user: XTalkUser? = nil,
        managerName: String? = nil,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 3) {
                    if let user {
                        UserHoverAnchor(user: user, managerName: managerName) {
                            labelWithPresence(title, presence: presence)
                        }
                    } else {
                        labelWithPresence(title, presence: presence)
                    }
                    if !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 12))
                            .foregroundStyle(Color.white.opacity(0.62))
                            .lineLimit(1)
                            .truncationMode(.tail)
                    }
                }

                Spacer(minLength: 8)

                if unread > 0 {
                    Text("\(unread)")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color(red: 1.0, green: 0.60, blue: 0.29).opacity(0.22), in: Capsule())
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .frame(height: 34, alignment: .topLeading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isActive ? Color.white.opacity(0.07) : Color.white.opacity(0.025))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isActive ? Color(red: 1.0, green: 0.60, blue: 0.29).opacity(0.45) : Color.white.opacity(0.08), lineWidth: 1)
            )
        }
        .buttonStyle(.plain)
    }
}

private struct PlatformMarkIcon: View {
    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color(red: 0.18, green: 0.26, blue: 0.78),
                            Color(red: 0.17, green: 0.80, blue: 0.94),
                            Color(red: 0.56, green: 0.92, blue: 1.0)
                        ],
                        startPoint: .bottomLeading,
                        endPoint: .topTrailing
                    )
                )
                .rotationEffect(.degrees(45))
                .mask(
                    Rectangle()
                        .overlay(alignment: .leading) {
                            Rectangle()
                                .frame(width: 17)
                                .offset(x: -10)
                                .blendMode(.destinationOut)
                        }
                )

            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            Color.white,
                            Color(red: 0.95, green: 0.97, blue: 1.0),
                            Color(red: 0.79, green: 0.85, blue: 0.92)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .rotationEffect(.degrees(-45))
                .mask(
                    Rectangle()
                        .overlay(alignment: .trailing) {
                            Rectangle()
                                .frame(width: 17)
                                .offset(x: 10)
                                .blendMode(.destinationOut)
                        }
                )
        }
        .compositingGroup()
        .shadow(color: Color.black.opacity(0.22), radius: 8, y: 5)
    }
}

private struct TopBarButtonStyle: ButtonStyle {
    let primary: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(primary ? Color.black.opacity(0.85) : .white)
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(
                RoundedRectangle(cornerRadius: 10)
                    .fill(primary ? Color(red: 1.0, green: 0.60, blue: 0.29) : Color.white.opacity(configuration.isPressed ? 0.09 : 0.05))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(primary ? Color.clear : Color.white.opacity(0.08), lineWidth: 1)
            )
    }
}

private struct ChatFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .textFieldStyle(.plain)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 10))
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(Color.white.opacity(0.08), lineWidth: 1)
            )
            .foregroundStyle(.white)
    }
}

private struct MessageRow: View {
    let author: String
    let authorPresence: XTalkPresence
    let user: XTalkUser?
    let managerName: String?
    let messageBody: String
    let timestamp: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            if let user {
                UserHoverAnchor(user: user, managerName: managerName) {
                    authorLabel
                }
            } else {
                authorLabel
            }
            Text(messageBody)
                .font(.system(size: 13))
                .foregroundStyle(Color.white.opacity(0.88))
            Text(timestamp)
                .font(.system(size: 11))
                .foregroundStyle(Color.white.opacity(0.45))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
    }

    private var authorLabel: some View {
        HStack(spacing: 6) {
            Text(author)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(.white)
            Circle()
                .fill(color(for: authorPresence))
                .frame(width: 7, height: 7)
                .overlay(Circle().stroke(Color.white.opacity(0.14), lineWidth: 1))
        }
    }

    private func color(for presence: XTalkPresence) -> Color {
        switch presence {
        case .offline:
            return Color.white.opacity(0.55)
        case .brb:
            return Color(red: 1.0, green: 0.60, blue: 0.29)
        case .online:
            return Color(red: 0.35, green: 0.87, blue: 0.56)
        }
    }
}

private struct UserHoverAnchor<Label: View>: View {
    let user: XTalkUser
    let managerName: String?
    @ViewBuilder var label: () -> Label

    @State private var isHovering = false
    @State private var showCard = false
    @State private var hoverTask: Task<Void, Never>?

    var body: some View {
        label()
            .onHover { hovering in
                isHovering = hovering
                hoverTask?.cancel()

                if hovering {
                    hoverTask = Task {
                        try? await Task.sleep(nanoseconds: 450_000_000)
                        guard !Task.isCancelled, isHovering else { return }
                        showCard = true
                    }
                } else {
                    showCard = false
                }
            }
            .popover(isPresented: $showCard, arrowEdge: .bottom) {
                UserHoverCardView(user: user, managerName: managerName)
            }
    }
}

private struct UserHoverCardView: View {
    let user: XTalkUser
    let managerName: String?

    private var fullName: String {
        let parts = [user.firstName, user.lastName].filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        return parts.isEmpty ? user.displayName : parts.joined(separator: " ")
    }

    private var rows: [(String, String)] {
        [
            ("Nickname", user.nickname?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""),
            ("Department", user.department),
            ("Title", user.title),
            ("Manager", managerName ?? ""),
            ("Email", user.email)
        ].filter { !$0.1.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 3) {
                Text(fullName)
                    .font(.system(size: 15, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                if user.displayName != fullName {
                    Text(user.displayName)
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color.white.opacity(0.66))
                }
            }

            ForEach(rows, id: \.0) { row in
                VStack(alignment: .leading, spacing: 2) {
                    Text(row.0)
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(Color.white.opacity(0.42))
                        .textCase(.uppercase)
                        .tracking(1.1)
                    Text(row.1)
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Color.white.opacity(0.88))
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
            }
        }
        .padding(14)
        .frame(width: 240, alignment: .leading)
        .background(Color(red: 0.10, green: 0.11, blue: 0.17))
    }
}

private struct ActivityMonitorView: NSViewRepresentable {
    let onActivity: () -> Void

    func makeNSView(context: Context) -> ActivityMonitorNSView {
        let view = ActivityMonitorNSView()
        view.onActivity = onActivity
        return view
    }

    func updateNSView(_ nsView: ActivityMonitorNSView, context: Context) {
        nsView.onActivity = onActivity
    }
}

private final class ActivityMonitorNSView: NSView {
    var onActivity: (() -> Void)?

    override func updateTrackingAreas() {
        super.updateTrackingAreas()
        trackingAreas.forEach(removeTrackingArea)
        let options: NSTrackingArea.Options = [.activeAlways, .inVisibleRect, .mouseMoved]
        addTrackingArea(NSTrackingArea(rect: .zero, options: options, owner: self, userInfo: nil))
    }

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool {
        true
    }

    override func mouseMoved(with event: NSEvent) {
        onActivity?()
        super.mouseMoved(with: event)
    }

    override func mouseDown(with event: NSEvent) {
        onActivity?()
        super.mouseDown(with: event)
    }

    override func rightMouseDown(with event: NSEvent) {
        onActivity?()
        super.rightMouseDown(with: event)
    }

    override func scrollWheel(with event: NSEvent) {
        onActivity?()
        super.scrollWheel(with: event)
    }

    override func keyDown(with event: NSEvent) {
        onActivity?()
        super.keyDown(with: event)
    }
}

@main
struct XTalkMacOSApp: App {
    var body: some Scene {
        WindowGroup {
            XTalkMacOSAppView()
        }
        .windowResizability(.contentSize)
    }
}
#endif
