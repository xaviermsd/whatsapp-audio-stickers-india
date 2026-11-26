// Builds the release zip: dist/whatsapp-audio-stickers-india-v<version>.zip with manifest.json at the top level,
// so Windows "Extract All" (which makes its own folder) gives a folder that "Load unpacked" accepts directly. Uses the tar that ships with Windows 10+, macOS and Linux.
import { readFile, rm, mkdir, cp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(await readFile(new URL("../extension/manifest.json", import.meta.url), "utf8"));
const name = "whatsapp-audio-stickers-india";
const stage = `${root}dist/stage`;
await rm(`${root}dist`, { recursive: true, force: true });
await mkdir(`${stage}/${name}`, { recursive: true });
await cp(`${root}extension`, `${stage}/${name}`, { recursive: true });
await cp(`${root}LICENSE`, `${stage}/${name}/LICENSE.txt`);
const zip = `${root}dist/${name}-v${version}.zip`;
// Windows: use its own bsdtar (Git Bash puts GNU tar first, which cannot write zip files).
const tar = process.platform === "win32" ? "C:/Windows/System32/tar.exe" : "tar";
// List the top-level entries by name: entries stored as "./x" break Windows Explorer's Extract All.
const { readdirSync } = await import("node:fs");
const entries = readdirSync(`${stage}/${name}`);
execFileSync(tar, ["-a", "-c", "-f", `../../${name}-v${version}.zip`, ...entries], { cwd: `${stage}/${name}` });
await rm(stage, { recursive: true, force: true });
console.log("wrote", zip);
