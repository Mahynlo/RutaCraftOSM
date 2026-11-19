// Utilidades compartidas por las pruebas (node --test). Requieren `npm run build`.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PAQUETE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const RAIZ = path.dirname(PAQUETE);
export const DATOS = path.join(RAIZ, "datos");

/** Ejecutable nativo recién compilado (RutaCraftOSM_c/bin) o el indicado en RUTACRAFT_CLI. */
export const CLI = process.env.RUTACRAFT_CLI ??
    path.join(RAIZ, "RutaCraftOSM_c", "bin", process.platform === "win32" ? "cli.exe" : "cli");
export const HAY_CLI = fs.existsSync(CLI);
export const SIN_CLI = HAY_CLI ? false : `falta el motor nativo (${CLI}); compílalo con CMake`;

export const HAY_WASM = fs.existsSync(path.join(PAQUETE, "dist", "esm", "wasm", "motor.wasm"));
export const SIN_WASM = HAY_WASM ? false : "falta el motor WebAssembly; compílalo con `npm run build:wasm`";

export const GRAFO = path.join(PAQUETE, "bin", "grafos", "grafo_mazatan_villapesqueira.bin");
export const RUTA_MUNICIPAL = JSON.parse(fs.readFileSync(path.join(DATOS, "ruta_municipal_mazatan.json"), "utf8"));
export const DOS_PUNTOS = [[29.065639, -110.056448], [29.062039, -110.059091]];
export const TRES_PUNTOS = [[29.065639, -110.056448], [29.062039, -110.059091], [29.059486, -110.053973]];

export function tmpDir(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ruta-craft-"));
    t?.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
}

/** Ejecuta el motor nativo y devuelve {codigo, stdout, stderr}. */
export function correr(args, { entrada, cwd, exe = CLI } = {}) {
    const r = spawnSync(exe, args, { input: entrada, cwd, encoding: "utf8", maxBuffer: 1 << 28 });
    if (r.error) throw r.error;
    return { codigo: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Calcula una ruta con la CLI (sin caché) y devuelve el resultado. */
export function calcularCli(puntos, extra = [], grafo = GRAFO) {
    const r = correr(["--grafo", grafo, "--sin-cache", "--puntos", "-", ...extra], { entrada: JSON.stringify(puntos) });
    if (r.codigo !== 0) throw new Error(`cli terminó con ${r.codigo}: ${r.stderr}`);
    return JSON.parse(r.stdout);
}

/** Envía varias peticiones al modo servidor; devuelve las respuestas ordenadas por id. */
export function servir(peticiones, args = ["--sin-cache"], grafo = GRAFO) {
    const lineas = peticiones.map((p, i) => (typeof p === "string" ? p : JSON.stringify({ id: i, ...p }))).join("\n") + "\n";
    const r = correr(["--serve", "--grafo", grafo, ...args], { entrada: lineas });
    if (r.codigo !== 0) throw new Error(`cli --serve terminó con ${r.codigo}: ${r.stderr}`);
    return r.stdout.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l));
}

export function haversine(a, b, radio = 6371000) {
    const rad = Math.PI / 180;
    const h = Math.sin((b[0] - a[0]) * rad / 2) ** 2 +
        Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin((b[1] - a[1]) * rad / 2) ** 2;
    return 2 * radio * Math.asin(Math.sqrt(h));
}

export function largoPolilinea(ruta) {
    let total = 0;
    for (let i = 1; i < ruta.length; i++) total += haversine(ruta[i - 1], ruta[i]);
    return total;
}

/** Generador pseudoaleatorio con semilla (para que las pruebas sean reproducibles). */
export function aleatorio(semilla) {
    let s = semilla >>> 0 || 1;
    return () => {
        s ^= s << 13; s >>>= 0;
        s ^= s >>> 17;
        s ^= s << 5; s >>>= 0;
        return s / 4294967296;
    };
}

/**
 * Formato histórico RCO1 (cada arista repite el nombre de calle y el tipo de vía). El motor lo
 * sigue leyendo; se escribe aquí solo para probar esa compatibilidad.
 */
export function escribirRCO1(g, duplicarAristas = false) {
    const partes = [];
    const n = g.osmIds.length;
    const encabezado = Buffer.alloc(8);
    encabezado.write("RCO1", 0, "ascii");
    encabezado.writeUInt32LE(n, 4);
    partes.push(encabezado);
    const nodos = Buffer.alloc(24 * n);
    for (let i = 0; i < n; i++) {
        nodos.writeBigInt64LE(BigInt(g.osmIds[i]), 24 * i);
        nodos.writeDoubleLE(g.coords[2 * i], 24 * i + 8);
        nodos.writeDoubleLE(g.coords[2 * i + 1], 24 * i + 16);
    }
    partes.push(nodos);
    for (let u = 0; u < n; u++) {
        const aristas = [];
        for (let e = g.inicio[u]; e < g.inicio[u + 1]; e++) aristas.push(e);
        const lista = duplicarAristas ? [...aristas, ...aristas] : aristas;
        const k = Buffer.alloc(4);
        k.writeUInt32LE(lista.length);
        partes.push(k);
        for (const e of lista) {
            const nombre = Buffer.from(g.nombres[g.nombreId[e]] || "desconocida", "utf8");
            const b = Buffer.alloc(8 + 2 + nombre.length + 2 + 4);
            b.writeUInt32LE(g.destino[e], 0);
            b.writeFloatLE(g.peso[e], 4);
            b.writeUInt16LE(nombre.length, 8);
            nombre.copy(b, 10);
            b.writeUInt16LE(4, 10 + nombre.length);
            b.write("road", 12 + nombre.length, "ascii");
            partes.push(b);
        }
    }
    return Buffer.concat(partes);
}

/** Dijkstra de referencia en JS sobre un GrafoRCO (para verificar que A* es óptimo). */
export function dijkstra(g, s, t) {
    const n = g.osmIds.length;
    const dist = new Float64Array(n).fill(Infinity);
    const cerrado = new Uint8Array(n);
    dist[s] = 0;
    const cola = [[0, s]];
    const subir = (i) => { while (i > 0) { const p = (i - 1) >> 1; if (cola[p][0] <= cola[i][0]) break; [cola[p], cola[i]] = [cola[i], cola[p]]; i = p; } };
    const bajar = (i) => {
        for (;;) {
            const l = 2 * i + 1, r = l + 1;
            let m = i;
            if (l < cola.length && cola[l][0] < cola[m][0]) m = l;
            if (r < cola.length && cola[r][0] < cola[m][0]) m = r;
            if (m === i) return;
            [cola[m], cola[i]] = [cola[i], cola[m]];
            i = m;
        }
    };
    while (cola.length) {
        const [d, u] = cola[0];
        const ultimo = cola.pop();
        if (cola.length) { cola[0] = ultimo; bajar(0); }
        if (u === t) return d;
        if (cerrado[u]) continue;
        cerrado[u] = 1;
        for (let e = g.inicio[u]; e < g.inicio[u + 1]; e++) {
            const v = g.destino[e], nd = d + g.peso[e];
            if (nd < dist[v]) { dist[v] = nd; cola.push([nd, v]); subir(cola.length - 1); }
        }
    }
    return null;
}
