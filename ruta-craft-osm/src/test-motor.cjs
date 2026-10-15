// Pruebas del wrapper: node --test src/test-motor.cjs (requiere npm run build)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { calcularRuta, crearMotorRutas } = require("../dist/index.js");

const TRES_PUNTOS = [[29.065639, -110.056448], [29.062039, -110.059091], [29.059486, -110.053973]];

function tmpDir() {
    return fs.mkdtempSync(path.join(os.tmpdir(), "ruta-craft-"));
}

test("calcularRuta devuelve resultado y no escribe caché sin cachePath", async () => {
    const dir = tmpDir();
    const cwd = process.cwd();
    process.chdir(dir);
    try {
        const r = await calcularRuta({ puntos: TRES_PUNTOS });
        assert.ok(r.resultado.distancia_total_m > 0);
        assert.ok(r.resultado.ruta.length > 1);
        assert.deepEqual(fs.readdirSync(dir), []);
    } finally {
        process.chdir(cwd);
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("calcularRuta valida las coordenadas", async () => {
    for (const puntos of [[], [[NaN, 1]], [[95, 0]], [[29, -200]], [[29]]]) {
        await assert.rejects(calcularRuta({ puntos }));
    }
});

test("el motor persistente da el mismo resultado que calcularRuta", async () => {
    const motor = crearMotorRutas();
    try {
        const [persistente, clasico] = await Promise.all([
            motor.calcular(TRES_PUNTOS),
            calcularRuta({ puntos: TRES_PUNTOS })
        ]);
        assert.deepEqual(persistente, clasico.resultado);
    } finally {
        await motor.cerrar();
    }
});

test("el motor atiende peticiones en paralelo con su resultado correcto", async () => {
    const motor = crearMotorRutas();
    try {
        const pedidos = [TRES_PUNTOS, [TRES_PUNTOS[0], TRES_PUNTOS[2]], TRES_PUNTOS.slice(0, 2)];
        const individuales = [];
        for (const p of pedidos) individuales.push(await motor.calcular(p));
        const paralelos = await Promise.all(pedidos.map((p) => motor.calcular(p)));
        assert.deepEqual(paralelos, individuales);
    } finally {
        await motor.cerrar();
    }
});

test("el motor rechaza entradas inválidas sin caerse", async () => {
    const motor = crearMotorRutas();
    try {
        await assert.rejects(motor.calcular([[NaN, 0]]));
        assert.ok((await motor.calcular(TRES_PUNTOS)).distancia_total_m > 0);
    } finally {
        await motor.cerrar();
    }
});

test("el motor se reinicia si el proceso termina", async () => {
    const motor = crearMotorRutas();
    try {
        await motor.calcular(TRES_PUNTOS);
        const terminado = new Promise((r) => motor["proc"].once("exit", r));
        motor["proc"].kill();
        await terminado;
        assert.ok((await motor.calcular(TRES_PUNTOS)).distancia_total_m > 0);
    } finally {
        await motor.cerrar();
    }
});

test("el motor guarda el caché al cerrar", async () => {
    const dir = tmpDir();
    try {
        const cachePath = path.join(dir, "cache.json");
        const motor = crearMotorRutas({ cachePath });
        await motor.calcular(TRES_PUNTOS);
        await motor.cerrar();
        assert.equal(Object.keys(JSON.parse(fs.readFileSync(cachePath, "utf8"))).length, 2);
    } finally {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

test("el timeout rechaza la petición", async () => {
    const motor = crearMotorRutas({ timeoutMs: 1 });
    try {
        await assert.rejects(motor.calcular(TRES_PUNTOS), /superó/);
    } finally {
        await motor.cerrar();
    }
});
