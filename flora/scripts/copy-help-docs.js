const fs = require("fs");
const path = require("path");

const source = path.join(__dirname, "../src/docs/moduleHelp-full.md");
const faqSource = path.join(__dirname, "../src/docs/faq");
const docsSourceDir = path.join(__dirname, "../src/docs");
const targetDir = path.join(__dirname, "../public/docs");
const target = path.join(targetDir, "moduleHelp-full.md");
const faqTarget = path.join(targetDir, "faq");

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyHelpDocs() {
  fs.mkdirSync(targetDir, { recursive: true });
  fs.copyFileSync(source, target);

  if (fs.existsSync(faqSource)) {
    copyDirRecursive(faqSource, faqTarget);
    console.log(`Copied FAQ assets to ${faqTarget}`);
  }

  console.log(`Copied help docs to ${target}`);
}

function watchHelpDocs() {
  let debounceTimer = null;

  fs.watch(docsSourceDir, { recursive: true }, (_event, filename) => {
    if (!filename) {
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(copyHelpDocs, 100);
  });

  console.log(`Watching ${docsSourceDir} for help doc changes...`);
}

module.exports = { copyHelpDocs, watchHelpDocs };

if (require.main === module) {
  copyHelpDocs();

  if (process.argv.includes("--watch")) {
    watchHelpDocs();
  }
}
