import { build } from "vite";
import { copyFileSync, mkdirSync, watch } from "fs";

function copyPublicFiles() {
  const files = ["background.js", "popup.html", "styles.css", "popup.css"];
  for (const file of files) {
    copyFileSync(`public/${file}`, `dist/chromium/${file}`);
    copyFileSync(`public/${file}`, `dist/gecko/${file}`);
  }
  copyFileSync("public/manifest.chromium.json", "dist/chromium/manifest.json");
  copyFileSync("public/manifest.gecko.json", "dist/gecko/manifest.json");

  mkdirSync("dist/chromium/icons", { recursive: true });
  mkdirSync("dist/gecko/icons", { recursive: true });
  for (const size of ["512"]) {
    copyFileSync(`public/icons/icon${size}.png`, `dist/chromium/icons/icon${size}.png`);
    copyFileSync(`public/icons/icon${size}.png`, `dist/gecko/icons/icon${size}.png`);
  }

  console.log("[watch] public files copied");
}
const watcher = await build({
  build: {
    watch: {},
    outDir: "dist/chromium",
  },
});

watcher.on("event", (event) => {
  if (event.code === "BUNDLE_END") {
    mkdirSync("dist/gecko", { recursive: true });
    mkdirSync("dist/chromium", { recursive: true });
    copyFileSync("dist/chromium/content.js", "dist/gecko/content.js");
    copyFileSync("dist/chromium/tailwind.css", "dist/gecko/tailwind.css");
    copyPublicFiles();
    console.log("[watch] both dist/chromium and dist/gecko updated");
  }
});

watch("public", () => {
  copyPublicFiles();
});
