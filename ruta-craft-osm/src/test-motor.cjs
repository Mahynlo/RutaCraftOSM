// Pruebas del wrapper: node --test src/test-motor.cjs (requiere npm run build)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { calcularRuta, crearMotorRutas, GRAFO_INCLUIDO, plataformaActual } = require("../dist/index.js");

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

function muchosPuntos(n) {
    return Array.from({ length: n }, (_, i) => [29.06 + (i % 40) * 0.0003, -110.06 + Math.floor(i / 40) * 0.0003]);
}

test("calcularRuta acepta más puntos de los que caben en la línea de comandos", async () => {
    // Antes fallaba con spawn ENAMETOOLONG a partir de ~1,300 puntos
    const r = await calcularRuta({ puntos: muchosPuntos(2000) });
    assert.equal(r.resultado.puntos_gps.length, 2000);
});

test("caché y grafo en carpetas con acentos (usuario 'José Muñoz')", async () => {
    const dir = path.join(tmpDir(), "José Muñoz", "AppData");
    fs.mkdirSync(dir, { recursive: true });
    try {
        const grafo = path.join(dir, "grafo_señal.bin");
        fs.copyFileSync(GRAFO_INCLUIDO, grafo);
        const cachePath = path.join(dir, "caché_rutas.json");

        const r = await calcularRuta({ puntos: TRES_PUNTOS, grafo, cachePath });
        assert.ok(r.resultado.distancia_total_m > 0);
        assert.ok(fs.existsSync(cachePath));

        const motor = crearMotorRutas({ grafo, cachePath });
        try {
            assert.deepEqual(await motor.calcular(TRES_PUNTOS), r.resultado);
        } finally {
            await motor.cerrar();
        }
    } finally {
        fs.rmSync(path.dirname(path.dirname(dir)), { recursive: true, force: true });
    }
});

test("los nombres de calle con acentos llegan íntegros", async () => {
    const r = await calcularRuta({ puntos: muchosPuntos(300) });
    for (const inst of r.resultado.instrucciones) {
        assert.ok(!inst.calle.includes("�"), `nombre dañado: ${inst.calle}`);
    }
});

test("si el motor no puede arrancar, las peticiones se rechazan sin tumbar el proceso", async () => {
    // Grafo inexistente: el motor termina enseguida y escribir en su stdin daría EPIPE
    const motor = crearMotorRutas({ grafo: path.join(tmpDir(), "no_existe.bin") });
    await assert.rejects(motor.calcular(TRES_PUNTOS), /terminó/);
    await assert.rejects(motor.calcular(TRES_PUNTOS), /terminó/);
    await motor.cerrar();
    await assert.rejects(calcularRuta({ puntos: TRES_PUNTOS, grafo: "no_existe.bin" }), /no existe/);
});

test("el paquete incluye el motor de esta plataforma y el grafo", () => {
    const exe = path.join(__dirname, "..", "bin", plataformaActual(), process.platform === "win32" ? "cli.exe" : "cli");
    assert.ok(fs.existsSync(exe), `falta ${exe}`);
    assert.ok(fs.existsSync(GRAFO_INCLUIDO), `falta ${GRAFO_INCLUIDO}`);
});

test("en una plataforma sin motor compilado el error lo explica", async () => {
    const original = Object.getOwnPropertyDescriptor(process, "arch");
    Object.defineProperty(process, "arch", { value: "mips" });
    try {
        await assert.rejects(calcularRuta({ puntos: TRES_PUNTOS }), /no incluye el motor para .*-mips/);
        const motor = crearMotorRutas();
        await assert.rejects(motor.calcular(TRES_PUNTOS), /no incluye el motor/);
        await motor.cerrar();
    } finally {
        Object.defineProperty(process, "arch", original);
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
