// Web Worker que aloja el motor WebAssembly (lo crea crearMotorWeb()). Mensajes:
//   entrada: {id, op: "iniciar" | "calcular" | "grafo" | "exportarCache" | "importarCache" | "limpiarCache", args}
//   salida:  {id, ok: true, valor} | {id, ok: false, codigo, error}
import { cargarMotorWasm, mensajeDe } from "./motor-wasm.js";
// `self` del Worker; se tipa a mano para no depender de la librería "webworker" de TypeScript
const ambito = globalThis;
let motor = null;
async function atender({ op, args }) {
    if (op === "iniciar") {
        motor = cargarMotorWasm({ grafo: args.grafo, wasmUrl: args.wasmUrl });
        return (await motor).info;
    }
    if (!motor)
        throw Object.assign(new Error("El motor no se ha iniciado"), { codigo: "MOTOR_NO_DISPONIBLE" });
    const m = await motor;
    switch (op) {
        case "calcular": return m.calcular(args.puntos, args.orden);
        case "grafo": return m.cambiarGrafo(args.grafo);
        case "exportarCache": return m.exportarCache();
        case "importarCache":
            m.importarCache(args.cache);
            return null;
        case "limpiarCache":
            m.limpiarCache();
            return null;
        default: throw new Error(`Operación desconocida: ${op}`);
    }
}
ambito.onmessage = (ev) => {
    const { id } = ev.data;
    atender(ev.data).then((valor) => ambito.postMessage({ id, ok: true, valor }), (e) => ambito.postMessage({
        id,
        ok: false,
        codigo: typeof e?.codigo === "string" ? e.codigo : "INTERNO",
        error: mensajeDe(e).replace(/^❌ /, ""),
    }));
};
