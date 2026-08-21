const fs = require("fs");
const path = require("path");

const source = path.join(
  __dirname,
  "../node_modules/maplibre-gl/dist/maplibre-gl-csp-worker.js"
);
const target = path.join(__dirname, "../public/maplibre-gl-csp-worker.js");

function copyMapLibreWorker() {
  if (!fs.existsSync(source)) {
    throw new Error(`MapLibre worker not found: ${source}`);
  }

  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  console.log(`Copied MapLibre worker to ${target}`);
}

if (require.main === module) {
  copyMapLibreWorker();
}

module.exports = { copyMapLibreWorker };
