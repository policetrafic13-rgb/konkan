#!/usr/bin/env node
// يبني نسخة الويب لنشرها على GitHub Pages.
// الاستخدام (من مجلد frontend):
//   النسخة الكتابية (الرابط العام /konkan/):   node scripts/build-web-gh.js
//   نسخة المساعد (/konkan/ai/):                 node scripts/build-web-gh.js --assistant
// الناتج: مجلد dist (للكتابية) أو dist-ai (للمساعد)، جاهز للنسخ إلى فرع gh-pages.
// لا يغيّر app.json بشكل دائم: يضيف baseUrl مؤقتًا ثم يعيد الملف كما كان.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const withAssistant = process.argv.includes("--assistant");
const BASE_URL = withAssistant ? "/konkan/ai" : "/konkan";
const OUT_NAME = withAssistant ? "dist-ai" : "dist";
const TITLE = "حاسبة الكونكان";

const root = path.resolve(__dirname, "..");
const appJsonPath = path.join(root, "app.json");
const distDir = path.join(root, OUT_NAME);

const original = fs.readFileSync(appJsonPath, "utf8");
let exitCode = 0;

try {
  const cfg = JSON.parse(original);
  cfg.expo.experiments = { ...(cfg.expo.experiments || {}), baseUrl: BASE_URL };
  fs.writeFileSync(appJsonPath, JSON.stringify(cfg, null, 2));

  fs.rmSync(distDir, { recursive: true, force: true });

  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = spawnSync(
    cmd,
    ["expo", "export", "--platform", "web", "--clear", "--output-dir", OUT_NAME],
    {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32",
      env: { ...process.env, CI: "1", EXPO_PUBLIC_ASSISTANT: withAssistant ? "1" : "0" },
    }
  );
  if (r.status !== 0) throw new Error("expo export failed (exit " + r.status + ")");

  // عنوان الصفحة
  const indexPath = path.join(distDir, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${TITLE}</title>`);
  fs.writeFileSync(indexPath, html);

  // GitHub Pages: منع معالجة Jekyll لمجلد _expo
  fs.writeFileSync(path.join(distDir, ".nojekyll"), "");

  // تحقق أن المسارات تبدأ بالمسار الصحيح
  if (!html.includes(`src="${BASE_URL}/_expo/`)) {
    throw new Error("baseUrl was not applied to index.html; do not publish this build");
  }
  console.log(
    "\nOK: " + OUT_NAME + " is ready (base path " + BASE_URL + "/, assistant " + (withAssistant ? "ON" : "OFF") + ")"
  );
} catch (e) {
  console.error("\nBUILD FAILED:", e.message);
  exitCode = 1;
} finally {
  fs.writeFileSync(appJsonPath, original);
}

process.exit(exitCode);
