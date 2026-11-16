/** Preset-only evidence: both Kimi rows appear and prefill their own base URL.
 * Needs no API key. Runs against an already-running dev server.
 */
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { launchBrowser } from "/home/zhang-pc/projects/OpenDirector/tests/browser/engine.mjs";

const web = process.env.OPENDIRECTOR_URL ?? "http://127.0.0.1:5173";
const api = process.env.OPENDIRECTOR_API ?? "http://127.0.0.1:8000";
const output = process.env.KIMI_SCREENSHOTS ?? "/tmp/opendirector-kimi-coding";
const headers = { "X-OpenDirector-Request": "1", "Content-Type": "application/json" };
const rows = {
  "zh-CN": [
    ["月之暗面 Kimi 开放平台", "https://api.moonshot.cn/v1"],
    ["月之暗面 Kimi Code 订阅", "https://api.kimi.com/coding/v1"],
  ],
  "en-US": [
    ["Moonshot Kimi Open Platform", "https://api.moonshot.cn/v1"],
    ["Moonshot Kimi Code subscription", "https://api.kimi.com/coding/v1"],
  ],
};

async function call(path, body, method) {
  const response = await fetch(api + path, {
    headers, method: method ?? (body ? "POST" : "GET"),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  assert.ok(response.ok, await response.clone().text());
  return response.status === 204 ? null : response.json();
}

const projectId = crypto.randomUUID();
await call(`/api/creation/projects/${projectId}/commands`, {
  commandId: crypto.randomUUID(), projectId, type: "project.create",
  payload: { name: `Kimi preset ${projectId.slice(0, 8)}` },
});

await mkdir(output, { recursive: true });
const browser = await launchBrowser();
const errors = [];
try {
  for (const locale of ["zh-CN", "en-US"]) {
    const page = await browser.newPage({ locale, viewport: { width: 1500, height: 1000 } });
    page.setDefaultTimeout(60000);
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("request", (request) => {
      if (/moonshot\.(cn|ai)|api\.kimi\.com/.test(request.url())) errors.push("browser contacted Kimi directly");
    });
    await page.addInitScript(([id, language]) => {
      localStorage.setItem("opendirector.locale.v1", language);
      localStorage.setItem("opendirector.modelSetup.v1", "dismissed");
      localStorage.setItem("opendirector.lastUnifiedFilesystemProject", id);
    }, [projectId, locale]);

    const loading = page.locator(".canvas-loading-screen");
    for (let attempt = 1; ; attempt++) {
      await page.goto(`${web}/ai-tool/ai-canvas/${projectId}?creation=unified`);
      const ready = await loading.waitFor({ state: "detached", timeout: 20000 }).then(() => true, () => false);
      if (ready) break;
      assert.ok(attempt < 12, "canvas stays leased by the previous tab");
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
    await page.getByRole("button", { name: locale === "zh-CN" ? "设置" : "Settings", exact: true }).click();
    await page.getByRole("button", {
      name: locale === "zh-CN" ? "模型接入" : "Model connections", exact: true,
    }).click();
    await page.locator(".cw-model-setup-row")
      .filter({ hasText: locale === "zh-CN" ? "文本模型" : "Text model" })
      .getByRole("button").click();
    await page.getByRole("button", { name: locale === "zh-CN" ? "对话" : "Chat", exact: true }).click();
    await page.getByRole("button", { name: locale === "zh-CN" ? "添加服务" : "Add service", exact: true }).click();

    const combo = page.getByRole("combobox", { name: locale === "zh-CN" ? "提供商" : "Provider", exact: true });
    const list = page.getByRole("listbox", { name: locale === "zh-CN" ? "提供商" : "Provider", exact: true });
    const urlField = locale === "zh-CN" ? "服务地址（Base URL）" : "Service URL (Base URL)";

    await combo.click();
    // Both rows are visible at the same time, so the two billing routes are distinguishable.
    for (const [name] of rows[locale]) await list.getByRole("option", { name, exact: true }).waitFor();
    await page.screenshot({ path: `${output}/${locale}-0-both-rows.png` });

    for (const [index, [name, url]] of rows[locale].entries()) {
      if (index > 0) await combo.click();
      await list.getByRole("option", { name, exact: true }).click();
      assert.equal(await page.getByLabel(urlField).inputValue(), url, name);
      await page.screenshot({ path: `${output}/${locale}-${index + 1}-${index === 0 ? "open-platform" : "kimi-code"}.png` });
    }
    await page.close();
  }
} finally {
  await browser.close();
}
assert.deepEqual(errors, []);
console.log("preset evidence written to " + output);
console.log("project " + projectId);
