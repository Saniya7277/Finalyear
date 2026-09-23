import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.resolve(artifactDir, "src/app.ts")],
  platform: "node",
  bundle: true,
  format: "cjs",
  outfile: path.resolve(artifactDir, "dist/vercel-app.cjs"),
  sourcemap: "linked",
  logLevel: "info",
  external: [
    "pino",
    "pino-http",
    "pino-pretty",
    "thread-stream",
    "nodemailer"
  ]
});
