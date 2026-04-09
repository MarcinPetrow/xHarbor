import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const outputDir = path.join(repoRoot, "docs", "assets", "screenshots");

const apps = [
  {
    name: "xgroup-structure",
    url: "http://127.0.0.1:3000",
    afterLogin: async (page) => {
      await page.click('[data-view-id="structure"]');
      await page.waitForSelector(".org-tree");
      const horizontal = page.locator('[data-action="org-layout-horizontal"]');
      if (await horizontal.count()) {
        await horizontal.click();
      }
      const orgTree = page.locator(".org-tree");
      if (await orgTree.count()) {
        await orgTree.evaluate((node) => {
          node.scrollLeft = 0;
          node.scrollTop = 0;
        });
      }
    }
  },
  {
    name: "xbacklog-board",
    url: "http://127.0.0.1:3001",
    afterLogin: async (page) => {
      await page.waitForSelector(".board-columns");
    }
  },
  {
    name: "xdashboard-overview",
    url: "http://127.0.0.1:3002",
    afterLogin: async (page) => {
      await page.waitForSelector(".content-panel");
    }
  },
  {
    name: "xtalk-chat",
    url: "http://127.0.0.1:3003",
    afterLogin: async (page) => {
      await page.waitForSelector(".chat-layout");
    }
  },
  {
    name: "xdoc-preview",
    url: "http://127.0.0.1:3004",
    afterLogin: async (page) => {
      await page.waitForSelector(".doc-sidebar");
      const firstPage = page.locator("[data-page-id]").first();
      if (await firstPage.count()) {
        await firstPage.click();
      }
      const previewButton = page.locator("#doc-preview-mode");
      if (await previewButton.count()) {
        await previewButton.click();
      }
    }
  }
];

async function ensureLogin(page) {
  await page.waitForSelector("#app");
  const loginSelect = page.locator("#login-select");
  if (!(await loginSelect.count())) return;

  const signedInVisible = await page.locator("#signed-in-auth").isVisible().catch(() => false);
  if (signedInVisible) return;

  const optionValues = await loginSelect.locator("option").evaluateAll((options) =>
    options.map((option) => ({ value: option.value, label: option.textContent || "" }))
  );

  const preferred = optionValues.find((option) => option.value === "user-marcin")
    || optionValues.find((option) => /marcin/i.test(option.label))
    || optionValues.find((option) => option.value);

  if (!preferred?.value) {
    throw new Error("No sign-in user found in login selector.");
  }

  await loginSelect.selectOption(preferred.value);
  await page.click("#login-button");
  await page.waitForSelector("#signed-in-auth", { state: "visible" });
}

async function captureApp(browser, app) {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1
  });

  try {
    await page.goto(app.url, { waitUntil: "load" });
    await ensureLogin(page);
    await app.afterLogin(page);
    await page.waitForTimeout(600);
    await page.screenshot({
      path: path.join(outputDir, `${app.name}.png`)
    });
  } finally {
    await page.close();
  }
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  try {
    for (const app of apps) {
      process.stdout.write(`capturing ${app.name}\n`);
      await captureApp(browser, app);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
