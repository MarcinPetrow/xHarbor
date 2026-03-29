# xtalk-macos

Native macOS client built in SwiftUI and backed by the same `xtalk-api` and `xgroup-api` session flow as the web client.

Run after starting the Node services:

```bash
npm run dev:xgroup
npm run dev:xtalk
swift run xtalk-macos
```

Or run the full local workspace, including `xtalk-macos`:

```bash
npm run workspace:start
npm run workspace:stop
npm run workspace:restart
```
