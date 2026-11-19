// Pruebas del motor WebAssembly (ruta-craft-osm/web): debe responder exactamente igual que el
// motor nativo. MotorWeb se prueba con un Worker real de Node que imita la API del navegador.
import { describe, test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { Worker } from "node:worker_threads";
import {
    aleatorio, calcularCli, DOS_PUNTOS, GRAFO, HAY_CLI, PAQUETE, RUTA_MUNICIPAL, SIN_WASM, TRES_PUNTOS,
} from "./ayudantes.mjs";

const WEB = path.join(PAQUETE, "dist", "esm", "web", "index.js");
const web = SIN_WASM ? null : await import(pathToFileURL(WEB).href);
const grafoBytes = () => new Uint8Array(fs.readFileSync(GRAFO));

const ISLAS = () => web.escribirRCO2({
    osmIds: Float64Array.from([1, 2, 3, 4]),
    coords: Float64Array.from([29.0, -110.0, 29.0, -110.001, 29.1, -110.0, 29.1, -110.001]),
    inicio: Uint32Array.from([0, 1, 2, 3, 4]),
    destino: Uint32Array.from([1, 0, 3, 2]),
    peso: Float32Array.from([97, 97, 97, 97]),
    nombreId: Uint32Array.from([1, 1, 2, 2]),
    nombres: ["", "A", "B"],
    dirigido: false,
});

async function codigoDe(promesaOFuncion) {
    try {
        await (typeof promesaOFuncion === "function" ? promesaOFuncion() : promesaOFuncion);
    } catch (e) {
        return e.codigo;
    }
    return "SIN_ERROR";
}

describe("MotorWasm", { skip: SIN_WASM }, () => {
    test("carga el grafo e informa su tamaño", async () => {
        const motor = await web.cargarMotorWasm({ grafo: grafoBytes() });
        assert.deepEqual(motor.info, { nodos: 24465, aristas: 49556, dirigido: false });
    });

    test("mismo resultado que el motor nativo, byte a byte", { skip: !HAY_CLI && "falta el motor nativo" }, async () => {
        const motor = await web.cargarMotorWasm({ grafo: grafoBytes() });
        const rnd = aleatorio(17);
        const alAzar = (n) => Array.from({ length: n }, () => [29.0 + (rnd() - 0.5) * 0.04, -110.14 + (rnd() - 0.5) * 0.04]);
        const casos = [
            [TRES_PUNTOS, {}, []],
            [RUTA_MUNICIPAL, {}, []],
            [RUTA_MUNICIPAL, { optimizar: true }, ["--optimizar"]],
            [RUTA_MUNICIPAL, { optimizar: true, regresarAlInicio: true }, ["--optimizar", "--regresar"]],
            [RUTA_MUNICIPAL, { optimizar: true, fijarFinal: true }, ["--optimizar", "--fijar-final"]],
            [alAzar(7), { optimizar: true }, ["--optimizar"]],
            [alAzar(30), { optimizar: true }, ["--optimizar"]],
            [alAzar(12), { regresarAlInicio: true }, ["--regresar"]],
        ];
        for (const [puntos, orden, args] of casos) {
            motor.limpiarCache();
            const enWasm = motor.calcular(puntos, orden);
            assert.equal(JSON.stringify(enWasm), JSON.stringify(calcularCli(puntos, args)), JSON.stringify(orden));
        }
    });

    test("errores con código", async () => {
        const motor = await web.cargarMotorWasm({ grafo: grafoBytes() });
        assert.equal(await codigoDe(() => motor.calcular([])), "ENTRADA_INVALIDA");
        assert.equal(await codigoDe(() => motor.calcular(DOS_PUNTOS, { regresarAlInicio: true, fijarFinal: true })), "ENTRADA_INVALIDA");
        assert.equal(await codigoDe(() => motor.cambiarGrafo(new Uint8Array([1, 2, 3]))), "GRAFO_INVALIDO");
        assert.equal(motor.info.nodos, 24465, "un grafo inválido no reemplaza al cargado");
        assert.ok(motor.calcular(DOS_PUNTOS).distancia_total_m > 0, "el motor sigue funcionando");
        assert.equal(await codigoDe(web.cargarMotorWasm({ grafo: new Uint8Array(10) })), "GRAFO_INVALIDO");

        motor.cambiarGrafo(ISLAS());
        assert.equal(await codigoDe(() => motor.calcular([[29.0, -110.0], [29.1, -110.0]])), "SIN_RUTA");
    });

    test("caché: exportar, importar y limpiar", async () => {
        const a = await web.cargarMotorWasm({ grafo: grafoBytes() });
        const ruta = a.calcular(TRES_PUNTOS);
        const cache = a.exportarCache();
        assert.equal(Object.keys(cache).length, 2);

        const b = await web.cargarMotorWasm({ grafo: grafoBytes() });
        b.importarCache(cache);
        assert.deepEqual(b.exportarCache(), cache);
        assert.deepEqual(b.calcular(TRES_PUNTOS), ruta);
        b.limpiarCache();
        assert.deepEqual(b.exportarCache(), {});
        assert.equal(await codigoDe(() => b.importarCache("no es un objeto")), "ENTRADA_INVALIDA");
    });

    test("varias instancias independientes", async () => {
        const [a, b] = await Promise.all([
            web.cargarMotorWasm({ grafo: grafoBytes() }),
            web.cargarMotorWasm({ grafo: ISLAS() }),
        ]);
        assert.equal(a.info.nodos, 24465);
        assert.equal(b.info.nodos, 4);
        assert.ok(a.calcular(DOS_PUNTOS).distancia_total_m > 0);
    });

    test("genera un grafo y lo usa sin pasar por disco", async () => {
        const { bytes } = await web.generarGrafo({
            caja: { sur: 28.99, oeste: -110.15, norte: 29.01, este: -110.13 },
            datosOSM: { elements: [
                { type: "node", id: 1, lat: 29.0, lon: -110.14 },
                { type: "node", id: 2, lat: 29.0, lon: -110.139 },
                { type: "node", id: 3, lat: 29.001, lon: -110.139 },
                { type: "way", id: 10, nodes: [1, 2, 3], tags: { highway: "residential", name: "Calle" } },
            ] },
        });
        const motor = await web.cargarMotorWasm({ grafo: bytes });
        const r = motor.calcular([[29.0, -110.14], [29.001, -110.139]]);
        assert.equal(r.instrucciones[0].calle, "Calle");
        assert.ok(Math.abs(r.distancia_total_m - 208.6) < 1);
    });
});

// Adaptador: Worker de Node con la API de un Web Worker (postMessage/onmessage/terminate)
function crearWorkerNode() {
    const codigo = `
        const { parentPort } = require("node:worker_threads");
        globalThis.postMessage = (m) => parentPort.postMessage(m);
        parentPort.on("message", (data) => globalThis.onmessage && globalThis.onmessage({ data }));
        import(${JSON.stringify(pathToFileURL(path.join(PAQUETE, "dist", "esm", "web", "worker.js")).href)});
    `;
    const w = new Worker(codigo, { eval: true });
    const adaptador = {
        onmessage: null,
        onerror: null,
        postMessage: (m) => w.postMessage(m),
        terminate: () => { w.terminate(); },
    };
    w.on("message", (data) => adaptador.onmessage?.({ data }));
    w.on("error", (e) => adaptador.onerror?.({ message: e.message, preventDefault() {} }));
    return adaptador;
}

describe("MotorWeb (Worker)", { skip: SIN_WASM }, () => {
    test("calcula en el Worker con el mismo resultado que en el hilo actual", async () => {
        const directo = await web.cargarMotorWasm({ grafo: grafoBytes() });
        const motor = await web.crearMotorWeb({ grafo: grafoBytes(), crearWorker: crearWorkerNode });
        try {
            assert.equal(motor.info.nodos, 24465);
            const pedidos = [TRES_PUNTOS, RUTA_MUNICIPAL, DOS_PUNTOS];
            const resultados = await Promise.all(pedidos.map((p) => motor.calcular(p, { optimizar: true })));
            resultados.forEach((r, i) => {
                directo.limpiarCache();
                assert.deepEqual(r, directo.calcular(pedidos[i], { optimizar: true }));
            });
            assert.equal(Object.keys(await motor.exportarCache()).length > 0, true);
            assert.equal(await codigoDe(motor.calcular([[95, 0]])), "ENTRADA_INVALIDA");
        } finally {
            await motor.cerrar();
        }
    });

    test("errores del motor llegan con su código y el Worker sigue activo", async () => {
        const motor = await web.crearMotorWeb({ grafo: ISLAS(), crearWorker: crearWorkerNode });
        try {
            assert.equal(await codigoDe(motor.calcular([[29.0, -110.0], [29.1, -110.0]])), "SIN_RUTA");
            assert.equal(await codigoDe(motor.cambiarGrafo(new Uint8Array(5))), "GRAFO_INVALIDO");
            const info = await motor.cambiarGrafo(grafoBytes());
            assert.equal(info.nodos, 24465);
            assert.ok((await motor.calcular(DOS_PUNTOS)).distancia_total_m > 0);
        } finally {
            await motor.cerrar();
        }
        assert.equal(await codigoDe(motor.calcular(DOS_PUNTOS)), "MOTOR_NO_DISPONIBLE");
    });

    test("un cálculo que excede el tiempo reinicia el Worker", async () => {
        const motor = await web.crearMotorWeb({ grafo: grafoBytes(), crearWorker: crearWorkerNode, timeoutMs: 40 });
        try {
            // ~200 paradas en todo el grafo: la matriz de distancias tarda bastante más de 40 ms
            const rnd = aleatorio(9);
            const muchas = Array.from({ length: 199 }, () => [28.8 + rnd() * 0.5, -110.38 + rnd() * 0.5]);
            assert.equal(await codigoDe(motor.calcular(muchas, { optimizar: true })), "TIMEOUT");
            assert.ok((await motor.calcular(DOS_PUNTOS)).distancia_total_m > 0, "el siguiente cálculo usa un Worker nuevo");
        } finally {
            await motor.cerrar();
        }
    });

    test("grafo por URL (fetch)", async () => {
        const original = globalThis.fetch;
        globalThis.fetch = async (url) => ({ ok: true, arrayBuffer: async () => new Uint8Array(fs.readFileSync(GRAFO)).buffer, url });
        try {
            const motor = await web.crearMotorWeb({ grafo: "https://ejemplo.invalid/grafo.bin", crearWorker: crearWorkerNode });
            assert.equal(motor.info.nodos, 24465);
            await motor.cerrar();
        } finally {
            globalThis.fetch = original;
        }
    });

    test("sin Web Workers en el entorno: error claro", async () => {
        assert.equal(await codigoDe(web.crearMotorWeb({ grafo: grafoBytes() })), "MOTOR_NO_DISPONIBLE");
    });
});
