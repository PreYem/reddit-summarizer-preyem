import { build } from "vite";
import { copyFileSync, mkdirSync, watch } from "fs";

function copyPublicFiles() {
  const files = ["background.js", "styles.css", "popup.html", "popup.css"];
  for (const file of files) {
    copyFileSync(`public/${file}`, `dist/chrome/${file}`);
    copyFileSync(`public/${file}`, `dist/firefox/${file}`);
  }
  copyFileSync("public/manifest.chrome.json", "dist/chrome/manifest.json");
  copyFileSync("public/manifest.firefox.json", "dist/firefox/manifest.json");

  mkdirSync("dist/chrome/icons", { recursive: true });
  mkdirSync("dist/firefox/icons", { recursive: true });
  for (const size of ["16", "48", "128"]) {
    copyFileSync(`public/icons/icon${size}.png`, `dist/chrome/icons/icon${size}.png`);
    copyFileSync(`public/icons/icon${size}.png`, `dist/firefox/icons/icon${size}.png`);
  }

  console.log("[watch] public files copied");
}

const watcher = await build({
  build: {
    watch: {},
    outDir: "dist/chrome",
  },
});

watcher.on("event", (event) => {
  if (event.code === "BUNDLE_END") {
    copyFileSync("dist/chrome/content.js", "dist/firefox/content.js");
    copyPublicFiles();
    console.log("[watch] both dist/chrome and dist/firefox updated");
  }
});

watch("public", () => {
  copyPublicFiles();
});
