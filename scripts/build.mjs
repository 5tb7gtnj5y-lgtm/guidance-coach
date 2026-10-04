import { build as buildClient } from "vite";
import { build as bundleWorker } from "esbuild";
import { copyFile,mkdir } from "node:fs/promises";
await mkdir("public",{recursive:true});
await copyFile("node_modules/pdfjs-dist/build/pdf.worker.min.mjs","public/pdf.worker.min.mjs");
await buildClient();
await bundleWorker({entryPoints:["src/worker.ts"],bundle:true,format:"esm",platform:"browser",target:"es2022",outfile:"dist/worker.js",external:["cloudflare:workers"],minify:false,sourcemap:false});
console.log("Cloudflare build ready: dist/worker.js and dist/client.");
