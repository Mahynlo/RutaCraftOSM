// Copia el build para navegador (dist/esm) y el grafo incluido a docs/demo/, para la demo de
// docs/demo.html en GitHub Pages. Correr después de `npm run build` (con el motor WebAssembly).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const paquete = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const esm = path.join(paquete, "dist", "esm");
const destino = path.join(paquete, "..", "docs", "demo");

if (!fs.existsSync(path.join(esm, "wasm", "motor.wasm"))) {
    console.error("❌ Falta dist/esm/wasm/motor.wasm: compila el motor (npm run build:wasm) y luego npm run build");
    process.exit(1);
}
fs.rmSync(path.join(destino, "lib"), { recursive: true, force: true });
for (const carpeta of ["comun", "generador", "web", "wasm"]) {
    fs.cpSync(path.join(esm, carpeta), path.join(destino, "lib", carpeta), {
        recursive: true,
        filter: (f) => !f.endsWith(".d.ts") && !f.endsWith(".d.mts"),
    });
}
fs.copyFileSync(path.join(esm, "package.json"), path.join(destino, "lib", "package.json"));
fs.copyFileSync(path.join(paquete, "bin", "grafos", "grafo_mazatan_villapesqueira.bin"),
    path.join(destino, "grafo_mazatan_villapesqueira.bin"));
console.log(`✅ Demo lista en ${path.relative(process.cwd(), destino)}`);
