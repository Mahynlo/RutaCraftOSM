// Paso final del build: deja el módulo WebAssembly junto al código ESM (dist/esm/wasm/) y marca
// dist/esm como módulos ES. El módulo se compila con Emscripten (ver RutaCraftOSM_c/CMakeLists.txt).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const esm = path.join(raiz, "dist", "esm");
fs.mkdirSync(path.join(esm, "wasm"), { recursive: true });
fs.writeFileSync(path.join(esm, "package.json"), JSON.stringify({ type: "module" }) + "\n");

const faltan = [];
for (const archivo of ["motor.mjs", "motor.wasm"]) {
    const origen = path.join(raiz, "wasm", archivo);
    if (fs.existsSync(origen)) fs.copyFileSync(origen, path.join(esm, "wasm", archivo));
    else faltan.push(archivo);
}
if (faltan.length) {
    const mensaje = `Falta el motor WebAssembly (wasm/${faltan.join(", wasm/")}). Compílalo con:\n` +
        "  emcmake cmake -S ../RutaCraftOSM_c -B ../RutaCraftOSM_c/build-wasm && cmake --build ../RutaCraftOSM_c/build-wasm";
    if (process.argv.includes("--estricto")) {
        console.error(`❌ ${mensaje}`);
        process.exit(1);
    }
    console.warn(`⚠️  ${mensaje}\n   La parte para navegador (ruta-craft-osm/web) no funcionará hasta entonces.`);
}
