import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { transpile, ScriptTarget } from "typescript";

const target = process.argv[2] === "gecko" ? "gecko" : "chromium";
const dist = "dist/" + target;

for (const file of ["popup.html", "settings.html", "styles.css"]) {
  copyFileSync("public/" + file, dist + "/" + file);
}

// #25: languages are transpiled from shared/languages.ts and exported like a classic page
// script: top-level LANGUAGES/uiText/etc become globals available to settings.js/popup.js.
const languagesTs = readFileSync("../shared/languages.ts", "utf8");
const languagesJs = transpile(languagesTs, { target: ScriptTarget.ES2020 }).replace(/^export /gm, "");
writeFileSync(dist + "/languages.js", languagesJs);

// #24: the settings page + background page sources are authored in TS now; this transpiles
// them straight to plain JS next to the other public assets (no bundling, comments kept) - PreYem
for (const name of ["background", "settings", "popup"]) {
  const js = transpile(readFileSync("public/" + name + ".ts", "utf8"), { target: ScriptTarget.ES2020 });
  writeFileSync(dist + "/" + name + ".js", js);
}

copyFileSync("public/manifest." + target + ".json", dist + "/manifest.json");

// Only the icon sizes referenced by the manifest are required in the build.
const manifest = JSON.parse(readFileSync("public/manifest." + target + ".json", "utf8"));
const iconPaths = new Set();
for (const icons of [manifest.icons, manifest.action?.default_icon]) {
  for (const path of Object.values(icons ?? {})) iconPaths.add(path);
}

mkdirSync(dist + "/icons", { recursive: true });
let copied = 0;
for (const iconPath of iconPaths) {
  const src = "public/" + iconPath;
  if (!existsSync(src)) continue;
  copyFileSync(src, dist + "/" + iconPath);
  copied++;
}

console.log("[copy-public] copied " + copied + " manifest icons into " + dist + "/icons");
