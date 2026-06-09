import { build } from "vite";
import { copyFileSync, watch } from "fs";

function copyPublicFiles() {
  const files = ["background.js", "styles.css"];

  for (const file of files) {
    copyFileSync(`public/${file}`, `dist/chrome/${file}`);
    copyFileSync(`public/${file}`, `dist/firefox/${file}`);
  }

  copyFileSync("public/manifest.chrome.json", "dist/chrome/manifest.json");
  copyFileSync("public/manifest.firefox.json", "dist/firefox/manifest.json");

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
    // copy chrome build to firefox folder too
    copyFileSync("dist/chrome/content.js", "dist/firefox/content.js");
    copyPublicFiles();
    console.log("[watch] both dist/chrome and dist/firefox updated");
  }
});

// watch public folder for changes
watch("public", () => {
  copyPublicFiles();
});
