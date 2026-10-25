import { copyFileSync, existsSync, mkdirSync, readFileSync } from "fs";

const target = process.argv[2] === "gecko" ? "gecko" : "chromium";
const dist = "dist/" + target;

for (const file of ["background.js", "popup.html", "styles.css", "popup.css"]) {
  copyFileSync("public/" + file, dist + "/" + file);
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
