import { SqliteStateStore } from "../../src/index.js";

const [filePath, documentKey] = process.argv.slice(2);
const store = new SqliteStateStore(filePath, documentKey);

await store.loadOr({
  key: documentKey,
  bootstrappedAt: new Date().toISOString()
});
