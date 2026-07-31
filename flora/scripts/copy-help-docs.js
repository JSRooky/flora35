const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "../src/docs/moduleHelp-full.md");
const targetDir = path.join(__dirname, "../public/docs");
const target = path.join(targetDir, "moduleHelp-full.md");

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);

console.log(`Copied help docs to ${target}`);
