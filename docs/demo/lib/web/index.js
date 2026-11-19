// Entrada para el navegador: `import { crearMotorWeb, generarGrafo } from "ruta-craft-osm/web"`.
//
//   - crearMotorWeb(): motor WebAssembly dentro de un Web Worker (no congela la página).
//   - cargarMotorWasm(): el mismo motor en el hilo actual, con llamadas síncronas (Workers, Node).
//   - generarGrafo(): genera el grafo de una zona desde OpenStreetMap, también en el navegador.
import { ErrorRutaCraft, validarEntrada, } from "../comun/tipos.js";
export * from "../comun/tipos.js";
export * from "../generador/index.js";
export { cargarMotorWasm, MotorWasm } from "./motor-wasm.js";
/** Descarga un grafo RCO2. */
export async function descargarGrafo(url) {
    const r = await fetch(url);
    if (!r.ok)
        throw new ErrorRutaCraft("GRAFO_INVALIDO", `No se pudo descargar el grafo (${r.status} ${r.statusText}): ${url}`);
    return new Uint8Array(await r.arrayBuffer());
}
/** Crea el motor en un Web Worker y carga el grafo. */
export async function crearMotorWeb(opciones) {
    const { grafo } = opciones;
    const bytes = typeof grafo === "string" || grafo instanceof URL ? await descargarGrafo(grafo)
        : grafo instanceof Uint8Array ? grafo : new Uint8Array(grafo);
    const motor = new MotorWeb(bytes, opciones);
    await motor.iniciar();
    return motor;
}
const TIMEOUT_DEFAULT_MS = 30000;
export class MotorWeb {
    /** Usa crearMotorWeb(). */
    constructor(grafo, opciones) {
        this.grafo = grafo;
        this.opciones = opciones;
        this.worker = null;
        this.arranque = null;
        this.infoGrafo = { nodos: 0, aristas: 0, dirigido: false };
        this.siguienteId = 1;
        this.pendientes = new Map();
        this.cerrado = false;
    }
    get info() {
        return { ...this.infoGrafo };
    }
    /** Calcula la ruta en el Worker. */
    async calcular(puntos, orden = {}) {
        const errorEntrada = validarEntrada(puntos, orden);
        if (errorEntrada)
            throw errorEntrada;
        await this.iniciar();
        return this.enviar("calcular", { puntos, orden }, true);
    }
    /** Reemplaza el grafo (y vacía el caché de tramos). */
    async cambiarGrafo(grafo) {
        this.grafo = grafo instanceof Uint8Array ? grafo : new Uint8Array(grafo);
        await this.iniciar();
        this.infoGrafo = await this.enviar("grafo", { grafo: this.grafo });
        return this.info;
    }
    async exportarCache() {
        await this.iniciar();
        return this.enviar("exportarCache", {});
    }
    async importarCache(cache) {
        await this.iniciar();
        await this.enviar("importarCache", { cache });
    }
    /** Termina el Worker. Las peticiones pendientes se rechazan. */
    async cerrar() {
        this.cerrado = true;
        this.detener(new ErrorRutaCraft("MOTOR_NO_DISPONIBLE", "El motor se cerró"));
    }
    /** @internal Inicia (o reinicia) el Worker con el grafo actual. */
    iniciar() {
        if (this.cerrado)
            return Promise.reject(new ErrorRutaCraft("MOTOR_NO_DISPONIBLE", "El motor se cerró"));
        if (this.arranque)
            return this.arranque;
        let worker;
        try {
            worker = this.opciones.crearWorker ? this.opciones.crearWorker() : crearWorkerPorDefecto();
        }
        catch (e) {
            return Promise.reject(new ErrorRutaCraft("MOTOR_NO_DISPONIBLE", "No se pudo crear el Web Worker: " + (e?.message ?? e)));
        }
        this.worker = worker;
        worker.onmessage = (ev) => this.recibir(ev.data);
        worker.onerror = (ev) => {
            ev.preventDefault?.();
            this.detener(new ErrorRutaCraft("MOTOR_NO_DISPONIBLE", "Error en el Worker del motor: " + (ev.message || "desconocido")));
        };
        const wasmUrl = this.opciones.wasmUrl !== undefined ? String(this.opciones.wasmUrl) : undefined;
        // El grafo se copia (no se transfiere) para poder reiniciar el Worker si hace falta
        this.arranque = this.enviar("iniciar", { grafo: this.grafo, wasmUrl }).then((info) => {
            this.infoGrafo = info;
            return info;
        });
        this.arranque.catch(() => { });
        return this.arranque;
    }
    enviar(op, args, conTimeout = false) {
        const worker = this.worker;
        if (!worker)
            return Promise.reject(new ErrorRutaCraft("MOTOR_NO_DISPONIBLE", "El motor no está activo"));
        const id = this.siguienteId++;
        return new Promise((resolve, reject) => {
            const pendiente = { resolve, reject };
            if (conTimeout) {
                const timeoutMs = this.opciones.timeoutMs ?? TIMEOUT_DEFAULT_MS;
                pendiente.timer = setTimeout(() => {
                    // Un cálculo en WebAssembly no se puede interrumpir: se descarta el Worker y el
                    // siguiente cálculo arranca uno nuevo
                    this.pendientes.delete(id);
                    reject(new ErrorRutaCraft("TIMEOUT", `El cálculo de ruta superó ${timeoutMs} ms`));
                    this.detener(new ErrorRutaCraft("TIMEOUT", "El motor se reinició por un cálculo que superó el tiempo máximo"));
                }, timeoutMs);
            }
            this.pendientes.set(id, pendiente);
            worker.postMessage({ id, op, args });
        });
    }
    recibir(r) {
        const pendiente = this.pendientes.get(r.id);
        if (!pendiente)
            return;
        this.pendientes.delete(r.id);
        if (pendiente.timer)
            clearTimeout(pendiente.timer);
        if (r.ok)
            pendiente.resolve(r.valor);
        else
            pendiente.reject(new ErrorRutaCraft(r.codigo ?? "INTERNO", r.error ?? "Error del motor"));
    }
    detener(error) {
        this.worker?.terminate();
        this.worker = null;
        this.arranque = null;
        for (const p of this.pendientes.values()) {
            if (p.timer)
                clearTimeout(p.timer);
            p.reject(error);
        }
        this.pendientes.clear();
    }
}
function crearWorkerPorDefecto() {
    if (typeof Worker === "undefined") {
        throw new Error("Web Workers no disponibles en este entorno; usa cargarMotorWasm() o la opción crearWorker");
    }
    return new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
}
