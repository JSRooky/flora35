const { spawn } = require("child_process");
const path = require("path");
const { copyHelpDocs, watchHelpDocs } = require("./copy-help-docs");

copyHelpDocs();
watchHelpDocs();

const child = spawn(
  "npx",
  ["cross-env", "GENERATE_SOURCEMAP=false", "react-scripts", "start"],
  {
    stdio: "inherit",
    shell: true,
    cwd: path.join(__dirname, "..")
  }
);

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
