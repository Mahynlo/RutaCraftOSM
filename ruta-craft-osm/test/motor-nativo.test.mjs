// Pruebas del motor nativo (CLI de RutaCraftOSM_c): modo clásico, servidor, formatos de grafo,
// exactitud de los algoritmos, errores, optimización y rendimiento.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
    aleatorio, calcularCli, CLI, correr, dijkstra, DOS_PUNTOS, escribirRCO1, GRAFO, haversine, largoPolilinea, PAQUETE,
    RUTA_MUNICIPAL, servir, SIN_CLI, tmpDir, TRES_PUNTOS,
} from "./ayudantes.mjs";

const require = createRequire(import.meta.url);
const { leerRCO2, escribirRCO2 } = require("../dist/generador/index.js");
const G = leerRCO2(fs.readFileSync(GRAFO));
const coord = (i) => [G.coords[2 * i], G.coords[2 * i + 1]];

describe("CLI clásica", { skip: SIN_CLI }, () => {
    test("--array y --stdout", (t) => {
        const r = correr(["--grafo", GRAFO, "--array", "29.065639", "-110.056448", "29.059486", "-110.053973", "--stdout", "--sin-cache"],
            { cwd: tmpDir(t) });
        assert.equal(r.codigo, 0, r.stderr);
        const { resultado } = JSON.parse(r.stdout);
        assert.ok(resultado.distancia_total_m > 0);
        assert.ok(resultado.instrucciones.length > 0);
    });

    test("--puntos como texto JSON", (t) => {
        const r = correr(["--grafo", GRAFO, "--puntos", JSON.stringify(DOS_PUNTOS), "--stdout", "--sin-cache"], { cwd: tmpDir(t) });
        assert.equal(r.codigo, 0, r.stderr);
        assert.ok(JSON.parse(r.stdout).resultado.ruta.length > 1);
    });

    test("--salida escribe el resultado en un archivo", (t) => {
        const salida = path.join(tmpDir(t), "salida.json");
        const r = correr(["--grafo", GRAFO, "--puntos", JSON.stringify(DOS_PUNTOS), "--salida", salida, "--sin-cache"]);
        assert.equal(r.codigo, 0, r.stderr);
        assert.ok("distancia_total_km" in JSON.parse(fs.readFileSync(salida, "utf8")));
    });

    test("la distancia reportada es el largo de la polilínea (incluido el primer tramo)", () => {
        for (const puntos of [DOS_PUNTOS, TRES_PUNTOS]) {
            const d = calcularCli(puntos);
            assert.ok(Math.abs(d.distancia_total_m - largoPolilinea(d.ruta)) <= 0.2);
        }
    });

    test("las instrucciones cubren toda la ruta", () => {
        const d = calcularCli(TRES_PUNTOS);
        const suma = d.instrucciones.reduce((s, i) => s + i.distancia_m, 0);
        // Cada instrucción se redondea a 0.1 m
        assert.ok(Math.abs(suma - d.distancia_total_m) <= 0.05 * d.instrucciones.length + 0.1);
        assert.deepEqual(d.instrucciones[0].desde, d.ruta[0]);
        assert.deepEqual(d.instrucciones.at(-1).hacia, d.ruta.at(-1));
    });

    test("mismo punto: distancia 0 y sin instrucciones", () => {
        const d = calcularCli([DOS_PUNTOS[0], DOS_PUNTOS[0]]);
        assert.equal(d.distancia_total_m, 0);
        assert.deepEqual(d.instrucciones, []);
    });

    test("--sin-cache no escribe archivos", (t) => {
        const dir = tmpDir(t);
        const r = correr(["--grafo", GRAFO, "--sin-cache", "--puntos", JSON.stringify(TRES_PUNTOS)], { cwd: dir });
        assert.equal(r.codigo, 0, r.stderr);
        assert.deepEqual(fs.readdirSync(dir), []);
    });

    test("el caché se guarda y se reutiliza", (t) => {
        const cache = path.join(tmpDir(t), "cache.json");
        const args = ["--grafo", GRAFO, "--puntos", JSON.stringify(TRES_PUNTOS), "--cache", cache];
        const primera = correr(args);
        assert.equal(primera.codigo, 0, primera.stderr);
        assert.equal(Object.keys(JSON.parse(fs.readFileSync(cache, "utf8"))).length, 2);  // Un tramo por par de puntos
        const segunda = correr(args);
        assert.deepEqual(JSON.parse(segunda.stdout), JSON.parse(primera.stdout));
    });

    test("errores de entrada", () => {
        const casos = [
            [[], "debes proporcionar los puntos gps"],
            [["--array", "29.06", "-110.05", "29.05"], "cantidad impar de coordenadas"],
            [["--puntos", "[[29.06, -110.05], [MALFORMADO]]"], "error al interpretar puntos"],
        ];
        for (const [args, mensaje] of casos) {
            const r = correr(["--grafo", GRAFO, "--sin-cache", ...args]);
            assert.equal(r.codigo, 2, args.join(" "));
            assert.match(r.stderr.toLowerCase(), new RegExp(mensaje));
        }
    });

    test("--version coincide con package.json y CMakeLists.txt", () => {
        // En un pre-release (p. ej. 0.3.0-rc.1) CMake solo lleva la parte numérica
        const version = JSON.parse(fs.readFileSync(path.join(PAQUETE, "package.json"), "utf8")).version.split("-")[0];
        const cmake = fs.readFileSync(path.join(PAQUETE, "..", "RutaCraftOSM_c", "CMakeLists.txt"), "utf8");
        assert.equal(cmake.match(/project\(RutaCraftOSM VERSION ([\d.]+)/)[1], version);
        const r = correr(["--version"]);
        assert.equal(r.codigo, 0);
        assert.equal(r.stdout.trim(), `ruta-craft-osm ${version}`);
    });

    test("grafo inexistente", () => {
        const r = correr(["--grafo", "no_existe.bin", "--puntos", JSON.stringify(DOS_PUNTOS), "--sin-cache"]);
        assert.equal(r.codigo, 3);
        assert.match(r.stderr.toLowerCase(), /no existe/);
    });
});

describe("modo servidor", { skip: SIN_CLI }, () => {
    test("responde por id y aísla los errores", () => {
        const r = servir([
            { id: 1, puntos: TRES_PUNTOS },
            "esto no es json",
            { id: 2, puntos: [] },
            "",
            { id: "abc", puntos: DOS_PUNTOS },
        ].map((p) => (typeof p === "string" ? p : JSON.stringify(p))));
        assert.deepEqual(r.map((x) => x.id), [1, null, 2, "abc"]);
        assert.deepEqual(r.map((x) => x.ok), [true, false, false, true]);
        assert.match(r[2].error.toLowerCase(), /vacia/);
    });

    test("da el mismo resultado que el modo clásico", () => {
        const [r] = servir([{ puntos: TRES_PUNTOS }]);
        assert.deepEqual(r.resultado, calcularCli(TRES_PUNTOS));
    });

    test("guarda el caché al cerrar", (t) => {
        const cache = path.join(tmpDir(t), "cache.json");
        servir([{ puntos: TRES_PUNTOS }], ["--cache", cache]);
        assert.equal(Object.keys(JSON.parse(fs.readFileSync(cache, "utf8"))).length, 2);
    });

    test("un campo booleano con otro tipo es ENTRADA_INVALIDA", () => {
        const [r] = servir([{ puntos: TRES_PUNTOS, optimizar: "si" }]);
        assert.equal(r.ok, false);
        assert.equal(r.codigo, "ENTRADA_INVALIDA");
    });
});

describe("robustez (casos de instalaciones reales)", { skip: SIN_CLI }, () => {
    test("instalación en una carpeta de usuario con acentos", (t) => {
        // Como queda la app instalada por electron-builder para un usuario "José Muñoz"
        const binDir = path.join(tmpDir(t), "José Muñoz", "AppData", "Programs", "aguavp", "bin");
        fs.mkdirSync(path.join(binDir, "grafos"), { recursive: true });
        const exe = path.join(binDir, path.basename(CLI));
        fs.copyFileSync(CLI, exe);
        fs.chmodSync(exe, 0o755);
        fs.copyFileSync(GRAFO, path.join(binDir, "grafos", "grafo_mazatan_villapesqueira.bin"));
        const r = correr(["--sin-cache", "--puntos", JSON.stringify(DOS_PUNTOS)], { exe, cwd: tmpDir(t) });
        assert.equal(r.codigo, 0, r.stderr);
        assert.ok(JSON.parse(r.stdout).distancia_total_m > 0);
    });

    test("grafo, caché y salida en rutas con acentos", (t) => {
        const carpeta = path.join(tmpDir(t), "Año señal ñandú");
        fs.mkdirSync(carpeta);
        const grafo = path.join(carpeta, "grafo_peñasco.bin");
        fs.copyFileSync(GRAFO, grafo);
        const cache = path.join(carpeta, "caché.json");
        const salida = path.join(carpeta, "ruta_señal.json");
        const r = correr(["--grafo", grafo, "--cache", cache, "--salida", salida, "--puntos", JSON.stringify(TRES_PUNTOS)]);
        assert.equal(r.codigo, 0, r.stderr);
        assert.ok(fs.existsSync(cache));
        assert.ok(JSON.parse(fs.readFileSync(salida, "utf8")).distancia_total_m > 0);
    });

    for (const [nombre, corromper] of [
        ["un nodo que ya no existe", (tramo) => [tramo[0], "999999999999", tramo.at(-1)]],
        ["nodos que existen pero no son vecinos", (tramo) => [tramo[0], tramo.at(-1)]],
    ]) {
        test(`un caché obsoleto (${nombre}) se recalcula y se corrige`, (t) => {
            const cache = path.join(tmpDir(t), "cache.json");
            const args = ["--grafo", GRAFO, "--cache", cache, "--puntos", JSON.stringify(DOS_PUNTOS)];
            const normal = JSON.parse(correr(args).stdout);
            const datos = JSON.parse(fs.readFileSync(cache, "utf8"));
            const clave = Object.keys(datos)[0];
            datos[clave] = corromper(datos[clave]);
            fs.writeFileSync(cache, JSON.stringify(datos));

            const r = correr(args);
            assert.equal(r.codigo, 0, r.stderr);
            assert.deepEqual(JSON.parse(r.stdout).ruta, normal.ruta);
            assert.ok(!JSON.parse(fs.readFileSync(cache, "utf8"))[clave].includes("999999999999"));
        });
    }

    test("2,000 puntos por stdin", () => {
        // Con --array, 1,500 puntos superan el límite de ~32 KB de la línea de comandos de Windows
        const puntos = Array.from({ length: 2000 }, (_, i) => [29.06 + (i % 40) * 0.0003, -110.06 + Math.floor(i / 40) * 0.0003]);
        assert.equal(calcularCli(puntos).puntos_gps.length, 2000);
    });

    test("puntos inválidos por stdin", () => {
        const r = correr(["--grafo", GRAFO, "--sin-cache", "--puntos", "-"], { entrada: "esto no es json" });
        assert.equal(r.codigo, 2);
        assert.match(r.stderr.toLowerCase(), /error al interpretar puntos/);
    });
});

describe("formatos de grafo", { skip: SIN_CLI }, () => {
    test("RCO1 con aristas duplicadas da la misma ruta que RCO2", (t) => {
        const rco1 = path.join(tmpDir(t), "grafo_rco1.bin");
        fs.writeFileSync(rco1, escribirRCO1(G, true));
        assert.deepEqual(calcularCli(RUTA_MUNICIPAL, [], rco1), calcularCli(RUTA_MUNICIPAL));
    });

    test("archivos truncados o corruptos se rechazan", (t) => {
        const dir = tmpDir(t);
        const datos = fs.readFileSync(GRAFO);
        const rco1 = escribirRCO1(G);
        const n = G.osmIds.length;
        const corrupto = Buffer.from(datos);
        corrupto.writeUInt32LE(n + 5, 32 + n * 8 + n * 16 + (n + 1) * 4);  // destino fuera de rango
        const casos = {
            "rco2_truncado.bin": datos.subarray(0, datos.length >> 1),
            "rco2_basura_al_final.bin": Buffer.concat([datos, Buffer.from("xx")]),
            "rco2_destino_invalido.bin": corrupto,
            "rco1_truncado.bin": rco1.subarray(0, rco1.length - 10),
            "vacio.bin": Buffer.alloc(0),
        };
        for (const [nombre, contenido] of Object.entries(casos)) {
            const ruta = path.join(dir, nombre);
            fs.writeFileSync(ruta, contenido);
            const r = correr(["--grafo", ruta, "--sin-cache", "--puntos", JSON.stringify(TRES_PUNTOS)]);
            assert.equal(r.codigo, 3, nombre);
            assert.match(r.stderr, /formato no valido/, nombre);
        }
    });
});

describe("algoritmos", { skip: SIN_CLI }, () => {
    test("el KD-Tree devuelve el nodo más cercano exacto", () => {
        const rnd = aleatorio(3);
        let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
        for (let i = 0; i < G.osmIds.length; i++) {
            const [la, lo] = coord(i);
            latMin = Math.min(latMin, la); latMax = Math.max(latMax, la); lonMin = Math.min(lonMin, lo); lonMax = Math.max(lonMax, lo);
        }
        const puntos = Array.from({ length: 150 }, () => [latMin + rnd() * (latMax - latMin), lonMin + rnd() * (lonMax - lonMin)]);
        const r = servir(puntos.map((p) => ({ puntos: [p, p] })));
        puntos.forEach((p, k) => {
            let esperado = Infinity;
            for (let i = 0; i < G.osmIds.length; i++) esperado = Math.min(esperado, haversine(p, coord(i)));
            assert.ok(Math.abs(haversine(p, r[k].resultado.ruta[0]) - esperado) <= 0.01, `punto ${p}`);
        });
    });

    test("A* da la distancia óptima", () => {
        const rnd = aleatorio(11);
        const pares = Array.from({ length: 40 }, () => [Math.floor(rnd() * G.osmIds.length), Math.floor(rnd() * G.osmIds.length)]);
        const r = servir(pares.map(([s, t]) => ({ puntos: [coord(s), coord(t)] })));
        pares.forEach(([s, t], k) => {
            const optima = dijkstra(G, s, t);
            if (optima === null || !r[k].ok) return;
            // Tolerancia: las aristas miden con radio 6,371,009 m y haversine usa 6,371,000 m
            assert.ok(largoPolilinea(r[k].resultado.ruta) <= optima * (1 + 1e-5) + 0.5, `par ${s} -> ${t}`);
        });
    });

    test("instrucciones sin redundancias", () => {
        const rnd = aleatorio(5);
        const rutas = Array.from({ length: 15 }, () => Array.from({ length: 8 }, () => coord(Math.floor(rnd() * G.osmIds.length))));
        rutas.push(RUTA_MUNICIPAL);
        const permitidas = new Set(["Sigue recto", "Da vuelta en U"]);
        for (const modo of ["", "ligeramente ", "bruscamente "]) {
            for (const lado of ["derecha", "izquierda"]) permitidas.add(`Gira ${modo}a la ${lado}`);
        }
        for (const r of servir(rutas.map((puntos) => ({ puntos })))) {
            if (!r.ok) continue;
            const ins = r.resultado.instrucciones;
            for (const i of ins) assert.ok(permitidas.has(i.accion), i.accion);
            if (ins.length > 1) assert.ok(ins.every((i) => i.distancia_m >= 15), "tramo corto sin absorber");
            for (let k = 1; k < ins.length; k++) {
                // Dos instrucciones seguidas en la misma calle solo con vuelta en U o giro cerrado
                if (ins[k].calle === ins[k - 1].calle && ins[k].calle !== "desconocida") {
                    assert.ok(["Da vuelta en U", "Gira bruscamente a la derecha", "Gira bruscamente a la izquierda"].includes(ins[k].accion));
                }
            }
            const suma = ins.reduce((s, i) => s + i.distancia_m, 0);
            assert.ok(Math.abs(suma - r.resultado.distancia_total_m) <= 0.05 * ins.length + 0.1);
        }
    });
});

describe("errores", { skip: SIN_CLI }, () => {
    test("códigos de salida por tipo de error", () => {
        const casos = [
            [["--opcion-que-no-existe"], 2],
            [["--grafo"], 2],
            [["--array", "29.06", "abc"], 2],
            [["--optimizar", "--regresar", "--fijar-final", "--puntos", JSON.stringify(DOS_PUNTOS)], 2],
            [["--grafo", "no_existe.bin", "--puntos", JSON.stringify(DOS_PUNTOS)], 3],
        ];
        for (const [args, codigo] of casos) {
            const r = correr(["--sin-cache", ...args]);
            assert.equal(r.codigo, codigo, `${args.join(" ")}: ${r.stderr}`);
            assert.ok(r.stderr.startsWith("Error: "), r.stderr);
        }
    });

    test("códigos en modo servidor", () => {
        const r = servir([
            "no es json",
            JSON.stringify({ id: 1, puntos: [] }),
            JSON.stringify({ id: 2, puntos: DOS_PUNTOS, regresar: true, fijar_final: true }),
            JSON.stringify({ id: 3, puntos: DOS_PUNTOS }),
        ]);
        assert.deepEqual(r.map((x) => x.codigo), ["ENTRADA_INVALIDA", "ENTRADA_INVALIDA", "ENTRADA_INVALIDA", undefined]);
        assert.ok(r[3].ok);
    });

    test("SIN_RUTA tiene su propio código", (t) => {
        // Dos componentes desconectadas
        const islas = {
            osmIds: Float64Array.from([1, 2, 3, 4]),
            coords: Float64Array.from([29.0, -110.0, 29.0, -110.001, 29.1, -110.0, 29.1, -110.001]),
            inicio: Uint32Array.from([0, 1, 2, 3, 4]),
            destino: Uint32Array.from([1, 0, 3, 2]),
            peso: Float32Array.from([97, 97, 97, 97]),
            nombreId: Uint32Array.from([1, 1, 2, 2]),
            nombres: ["", "A", "B"],
            dirigido: false,
        };
        const ruta = path.join(tmpDir(t), "islas.bin");
        fs.writeFileSync(ruta, escribirRCO2(islas));
        const r = correr(["--grafo", ruta, "--sin-cache", "--puntos", "[[29.0, -110.0], [29.1, -110.0]]"]);
        assert.equal(r.codigo, 4, r.stderr);
        assert.match(r.stderr, /No se encontro ruta/);
    });
});

describe("optimización del orden", { skip: SIN_CLI }, () => {
    // Paradas dentro de Mazatán (la zona con más calles del grafo)
    const cercanos = [];
    for (let i = 0; i < G.osmIds.length; i++) {
        const [la, lo] = coord(i);
        if (Math.abs(la - 29.0) < 0.01 && Math.abs(lo + 110.14) < 0.01) cercanos.push([la, lo]);
    }
    const alAzar = (n, semilla) => {
        const rnd = aleatorio(semilla);
        return Array.from({ length: n }, () => cercanos[Math.floor(rnd() * cercanos.length)]);
    };
    const pedir = (peticiones) => {
        const r = servir(peticiones);
        for (const x of r) assert.ok(x.ok, JSON.stringify(x));
        return r.map((x) => x.resultado);
    };

    test("orden válido y nunca peor que el recibido", () => {
        for (const [semilla, n] of [[1, 6], [2, 12], [3, 25]]) {
            const puntos = alAzar(n, semilla);
            const [original, optimizada] = pedir([{ puntos }, { puntos, optimizar: true }]);
            const { orden } = optimizada;
            assert.equal(orden[0], 0);
            assert.deepEqual([...orden].sort((a, b) => a - b), Array.from({ length: n }, (_, i) => i));
            assert.deepEqual(optimizada.puntos_gps, orden.map((i) => puntos[i]));
            assert.ok(optimizada.distancia_total_m <= original.distancia_total_m + 1.0);
            assert.equal(optimizada.optimizacion.metodo, n - 1 <= 8 ? "exacto" : "heuristico");
        }
    });

    test("no empeora una ruta que ya viene ordenada", () => {
        for (const opciones of [{}, { regresar: true }, { fijar_final: true }]) {
            const [r] = pedir([{ puntos: RUTA_MUNICIPAL, optimizar: true, ...opciones }]);
            assert.ok(r.optimizacion.distancia_optimizada_m <= r.optimizacion.distancia_original_m, JSON.stringify(opciones));
        }
    });

    test("el método exacto coincide con la fuerza bruta", () => {
        const puntos = alAzar(6, 9);
        const permutaciones = [];
        const permutar = (resto, actual) => {
            if (!resto.length) return permutaciones.push([0, ...actual]);
            resto.forEach((x, i) => permutar([...resto.slice(0, i), ...resto.slice(i + 1)], [...actual, x]));
        };
        permutar([1, 2, 3, 4, 5], []);
        const r = pedir([...permutaciones.map((o) => ({ puntos: o.map((i) => puntos[i]) })), { puntos, optimizar: true }]);
        const mejor = Math.min(...r.slice(0, -1).map((x) => x.distancia_total_m));
        assert.ok(Math.abs(r.at(-1).distancia_total_m - mejor) <= 1.0);
    });

    test("regresar al inicio y fijar el final", () => {
        const puntos = alAzar(10, 4);
        const [regresar, fijar, soloRegresar] = pedir([
            { puntos, optimizar: true, regresar: true },
            { puntos, optimizar: true, fijar_final: true },
            { puntos, regresar: true },
        ]);
        assert.equal(regresar.orden[0], 0);
        assert.equal(regresar.orden.at(-1), 0);
        assert.equal(regresar.orden.length, 11);
        assert.equal(fijar.orden[0], 0);
        assert.equal(fijar.orden.at(-1), 9);
        assert.deepEqual(soloRegresar.orden, [...Array.from({ length: 10 }, (_, i) => i), 0]);
        assert.ok(!("optimizacion" in soloRegresar));
    });

    test("la heurística mejora mucho un orden al azar", () => {
        const [r] = pedir([{ puntos: alAzar(40, 5), optimizar: true }]);
        assert.ok(r.optimizacion.distancia_optimizada_m < 0.6 * r.optimizacion.distancia_original_m);
    });

    test("la ruta optimizada mide lo que dice la matriz y sus tramos son caminos válidos", () => {
        const puntos = alAzar(30, 8);
        const [r] = pedir([{ puntos, optimizar: true, regresar: true }]);
        // La distancia de la matriz (pesos float32) y la de la polilínea (haversine) casi coinciden
        assert.ok(Math.abs(r.optimizacion.distancia_optimizada_m - r.distancia_total_m) < 0.002 * r.distancia_total_m + 1);
        assert.ok(Math.abs(r.distancia_total_m - largoPolilinea(r.ruta)) <= 0.2);
    });
});

describe("rendimiento", { skip: SIN_CLI }, () => {
    // Detecta regresiones graves (p. ej. un A* que se vuelva lineal). Márgenes ~50-100 veces los
    // tiempos medidos, porque los equipos de CI son lentos y variables.
    test("50 rutas de 23 paradas en modo servidor", () => {
        const inicio = performance.now();
        const r = servir(Array.from({ length: 50 }, () => ({ puntos: RUTA_MUNICIPAL })));
        const total = performance.now() - inicio;
        assert.equal(r.length, 50);
        assert.ok(total < 4000, `50 rutas tardaron ${total.toFixed(0)} ms`);  // Hoy: ~40 ms
    });
});
