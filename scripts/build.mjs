import { readFile } from "node:fs/promises";
import { build } from "esbuild";

const client = await build({
  entryPoints: ["client/app.js"], bundle: true, format: "iife", minify: true, write: false, target: "es2022",
});
const [html, css, theme] = await Promise.all(
  ["index.html", "app.css", "theme.js"].map(name => readFile("client/" + name, "utf8")),
);

await build({
  entryPoints: ["worker/index.js"],
  outfile: "dist/server/index.js",
  bundle: true,
  format: "esm",
  target: "es2022",
  define: {
    SITE_HTML: JSON.stringify(html),
    SITE_CSS: JSON.stringify(css),
    SITE_THEME: JSON.stringify(theme),
    SITE_JS: JSON.stringify(client.outputFiles[0].text),
  },
});
