import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import fs from "fs";
import path from "path";

// Which browser are we building for? Default to chrome.
// Usage: BROWSER=firefox npm run build:firefox
const browser = (process.env.BROWSER as "chrome" | "firefox") ?? "chrome";

const outDir = `dist/${browser}`;

// Files that are identical for both browsers
const sharedAssets = [
  ["public/background.js", "background.js"],
  ["public/styles.css", "styles.css"],
  ["public/icons/icon512.png", "icons/icon512.png"],
] as const;

// Browser-specific manifest
const manifestSrc =
  browser === "firefox"
    ? "public/manifest.firefox.json"
    : "public/manifest.chrome.json";

function copyExtensionAssets() {
  return {
    name: "copy-extension-assets",
    closeBundle() {
      for (const [src, dest] of sharedAssets) {
        const destPath = path.join(outDir, dest);
        fs.mkdirSync(path.dirname(destPath), { recursive: true });
        fs.copyFileSync(src, destPath);
      }
      // Rename to manifest.json — browsers expect this exact name
      fs.copyFileSync(manifestSrc, path.join(outDir, "manifest.json"));

      console.log(`\n✓ Extension assets copied → ${outDir}`);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), copyExtensionAssets()],
  // Disable Vite's default public/ auto-copy — our plugin handles it selectively
  // so the two manifest source files don't leak into dist
  publicDir: false,
  build: {
    outDir,
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
      },
      output: {
        // No content hashes — manifest.json needs predictable filenames
        entryFileNames: "[name].js",
        chunkFileNames: "[name].js",
        assetFileNames: "[name].[ext]",
      },
    },
  },
});
