#!/usr/bin/env node
/**
 * Exports the LiveView app icon (SVG) to a 1024×1024 PNG for iOS.
 * Run from repo root: node frontend/scripts/export-app-icon.mjs
 * Or from frontend: node scripts/export-app-icon.mjs
 */
import sharp from "sharp";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(__dirname, "..");
const svgPath = path.join(frontendRoot, "public", "icons", "icon-app-icon.svg");
const outPath = path.join(frontendRoot, "..", "ios", "App", "App", "Assets.xcassets", "AppIcon.appiconset", "AppIcon-512@2x.png");

const svg = readFileSync(svgPath);
await sharp(svg)
  .resize(1024, 1024)
  .png()
  .toFile(outPath);

console.log("App icon exported to:", outPath);
