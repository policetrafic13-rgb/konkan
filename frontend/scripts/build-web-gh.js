#!/usr/bin/env node
// يبني نسخة الويب لنشرها على GitHub Pages تحت المسار /konkan
// الاستخدام (من مجلد frontend):  node scripts/build-web-gh.js
// الناتج: مجلد dist جاهز للنسخ إلى فرع gh-pages.
// لا يغيّر app.json بشكل دائم: يضيف baseUrl مؤقتًا ثم يعيد الملف كما كان.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const appJsonPath = path.join(root, "app.json");
const distDir = path.join(root, "dist");
const BASE_URL = "/konkan";
const TITLE = "حاسبة الكونكان";

const original = fs.readFileSync(appJsonPath, "utf8");
let exitCode = 0;

try {
  const cfg = JSON.parse(original);
  cfg.expo.experiments = { ...(cfg.expo.experiments || {}), baseUrl: BASE_URL };
  fs.writeFileSync(appJsonPath, JSON.stringify(cfg, null, 2));

  fs.rmSync(distDir, { recursive: true, force: true });

  const cmd = process.platform === "win32" ? "npx.cmd" : "npx";
  const r = spawnSync(cmd, ["expo", "export", "--platform", "web", "--output-dir", "dist"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, CI: "1" },
  });
  if (r.status !== 0) throw new Error("expo export failed (exit " + r.status + ")");

  // عنوان الصفحة
  const indexPath = path.join(distDir, "index.html");
  let html = fs.readFileSync(indexPath, "utf8");
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${TITLE}</title>`);
  fs.writeFileSync(indexPath, html);

  // GitHub Pages: منع معالجة Jekyll لمجلد _expo
  fs.writeFileSync(path.join(distDir, ".nojekyll"), "");

  // تحقق أن المسارات تبدأ بـ /konkan/
  if (!html.includes(`src="${BASE_URL}/_expo/`)) {
    throw new Error("baseUrl was not applied to index.html; do not publish this build");
  }
  console.log("\nOK: dist is ready (base path " + BASE_URL + "/)");
} catch (e) {
  console.error("\nBUILD FAILED:", e.message);
  exitCode = 1;
} finally {
  fs.writeFileSync(appJsonPath, original);
}

process.exit(exitCode);
