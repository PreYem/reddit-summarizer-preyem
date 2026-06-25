import { build } from "vite";
import { copyFileSync, mkdirSync, watch } from "fs";

function copyPublicFiles() {
  const files = ["background.js", "styles.css", "popup.html", "popup.css"];
  for (const file of files) {
    copyFileSync(`public/${file}`, `dist/chrome/${file}`);
    copyFileSync(`public/${file}`, `dist/gecko/${file}`);
  }
  copyFileSync("public/manifest.chrome.json", "dist/chrome/manifest.json");
  copyFileSync("public/manifest.gecko.json", "dist/gecko/manifest.json");

  mkdirSync("dist/chrome/icons", { recursive: true });
  mkdirSync("dist/gecko/icons", { recursive: true });
  for (const size of ["512"]) {
    copyFileSync(`public/icons/icon${size}.png`, `dist/chrome/icons/icon${size}.png`);
    copyFileSync(`public/icons/icon${size}.png`, `dist/gecko/icons/icon${size}.png`);
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
    mkdirSync("dist/gecko", { recursive: true }); // ← add this line
    copyFileSync("dist/chrome/content.js", "dist/gecko/content.js");
    copyPublicFiles();
    console.log("[watch] both dist/chrome and dist/gecko updated");
  }
});

watch("public", () => {
  copyPublicFiles();
});
