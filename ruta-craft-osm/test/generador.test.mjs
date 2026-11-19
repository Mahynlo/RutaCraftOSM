// Pruebas del generador de grafos (reemplazo de los scripts de Python con OSMnx). No usan internet:
// los datos de Overpass son un fixture sintético o un fetch simulado.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
    aleatorio, calcularCli, correr, DATOS, GRAFO, PAQUETE, SIN_CLI, tmpDir,
} from "./ayudantes.mjs";

const require = createRequire(import.meta.url);
const gen = require("../dist/generador/index.js");

// ---------------------------------------------------------------------------------------------
// Fixture: una cuadrícula pequeña cerca de Mazatán con un caso de cada regla
//
//   1 ── 2 ── 3 → 4 ← 5 ⟳ 6        (3→4 oneway=yes, 5→4 por oneway=-1, 5→6 glorieta)
//   │    │    └── 9 (fuera de la zona)
//   7    8 (MEX 15, sin nombre)     11 ── 12 (isla desconectada)
//   (1-7 footway, excluida)         13 (dentro del hueco de la zona)
// ---------------------------------------------------------------------------------------------
const BASE = [29.0, -110.14];
const D = 0.001;  // ~100 m
const POS = {
    1: [0, 0], 2: [0, 1], 3: [0, 2], 4: [0, 3], 5: [0, 4], 6: [0, 5],
    7: [-1, 0], 8: [-1, 1], 9: [0, 9], 11: [-3, 4], 12: [-3, 5], 13: [-2, 2], 14: [-1, 2],
};
const nodo = (id) => ({ type: "node", id, lat: BASE[0] + POS[id][0] * D, lon: BASE[1] + POS[id][1] * D });
const via = (id, nodes, tags) => ({ type: "way", id, nodes, tags: { highway: "residential", ...tags } });

const FIXTURE = {
    elements: [
        ...Object.keys(POS).map((id) => nodo(Number(id))),
        via(100, [1, 2, 3], { name: "Calle A" }),
        via(101, [1, 2], { name: "Calle A duplicada" }),          // mismo tramo: se queda el primer nombre
        via(102, [3, 4], { name: "Calle B", oneway: "yes" }),
        via(103, [4, 5], { name: "Calle C", oneway: "-1" }),
        via(104, [5, 6], { name: "Glorieta", junction: "roundabout" }),
        via(105, [2, 8], { ref: "MEX 15" }),
        via(106, [1, 7], { highway: "footway", name: "Andador" }),
        via(107, [8, 7], { highway: "service", name: "Servicio" }),
        via(108, [7, 8], { access: "private", name: "Privada" }),
        via(109, [3, 9], { name: "Salida" }),
        via(110, [11, 12], { name: "Isla" }),
        via(111, [3, 14, 13], { name: "Al hueco" }),
        { type: "relation", id: 999 },
    ],
};

// Zona: rectángulo que deja fuera al nodo 9, con un hueco alrededor del nodo 13
const lonlat = (fila, col) => [BASE[1] + col * D, BASE[0] + fila * D];
const ZONA = {
    type: "Feature",
    geometry: {
        type: "Polygon",
        coordinates: [
            [lonlat(-4, -1), lonlat(-4, 7), lonlat(1, 7), lonlat(1, -1), lonlat(-4, -1)],
            [lonlat(-2.5, 1.5), lonlat(-2.5, 2.5), lonlat(-1.5, 2.5), lonlat(-1.5, 1.5), lonlat(-2.5, 1.5)],
        ],
    },
};
const POLIGONOS = gen.poligonosDeGeoJSON(ZONA);

/** Aristas del grafo como {"osm_u>osm_v": {peso, nombre}} */
function aristas(g) {
    const r = {};
    for (let u = 0; u < g.osmIds.length; u++) {
        for (let e = g.inicio[u]; e < g.inicio[u + 1]; e++) {
            r[`${g.osmIds[u]}>${g.osmIds[g.destino[e]]}`] = { peso: g.peso[e], nombre: g.nombres[g.nombreId[e]] };
        }
    }
    return r;
}

describe("construcción del grafo", () => {
    test("ignorando sentidos: todas las calles en ambos sentidos, recorte y componente principal", () => {
        const { grafo, estadisticas } = gen.construirGrafo(FIXTURE, { poligonos: POLIGONOS });
        const ids = [...grafo.osmIds].sort((a, b) => a - b);
        assert.deepEqual(ids, [1, 2, 3, 4, 5, 6, 8, 14]);  // 7: solo vías excluidas; 9: fuera; 13: hueco; 11-12: isla
        assert.equal(grafo.dirigido, false);
        const a = aristas(grafo);
        for (const [u, v] of [[1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [2, 8], [3, 14]]) {
            assert.ok(a[`${u}>${v}`] && a[`${v}>${u}`], `${u}<->${v}`);
        }
        assert.equal(Object.keys(a).length, 14);
        assert.equal(estadisticas.nodosFueraDeZona, 2);    // 9 y 13
        assert.equal(estadisticas.nodosDesconectados, 2);  // 11 y 12
        assert.equal(estadisticas.vias, 9);                // sin footway, service ni access=private
    });

    test("respetando sentidos: oneway, oneway=-1 y glorietas como OSMnx", () => {
        const { grafo } = gen.construirGrafo(FIXTURE, { poligonos: POLIGONOS, respetarSentido: true });
        const a = aristas(grafo);
        assert.equal(grafo.dirigido, true);
        assert.ok(a["3>4"] && !a["4>3"], "oneway=yes");
        assert.ok(a["5>4"] && !a["4>5"], "oneway=-1 invierte el sentido");
        assert.ok(a["5>6"] && !a["6>5"], "glorieta");
        assert.ok(a["1>2"] && a["2>1"], "doble sentido");
    });

    test("pesos con haversine (radio de OSMnx) y nombres", () => {
        const { grafo } = gen.construirGrafo(FIXTURE, { poligonos: POLIGONOS });
        const a = aristas(grafo);
        const [la1, lo1] = [BASE[0], BASE[1]], [la2, lo2] = [BASE[0], BASE[1] + D];
        assert.equal(a["1>2"].peso, Math.fround(gen.haversine(la1, lo1, la2, lo2)));
        assert.equal(a["1>2"].nombre, "Calle A");  // primera vía que pasa por el tramo
        assert.equal(a["2>8"].nombre, "MEX 15");   // sin nombre: se usa la referencia
        assert.equal(gen.construirGrafo(FIXTURE, { poligonos: POLIGONOS, usarReferenciaComoNombre: false })
            .grafo.nombres.includes("MEX 15"), false);
        assert.equal(grafo.nombres[0], "");
    });

    test("conservarDesconectados y sin zona", () => {
        const conIsla = gen.construirGrafo(FIXTURE, { poligonos: POLIGONOS, conservarDesconectados: true }).grafo;
        assert.ok([...conIsla.osmIds].includes(11) && [...conIsla.osmIds].includes(12));
        const sinZona = gen.construirGrafo(FIXTURE).grafo;
        assert.ok([...sinZona.osmIds].includes(9) && [...sinZona.osmIds].includes(13));
    });

    test("filtro de vías igual al de Overpass (expresiones sin anclar)", () => {
        assert.equal(gen.esViaParaAuto({ highway: "residential" }), true);
        assert.equal(gen.esViaParaAuto({ highway: "primary", motor_vehicle: "yes" }), true);
        for (const tags of [
            { highway: "footway" }, { highway: "services" }, { highway: "residential", area: "yes" },
            { highway: "residential", motorcar: "no" }, { highway: "residential", access: "private" },
            { highway: "unclassified", service: "driveway" }, { name: "sin highway" },
        ]) {
            assert.equal(gen.esViaParaAuto(tags), false, JSON.stringify(tags));
        }
    });

    test("generarGrafo con datos ya descargados (sin internet)", async () => {
        const r = await gen.generarGrafo({ zona: ZONA, datosOSM: FIXTURE });
        assert.equal(r.estadisticas.nodos, 8);
        assert.deepEqual(gen.leerRCO2(r.bytes), r.grafo);
        await assert.rejects(gen.generarGrafo({ caja: { sur: 10, oeste: 10, norte: 10.1, este: 10.1 }, datosOSM: FIXTURE }),
            /no contiene calles/);
        await assert.rejects(gen.generarGrafo({ datosOSM: FIXTURE }), /zona/);
    });

    test("el motor respeta los sentidos de un grafo generado", { skip: SIN_CLI }, (t) => {
        const { grafo } = gen.construirGrafo(FIXTURE, { poligonos: POLIGONOS, respetarSentido: true });
        const ruta = path.join(tmpDir(t), "fixture.bin");
        fs.writeFileSync(ruta, gen.escribirRCO2(grafo));
        const p = (id) => [nodo(id).lat, nodo(id).lon];
        assert.ok(calcularCli([p(3), p(4)], [], ruta).distancia_total_m > 0);  // a favor del sentido
        const r = correr(["--grafo", ruta, "--sin-cache", "--puntos", JSON.stringify([p(4), p(3)])]);
        assert.equal(r.codigo, 4, "en contra del sentido no hay ruta");
    });
});

describe("formato RCO2", () => {
    test("leer y escribir reproduce el archivo byte a byte", () => {
        const datos = fs.readFileSync(GRAFO);
        assert.equal(Buffer.compare(Buffer.from(gen.escribirRCO2(gen.leerRCO2(datos))), datos), 0);
    });

    test("archivos corruptos se rechazan", () => {
        const datos = fs.readFileSync(GRAFO);
        assert.throws(() => gen.leerRCO2(datos.subarray(0, 100)), /RCO2 válido/);
        assert.throws(() => gen.leerRCO2(Buffer.concat([datos, Buffer.from([0])])), /tamaño/);
        const malo = Buffer.from(datos);
        malo.write("XXXX", 0, "ascii");
        assert.throws(() => gen.leerRCO2(malo), /encabezado/);
    });

    test("describirGrafo resume el grafo", () => {
        const texto = gen.describirGrafo(gen.leerRCO2(fs.readFileSync(GRAFO)));
        assert.match(texto, /24,465 nodos · 49,556 aristas/);
        assert.match(texto, /~841 km de calles/);
    });

    test("reordenar no cambia las distancias de las rutas", { skip: SIN_CLI }, (t) => {
        const g = gen.leerRCO2(fs.readFileSync(GRAFO));
        // Orden al azar (lo contrario de Hilbert) y de vuelta a Hilbert
        const rnd = aleatorio(21);
        const n = g.osmIds.length;
        const perm = Array.from({ length: n }, (_, i) => i).sort(() => rnd() - 0.5);
        const inv = new Uint32Array(n);
        perm.forEach((viejo, nuevo) => { inv[viejo] = nuevo; });
        const revuelto = { ...g, osmIds: new Float64Array(n), coords: new Float64Array(2 * n), inicio: new Uint32Array(n + 1),
            destino: new Uint32Array(g.destino.length), peso: new Float32Array(g.peso.length), nombreId: new Uint32Array(g.nombreId.length) };
        let e = 0;
        perm.forEach((viejo, nuevo) => {
            revuelto.osmIds[nuevo] = g.osmIds[viejo];
            revuelto.coords[2 * nuevo] = g.coords[2 * viejo];
            revuelto.coords[2 * nuevo + 1] = g.coords[2 * viejo + 1];
            for (let a = g.inicio[viejo]; a < g.inicio[viejo + 1]; a++, e++) {
                revuelto.destino[e] = inv[g.destino[a]]; revuelto.peso[e] = g.peso[a]; revuelto.nombreId[e] = g.nombreId[a];
            }
            revuelto.inicio[nuevo + 1] = e;
        });
        const dir = tmpDir(t);
        const rutaRevuelto = path.join(dir, "revuelto.bin");
        const rutaReordenado = path.join(dir, "reordenado.bin");
        fs.writeFileSync(rutaRevuelto, gen.escribirRCO2(revuelto));
        fs.writeFileSync(rutaReordenado, gen.escribirRCO2(gen.reordenarGrafo(revuelto)));
        for (let k = 0; k < 15; k++) {
            const i = Math.floor(rnd() * n), j = Math.floor(rnd() * n);
            const puntos = [[g.coords[2 * i], g.coords[2 * i + 1]], [g.coords[2 * j], g.coords[2 * j + 1]]];
            const base = calcularCli(puntos).distancia_total_m;
            assert.ok(Math.abs(calcularCli(puntos, [], rutaRevuelto).distancia_total_m - base) <= 0.2);
            assert.ok(Math.abs(calcularCli(puntos, [], rutaReordenado).distancia_total_m - base) <= 0.2);
        }
    });
});

describe("geometría", () => {
    test("IndiceZona coincide con la prueba directa en el límite municipal real", () => {
        const geo = JSON.parse(fs.readFileSync(path.join(DATOS, "mazatan_villapesqueira.geojson"), "utf8"));
        const poligonos = gen.poligonosDeGeoJSON(geo);
        const indice = new gen.IndiceZona(poligonos);
        const directo = (lon, lat) => poligonos.some((p) => p.filter((anillo) => {
            let dentro = false;
            for (let i = 0, j = anillo.length - 1; i < anillo.length; j = i++) {
                const [xi, yi] = anillo[i], [xj, yj] = anillo[j];
                if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
            }
            return dentro;
        }).length % 2 === 1);
        const caja = gen.cajaDePoligonos(poligonos);
        const rnd = aleatorio(4);
        let dentro = 0;
        for (let k = 0; k < 3000; k++) {
            const lon = caja.oeste + rnd() * (caja.este - caja.oeste);
            const lat = caja.sur + rnd() * (caja.norte - caja.sur);
            const esperado = directo(lon, lat);
            assert.equal(indice.contiene(lon, lat), esperado, `${lat}, ${lon}`);
            if (esperado) dentro++;
        }
        assert.ok(dentro > 500 && dentro < 2900, "la muestra cubre ambos lados del límite");
    });

    test("GeoJSON inválido", () => {
        assert.throws(() => gen.poligonosDeGeoJSON({ type: "Point", coordinates: [0, 0] }), /Polygon/);
        assert.throws(() => gen.poligonosDeGeoJSON({ type: "Polygon", coordinates: [[[0, 0], [500, 0], [1, 1], [0, 0]]] }), /inválida/);
    });

    test("dividirCaja cubre la caja sin huecos", () => {
        const caja = { sur: 28.7, oeste: -110.5, norte: 29.4, este: -109.8 };
        const mosaicos = gen.dividirCaja(caja, 0.5);
        assert.equal(mosaicos.length, 4);
        const area = (c) => (c.norte - c.sur) * (c.este - c.oeste);
        assert.ok(Math.abs(mosaicos.reduce((s, c) => s + area(c), 0) - area(caja)) < 1e-12);
        assert.equal(Math.max(...mosaicos.map((c) => c.norte)), caja.norte);
    });

    test("consulta de Overpass: filtro y caja en orden sur,oeste,norte,este", () => {
        const q = gen.consultaOverpass({ sur: 1, oeste: 2, norte: 3, este: 4 }, 60);
        assert.ok(q.startsWith("[out:json][timeout:60];"));
        assert.ok(q.includes(gen.FILTRO_VIAS_AUTO + "(1.0000000,2.0000000,3.0000000,4.0000000)"));
        assert.ok(q.includes("(._;>;)"));
    });
});

describe("descarga de Overpass (fetch simulado)", () => {
    const respuesta = (status, cuerpo) => ({
        ok: status >= 200 && status < 300,
        status,
        statusText: String(status),
        json: async () => cuerpo,
        text: async () => JSON.stringify(cuerpo),
    });

    test("une los mosaicos sin duplicados y reintenta si el servidor está ocupado", async () => {
        const consultas = [];
        let llamadas = 0;
        const fetchFalso = async (url, init) => {
            llamadas++;
            if (llamadas === 1) return respuesta(429, {});
            consultas.push(decodeURIComponent(init.body.slice(5)));
            return respuesta(200, { elements: [{ type: "node", id: 1, lat: 0, lon: 0 }, { type: "way", id: consultas.length, nodes: [] }] });
        };
        const progreso = [];
        const r = await gen.descargarOverpass({ sur: 0, oeste: 0, norte: 1, este: 0.4 },
            { fetch: fetchFalso, ladoMosaico: 0.5, esperaReintentoMs: 1, alProgresar: (m) => progreso.push(m) });
        assert.equal(consultas.length, 2);
        assert.deepEqual(r.elements.map((e) => `${e.type}/${e.id}`), ["node/1", "way/1", "way/2"]);
        assert.ok(progreso.some((m) => m.includes("reintentando")));
    });

    test("errores claros: respuesta 400 y consulta que excede el tiempo", async () => {
        await assert.rejects(gen.descargarOverpass({ sur: 0, oeste: 0, norte: 0.1, este: 0.1 },
            { fetch: async () => respuesta(400, { error: "sintaxis" }), esperaReintentoMs: 1 }), /400/);
        await assert.rejects(gen.descargarOverpass({ sur: 0, oeste: 0, norte: 0.1, este: 0.1 },
            { fetch: async () => respuesta(200, { elements: [], remark: "runtime error: Query timed out" }) }), /zona más pequeña/);
        assert.throws(() => gen.validarCaja({ sur: 2, oeste: 0, norte: 1, este: 1 }), /Caja inválida/);
    });
});

describe("CLI del paquete", () => {
    const cli = path.join(PAQUETE, "dist", "cli.js");
    const node = (args) => correr([cli, ...args], { exe: process.execPath });

    test("generar desde datos guardados, info y reordenar", (t) => {
        const dir = tmpDir(t);
        const osm = path.join(dir, "osm.json");
        const zona = path.join(dir, "zona.geojson");
        const salida = path.join(dir, "sub", "grafo.bin");
        fs.writeFileSync(osm, JSON.stringify(FIXTURE));
        fs.writeFileSync(zona, JSON.stringify(ZONA));
        let r = node(["generar", "--geojson", zona, "--desde-osm", osm, "--salida", salida, "--respetar-sentido"]);
        assert.equal(r.codigo, 0, r.stderr);
        assert.match(r.stdout, /8 nodos/);
        r = node(["info", salida]);
        assert.match(r.stdout, /Respeta los sentidos/);
        r = node(["reordenar", salida, path.join(dir, "otro.bin")]);
        assert.equal(r.codigo, 0, r.stderr);
    });

    test("errores de uso", () => {
        for (const args of [["generar"], ["generar", "--caja", "1,2,3"], ["desconocido"], ["info"]]) {
            const r = node(args);
            assert.equal(r.codigo, 2, args.join(" "));
            assert.match(r.stderr, /❌/);
        }
        assert.match(node(["--help"]).stdout, /ruta-craft-osm generar/);
    });
});
