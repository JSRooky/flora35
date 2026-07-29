const { appendUserFinding } = require("../scripts/userpointsStore.cjs");

function getPublicUrlBasename() {
  try {
    const { homepage } = require("../package.json");
    if (!homepage) {
      return "";
    }

    const pathname = new URL(homepage).pathname;
    return pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  } catch {
    return "";
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk;
    });

    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function createUserPointsHandler() {
  return async (req, res) => {
    if (req.method !== "POST") {
      res.status(405).json({ ok: false, error: "Method not allowed" });
      return;
    }

    try {
      const payload = await readJsonBody(req);
      const collection = appendUserFinding(payload);
      res.json({ ok: true, collection });
    } catch (error) {
      res.status(400).json({
        ok: false,
        error: error?.message || "Failed to save user finding"
      });
    }
  };
}

module.exports = function setupProxy(app) {
  const handler = createUserPointsHandler();
  const basename = getPublicUrlBasename();
  const paths = ["/api/userpoints"];

  if (basename) {
    paths.push(`${basename}/api/userpoints`);
  }

  paths.forEach((path) => {
    app.post(path, handler);
  });
};
