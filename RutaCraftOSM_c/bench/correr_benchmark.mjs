// Corre el benchmark del motor (nativo y WebAssembly) sobre los grafos disponibles y guarda los
// resultados en docs/benchmark.json, docs/5_RENDIMIENTO.md y docs/js/rutas_benchmark.js (las rutas
// completas, para verlas en docs/visualizacion_ruta.html).
//
//     cmake --build RutaCraftOSM_c/build --target cli benchmark
//     npm run build --prefix ruta-craft-osm          (incluye el motor WebAssembly si está compilado)
//     node RutaCraftOSM_c/bench/correr_benchmark.mjs
//
// Los grafos de Hermosillo no se versionan; se generan con:
//     node ruta-craft-osm/dist/cli.js generar --caja 28.97,-111.10,29.21,-110.86 --salida datos/benchmark/grafo_hermosillo.bin
//     node ruta-craft-osm/dist/cli.js generar --caja 28.97,-111.10,29.21,-110.86 --respetar-sentido --salida datos/benchmark/grafo_hermosillo_dirigido.bin
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const BENCH = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(BENCH, "..", "..");
const DATOS = path.join(RAIZ, "datos");
const EXE = process.platform === "win32" ? ".exe" : "";
const BENCHMARK = path.join(RAIZ, "RutaCraftOSM_c", "bin", "benchmark" + EXE);
const CLI = path.join(RAIZ, "RutaCraftOSM_c", "bin", "cli" + EXE);
const WEB = path.join(RAIZ, "ruta-craft-osm", "dist", "esm", "web", "index.js");
const SALIDA = path.join(RAIZ, "docs", "benchmark.json");
const SALIDA_MD = path.join(RAIZ, "docs", "5_RENDIMIENTO.md");
const SALIDA_RUTAS = path.join(RAIZ, "docs", "js", "rutas_benchmark.js");
const REPETICIONES = 5;

const definiciones = JSON.parse(fs.readFileSync(path.join(DATOS, "benchmark_escenarios.json"), "utf8"));
const ESCENARIOS = Object.fromEntries(["mazatan", "hermosillo"].map((zona) => [zona, definiciones[zona].map((e) => ({
    nombre: e.nombre,
    puntos: typeof e.puntos === "string" ? JSON.parse(fs.readFileSync(path.join(DATOS, e.puntos), "utf8")) : e.puntos,
}))]));

// [zona, etiqueta, variante, grafo]: la variante "dirigido" respeta las calles de un solo sentido
const GRAFOS = [
    ["mazatan", "Mazatán - Villa Pesqueira", "normal", path.join(RAIZ, "ruta-craft-osm", "bin", "grafos", "grafo_mazatan_villapesqueira.bin")],
    ["hermosillo", "Ciudad de Hermosillo", "normal", path.join(DATOS, "benchmark", "grafo_hermosillo.bin")],
    ["hermosillo", "Ciudad de Hermosillo (respetando sentidos)", "dirigido", path.join(DATOS, "benchmark", "grafo_hermosillo_dirigido.bin")],
];
const ZONAS = { mazatan: "Mazatán - Villa Pesqueira", hermosillo: "Ciudad de Hermosillo" };

const mediana = (v) => {
    const s = [...v].sort((a, b) => a - b);
    return s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const redondear = (x, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

/** Una llamada de calcularRuta(): arrancar el proceso, cargar el grafo y calcular. */
function ejecutarCli(grafo, puntos, repeticiones = REPETICIONES, extra = []) {
    const tiempos = [];
    let resultado = null;
    for (let i = 0; i < repeticiones; i++) {
        const t0 = performance.now();
        const r = spawnSync(CLI, ["--grafo", grafo, "--puntos", "-", "--sin-cache", ...extra],
            { input: JSON.stringify(puntos), encoding: "utf8", maxBuffer: 1 << 28 });
        tiempos.push(performance.now() - t0);
        if (r.status !== 0) return [null, null];
        resultado = JSON.parse(r.stdout);
    }
    return [redondear(mediana(tiempos)), resultado];
}

/** Motor WebAssembly con el grafo ya cargado (lo que hace crearMotorWeb() en el navegador). */
async function medirWasm(web, grafo, escenarios) {
    const t0 = performance.now();
    const motor = await web.cargarMotorWasm({ grafo: new Uint8Array(fs.readFileSync(grafo)) });
    const cargaMs = performance.now() - t0;
    const porEscenario = escenarios.map(({ puntos }) => {
        const medir = (orden) => {
            const tiempos = [];
            for (let i = 0; i < REPETICIONES + 1; i++) {
                motor.limpiarCache();
                const t = performance.now();
                try { motor.calcular(puntos, orden); } catch { return null; }
                if (i > 0) tiempos.push(performance.now() - t);  // la primera calienta el JIT
            }
            return redondear(mediana(tiempos), 3);
        };
        return { total_ms: medir({}), optimizado_ms: puntos.length >= 10 ? medir({ optimizar: true }) : null };
    });
    return { carga_ms: redondear(cargaMs), escenarios: porEscenario };
}

function nombreCpu() {
    return os.cpus()[0]?.model.trim() || os.arch();
}

function sistema() {
    const nombres = { win32: "Windows", linux: "Linux", darwin: "macOS" };
    return `${nombres[process.platform] ?? process.platform} ${os.release()}`;
}

async function main() {
    for (const exe of [BENCHMARK, CLI]) {
        if (!fs.existsSync(exe)) {
            console.error(`Falta ${exe}. Compila con: cmake --build RutaCraftOSM_c/build --target cli benchmark`);
            process.exit(1);
        }
    }
    const web = fs.existsSync(WEB) && fs.existsSync(path.join(path.dirname(WEB), "..", "wasm", "motor.wasm"))
        ? await import(pathToFileURL(WEB).href) : null;
    if (!web) console.log("⏭️  Sin motor WebAssembly compilado: se omiten sus tiempos");

    const resultados = [];
    const rutas = new Map();  // "zona-índice" -> datos para el visualizador
    for (const [clave, etiqueta, variante, grafo] of GRAFOS) {
        if (!fs.existsSync(grafo)) {
            console.log(`⏭️  ${etiqueta}: no existe ${path.relative(RAIZ, grafo)}, se omite`);
            continue;
        }
        console.log(`⏱️  ${etiqueta}...`);
        const tmp = path.join(os.tmpdir(), `escenarios-${process.pid}.json`);
        fs.writeFileSync(tmp, JSON.stringify({ escenarios: ESCENARIOS[clave] }));
        const r = spawnSync(BENCHMARK, [grafo, tmp, String(REPETICIONES)], { encoding: "utf8", maxBuffer: 1 << 28 });
        fs.rmSync(tmp, { force: true });
        if (r.status !== 0) {
            console.log(`❌ ${etiqueta}: ${r.stderr.trim()}`);
            continue;
        }
        const datos = JSON.parse(r.stdout);
        datos.etiqueta = etiqueta;
        const wasm = web ? await medirWasm(web, grafo, ESCENARIOS[clave]) : null;
        if (wasm) datos.wasm_carga_ms = wasm.carga_ms;

        datos.escenarios.forEach((esc, idx) => {
            const definicion = ESCENARIOS[clave][idx];
            if (esc.error) return;
            if (wasm) esc.wasm_ms = wasm.escenarios[idx].total_ms;
            const [ms, ruta] = ejecutarCli(grafo, definicion.puntos);
            esc.proceso_cli_ms = ms;
            if (!ruta) return;
            if (definicion.puntos.length >= 10) {
                const [msOpt, opt] = ejecutarCli(grafo, definicion.puntos, 3, ["--optimizar"]);
                if (opt) {
                    esc.optimizado = {
                        proceso_cli_ms: msOpt,
                        wasm_ms: wasm?.escenarios[idx].optimizado_ms ?? null,
                        distancia_km: opt.distancia_total_km,
                        metodo: opt.optimizacion.metodo,
                    };
                }
            }
            const id = `${clave}-${idx}`;
            if (!rutas.has(id)) {
                rutas.set(id, { id, zona: ZONAS[clave], nombre: definicion.nombre, puntos: definicion.puntos, variantes: {} });
            }
            rutas.get(id).variantes[variante] = {
                distancia_km: ruta.distancia_total_km,
                motor_persistente_ms: esc.total_ms,
                calcular_ruta_ms: esc.proceso_cli_ms,
                ruta: ruta.ruta.map(([la, lo]) => [redondear(la, 6), redondear(lo, 6)]),
                instrucciones: ruta.instrucciones.map((i) => ({ accion: i.accion, calle: i.calle, distancia_m: i.distancia_m })),
            };
        });
        resultados.push(datos);
        imprimir(datos);
    }

    const meta = { fecha: new Date().toISOString().slice(0, 10), cpu: nombreCpu(), sistema: sistema() };
    fs.writeFileSync(SALIDA, JSON.stringify({ ...meta, grafos: resultados }, null, 2) + "\n");
    fs.writeFileSync(SALIDA_MD, generarMarkdown(meta, resultados));
    fs.writeFileSync(SALIDA_RUTAS, "// Generado por RutaCraftOSM_c/bench/correr_benchmark.mjs; no editar a mano.\n" +
        `const RUTAS_BENCHMARK = ${JSON.stringify({ ...meta, escenarios: [...rutas.values()] })};\n`);
    console.log();
    for (const s of [SALIDA, SALIDA_MD, SALIDA_RUTAS]) console.log(`💾 ${path.relative(RAIZ, s)}`);
}

function imprimir(d) {
    console.log(`   ${d.nodos.toLocaleString("en-US")} nodos · carga ${d.carga_ms} ms · KD-Tree ${d.kdtree_ms} ms · memoria ${d.memoria_pico_mb} MB`);
    for (const e of d.escenarios) {
        if (e.error) console.log(`   ❌ ${e.nombre}: ${e.error}`);
        else console.log(`   • ${e.nombre}: ${e.total_ms} ms (nativo) · ${e.wasm_ms ?? "-"} ms (WASM) · ${e.proceso_cli_ms} ms (calcularRuta)`);
    }
}

const miles = (x) => x.toLocaleString("en-US");

function generarMarkdown(meta, resultados) {
    const hayWasm = resultados.some((d) => d.wasm_carga_ms !== undefined);
    const l = [
        "# ⏱️ 5. Rendimiento del Motor C++",
        "",
        "> [!NOTE]",
        "> Página generada automáticamente por `RutaCraftOSM_c/bench/correr_benchmark.mjs`; no editar a mano.",
        `> Medido el **${meta.fecha}** en **${meta.cpu}** (${meta.sistema}). Los tiempos son la mediana de ${REPETICIONES} repeticiones.`,
        "",
        "Se mide el motor tal como lo usan la aplicación de Electron (nativo) y el navegador (WebAssembly), en dos grafos:",
        "",
        "* **Mazatán - Villa Pesqueira**: el grafo de producción, zona rural.",
        "* **Ciudad de Hermosillo**: zona urbana con muchas calles, para ver cómo escala el motor " +
        "(se genera con `ruta-craft-osm generar`, ver el encabezado de `correr_benchmark.mjs`).",
        "",
        "---",
        "",
        "## 1. Arranque del motor",
        "",
        "Lo que se paga cada vez que se inicia el motor: con `calcularRuta()` en cada llamada; con el motor persistente " +
        "(`crearMotorRutas()`) o con `crearMotorWeb()`, una sola vez.",
        "",
        `| Grafo | Nodos | Aristas | Archivo | Carga del grafo | KD-Tree | Memoria pico |${hayWasm ? " WASM: módulo + grafo |" : ""}`,
        `| :--- | ---: | ---: | ---: | ---: | ---: | ---: |${hayWasm ? " ---: |" : ""}`,
    ];
    for (const d of resultados) {
        l.push(`| ${d.etiqueta} | ${miles(d.nodos)} | ${miles(d.aristas)} | ${d.tamano_mb} MB | ${d.carga_ms} ms | ` +
            `${d.kdtree_ms} ms | ${d.memoria_pico_mb} MB |${hayWasm ? ` ${d.wasm_carga_ms ?? "-"} ms |` : ""}`);
    }
    l.push(
        "",
        "---",
        "",
        "## 2. Tiempo por ruta",
        "",
        "* **Nativo (persistente)**: `motor.calcular()` con el grafo ya cargado (snapping + A\\* + instrucciones + JSON), sin caché.",
        ...(hayWasm ? ["* **WASM**: lo mismo con el motor WebAssembly (`cargarMotorWasm()` / `crearMotorWeb()`), medido en Node."] : []),
        "* **calcularRuta()**: tiempo real del proceso completo (arrancar el ejecutable, cargar el grafo y calcular).",
        "* **A\\***: parte del tiempo nativo que corresponde solo a la búsqueda de caminos.",
        "",
        "Las paradas de los escenarios de 25 y 50 puntos en Hermosillo son aleatorias (semilla fija) y se visitan en ese " +
        "orden, sin optimizar; por eso sus distancias son mayores que las de una ruta real.",
        "",
    );
    for (const d of resultados) {
        l.push(`### ${d.etiqueta}`, "",
            `| Escenario | Paradas | Distancia | Nativo (persistente) |${hayWasm ? " WASM |" : ""} calcularRuta() | A\\* |`,
            `| :--- | ---: | ---: | ---: |${hayWasm ? " ---: |" : ""} ---: | ---: |`);
        for (const e of d.escenarios) {
            if (e.error) { l.push(`| ${e.nombre} | ${e.puntos} | ❌ ${e.error} | |${hayWasm ? " |" : ""} | |`); continue; }
            l.push(`| ${e.nombre} | ${e.puntos} | ${e.distancia_km} km | **${e.total_ms} ms** |${hayWasm ? ` ${e.wasm_ms ?? "-"} ms |` : ""} ` +
                `${e.proceso_cli_ms} ms | ${e.astar_ms} ms |`);
        }
        l.push("");
    }

    l.push("---", "", "## 3. Instrucciones de navegación", "",
        "| Grafo | Escenario | Instrucciones | Recto / Der. / Izq. | Metros por instrucción | Distancia sin nombre de calle |",
        "| :--- | :--- | ---: | :---: | ---: | ---: |");
    for (const d of resultados) {
        for (const e of d.escenarios) {
            if (e.error) continue;
            const i = e.instrucciones;
            l.push(`| ${d.etiqueta} | ${e.nombre} | ${i.total} | ${i.recto} / ${i.derecha} / ${i.izquierda} | ` +
                `${i.m_por_instruccion} m | ${i.pct_distancia_calle_desconocida}% |`);
        }
    }
    const ejemplo = resultados.find((d) => d.etiqueta === "Ciudad de Hermosillo")?.escenarios.find((e) => !e.error);
    if (ejemplo) l.push("", `Primeras instrucciones de *${ejemplo.nombre}* (Hermosillo):`, "", "```text", ...ejemplo.instrucciones.muestra, "```");

    const filasOpt = resultados.flatMap((d) => d.escenarios.filter((e) => e.optimizado).map((e) => [d, e]));
    if (filasOpt.length) {
        l.push("", "---", "", "## 4. Optimización del orden de las paradas", "",
            "Las mismas paradas, en el orden recibido y con `--optimizar` (`optimizar: true` en el wrapper). La primera " +
            "parada se mantiene como inicio. El tiempo incluye la matriz de distancias por la red entre todas las paradas, " +
            "que el motor nativo reparte entre varios hilos (WebAssembly usa uno).",
            "",
            `| Grafo | Escenario | Paradas | Orden recibido | Optimizado | Ahorro | Método | calcularRuta() |${hayWasm ? " WASM |" : ""}`,
            `| :--- | :--- | ---: | ---: | ---: | ---: | :--- | ---: |${hayWasm ? " ---: |" : ""}`);
        for (const [d, e] of filasOpt) {
            const o = e.optimizado;
            const ahorro = (100 * (e.distancia_km - o.distancia_km)) / e.distancia_km;
            l.push(`| ${d.etiqueta} | ${e.nombre} | ${e.puntos} | ${e.distancia_km} km | **${o.distancia_km} km** | ` +
                `${ahorro.toFixed(0)}% | ${o.metodo} | ${o.proceso_cli_ms} ms |${hayWasm ? ` ${o.wasm_ms ?? "-"} ms |` : ""}`);
        }
    }

    const base = resultados.find((d) => d.etiqueta === "Ciudad de Hermosillo");
    const dirigido = resultados.find((d) => d.etiqueta === "Ciudad de Hermosillo (respetando sentidos)");
    if (base && dirigido) {
        l.push("", "---", "", "## 5. Calles de un solo sentido", "",
            "El grafo de producción agrega cada arista también en sentido contrario, por lo que el motor puede trazar rutas " +
            "en contrasentido. Comparación en Hermosillo con un grafo que respeta los sentidos (`ruta-craft-osm generar --respetar-sentido`):",
            "",
            `* Archivo: ${base.tamano_mb} MB → ${dirigido.tamano_mb} MB; carga: ${base.carga_ms} ms → ${dirigido.carga_ms} ms; ` +
            `aristas: ${miles(base.aristas)} → ${miles(dirigido.aristas)}.`,
            "",
            "| Escenario | Ignorando sentidos | Respetando sentidos | Diferencia |",
            "| :--- | ---: | ---: | ---: |");
        base.escenarios.forEach((a, i) => {
            const b = dirigido.escenarios[i];
            if (!b || a.error || b.error || !a.distancia_km) return;
            const dif = (100 * (b.distancia_km - a.distancia_km)) / a.distancia_km;
            l.push(`| ${a.nombre} | ${a.distancia_km} km | ${b.distancia_km} km | ${dif >= 0 ? "+" : ""}${dif.toFixed(1)}% |`);
        });
    }
    l.push("");
    return l.join("\n");
}

await main();
