import esbuild from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "..");

for (const entry of ["src/worker.ts", "src/index.ts"]) {
  const sourcePath = path.join(packageRoot, entry);
  const outfile = path.join(packageRoot, "dist", path.basename(entry).replace(/\.ts$/, ".js"));
  await esbuild.build({
    entryPoints: [sourcePath],
    outfile,
    bundle: true,
    format: "esm",
    platform: "node",
    target: ["node20"],
    sourcemap: true,
    logLevel: "info",
    external: [],
  });
}
