#!/usr/bin/env node
// Injects iOS home-screen icon tags and the web manifest link into the
// index.html produced by `expo export -p web`.
//
// Why this exists: Expo's default web output uses a built-in HTML template
// that ignores app/+html.tsx unless `web.output` is set to "static". This
// script patches the produced HTML so PWA / "Add to Home Screen" works.
//
// Usage: node scripts/inject-pwa-tags.mjs <dist-dir> [--base /test/]
//
// --base controls the URL prefix the icons are served at. For the prod
// build (served at /) pass --base / (or omit). For the test build
// (served at /test/) pass --base /test/. Absolute paths are required
// because iOS resolves relative hrefs against the document URL, and
// users often type /test without a trailing slash, which breaks
// relative resolution.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const dir = resolve(args.find((a) => !a.startsWith("--")) ?? "dist");
const baseArg = args.find((a) => a.startsWith("--base"));
let base = baseArg ? baseArg.split("=")[1] ?? args[args.indexOf(baseArg) + 1] : "/";
if (!base.startsWith("/")) base = "/" + base;
if (!base.endsWith("/")) base = base + "/";

const file = resolve(dir, "index.html");

if (!existsSync(file)) {
  console.error(`inject-pwa-tags: ${file} not found`);
  process.exit(1);
}

const TAGS = `    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="BikeVault" />
    <meta name="theme-color" content="#0A0A12" />
    <link rel="apple-touch-icon" sizes="180x180" href="${base}apple-touch-icon.png" />
    <link rel="apple-touch-icon" sizes="167x167" href="${base}apple-touch-icon-167.png" />
    <link rel="apple-touch-icon" sizes="152x152" href="${base}apple-touch-icon-152.png" />
    <link rel="apple-touch-icon" sizes="120x120" href="${base}apple-touch-icon-120.png" />
    <link rel="manifest" href="${base}manifest.json" />`;

let html = readFileSync(file, "utf8");

if (html.includes("apple-touch-icon")) {
  console.log(`inject-pwa-tags: ${file} already patched, skipping`);
  process.exit(0);
}

// Widen viewport to cover the iOS notch when launched standalone.
html = html.replace(
  /<meta name="viewport"[^>]*\/>/,
  `<meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />`,
);

// Inject just before </head>.
html = html.replace("</head>", `${TAGS}\n  </head>`);

writeFileSync(file, html);
console.log(`inject-pwa-tags: patched ${file} with base=${base}`);
