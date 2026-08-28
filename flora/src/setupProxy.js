const { createProxyMiddleware } = require("http-proxy-middleware");

function overpassProxy(target) {
  return createProxyMiddleware({
    target,
    changeOrigin: true,
    secure: true,
    timeout: 120000,
    proxyTimeout: 120000,
    pathRewrite: {
      "^/": "/api/interpreter"
    }
  });
}

/** Same-origin proxy so the browser does not hit Overpass CORS / blocked hosts. */
module.exports = function setupProxy(app) {
  app.use("/overpass-ru", overpassProxy("https://overpass.openstreetmap.ru"));
  app.use("/overpass-de", overpassProxy("https://overpass-api.de"));
  app.use("/overpass-lz4", overpassProxy("https://lz4.overpass-api.de"));
};
