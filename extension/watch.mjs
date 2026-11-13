import { build } from "vite";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync, watch } from "fs";
import { transpile, ScriptTarget } from "typescript";

// Only the icon sizes referenced by each manifest are required in the build.
function copyPublicFiles(target) {
  const dist = `dist/${target}`;
  for (const file of ["popup.html", "settings.html", "styles.css", "popup.css"]) {
    copyFileSync(`public/${file}`, `${dist}/${file}`);
  }
  // #25: shared/languages.ts is transpiled to a classic-script global for settings.js/popup.js - PreYem
  const languagesJs = transpile(readFileSync("../shared/languages.ts", "utf8"), { target: ScriptTarget.ES2020 }).replace(/^export /gm, "");
  writeFileSync(`${dist}/languages.js`, languagesJs);
  // #24: TS-authored public pages are transpiled to plain JS at copy time - PreYem
  for (const name of ["background", "settings", "popup"]) {
    const js = transpile(readFileSync(`public/${name}.ts`, "utf8"), { target: ScriptTarget.ES2020 });
    writeFileSync(`${dist}/${name}.js`, js);
  }
  copyFileSync(`public/manifest.${target}.json`, `${dist}/manifest.json`);

  const manifest = JSON.parse(readFileSync(`public/manifest.${target}.json`, "utf8"));
  const iconPaths = new Set();
  for (const icons of [manifest.icons, manifest.action?.default_icon]) {
    for (const path of Object.values(icons ?? {})) iconPaths.add(path);
  }

  mkdirSync(`${dist}/icons`, { recursive: true });
  for (const iconPath of iconPaths) {
    const src = `public/${iconPath}`;
    if (!existsSync(src)) continue;
    copyFileSync(src, `${dist}/${iconPath}`);
  }

  console.log(`[watch] public files copied (${target})`);
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
    copyFileSync("dist/chromium/content.js", "dist/gecko/content.js");
    copyFileSync("dist/chromium/tailwind.css", "dist/gecko/tailwind.css");
    copyPublicFiles("chromium");
    copyPublicFiles("gecko");
    console.log("[watch] both dist/chromium and dist/gecko updated");
  }
});

watch("public", () => {
  copyPublicFiles("chromium");
  copyPublicFiles("gecko");
});

watch("../shared", () => {
  copyPublicFiles("chromium");
  copyPublicFiles("gecko");
});
