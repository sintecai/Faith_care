import { build as esbuild } from "esbuild";
import { rm, readFile, cp, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "ejs",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "qrcode",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  // Skip Vite build for EJS-only app
  console.log("skipping client build (EJS server-rendered app)...");

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });

  // Copy EJS views to dist/server/views
  console.log("copying views...");
  const viewsSrc = path.join("server", "views");
  const viewsDest = path.join("dist", "server", "views");
  if (existsSync(viewsSrc)) {
    await mkdir(path.join("dist", "server"), { recursive: true });
    await cp(viewsSrc, viewsDest, { recursive: true });
    console.log("  views copied to dist/server/views");
  }

  // Copy public assets to dist/server/public
  console.log("copying public assets...");
  const publicSrc = path.join("server", "public");
  const publicDest = path.join("dist", "server", "public");
  if (existsSync(publicSrc)) {
    await cp(publicSrc, publicDest, { recursive: true });
    console.log("  public assets copied to dist/server/public");
  }

  console.log("build complete!");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
