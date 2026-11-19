// Entrada para el navegador: `import { crearMotorWeb, generarGrafo } from "ruta-craft-osm/web"`.
//
//   - crearMotorWeb(): motor WebAssembly dentro de un Web Worker (no congela la página).
//   - cargarMotorWasm(): el mismo motor en el hilo actual, con llamadas síncronas (Workers, Node).
//   - generarGrafo(): genera el grafo de una zona desde OpenStreetMap, también en el navegador.

import {
    CodigoErrorRuta, ErrorRutaCraft, OpcionesOrden, ResultadoRuta, validarEntrada,
} from "../comun/tipos.js";
import type { InfoGrafo } from "./motor-wasm.js";

export * from "../comun/tipos.js";
export * from "../generador/index.js";
export { cargarMotorWasm, MotorWasm } from "./motor-wasm.js";
export type { InfoGrafo, OpcionesMotorWasm } from "./motor-wasm.js";

/** Interfaz mínima de un Worker (la del navegador, o un sustituto en pruebas). */
export interface WorkerLike {
    postMessage(mensaje: unknown, transferir?: Transferable[]): void;
    terminate(): void;
    onmessage: ((ev: MessageEvent) => void) | null;
    onerror: ((ev: ErrorEvent) => void) | null;
}

export interface OpcionesMotorWeb {
    /** Grafo RCO2: bytes del archivo, o su URL (se descarga con fetch). */
    grafo: Uint8Array | ArrayBuffer | string | URL;
    /** URL de motor.wasm, si el empaquetador no lo deja junto a motor.mjs. */
    wasmUrl?: string | URL;
    /** Tiempo máximo por petición (por defecto 30000 ms). Al vencer, el Worker se reinicia. */
    timeoutMs?: number;
    /**
     * Crea el Worker. Por defecto `new Worker(new URL("./worker.js", import.meta.url), {type: "module"})`,
     * que Vite, webpack 5 y esbuild reconocen. Útil si tu empaquetador necesita otra forma.
     */
    crearWorker?: () => WorkerLike;
}

/** Descarga un grafo RCO2. */
export async function descargarGrafo(url: string | URL): Promise<Uint8Array> {
    const r = await fetch(url);
    if (!r.ok) throw new ErrorRutaCraft("GRAFO_INVALIDO", `No se pudo descargar el grafo (${r.status} ${r.statusText}): ${url}`);
    return new Uint8Array(await r.arrayBuffer());
}

/** Crea el motor en un Web Worker y carga el grafo. */
export async function crearMotorWeb(opciones: OpcionesMotorWeb): Promise<MotorWeb> {
    const { grafo } = opciones;
    const bytes = typeof grafo === "string" || grafo instanceof URL ? await descargarGrafo(grafo)
        : grafo instanceof Uint8Array ? grafo : new Uint8Array(grafo);
    const motor = new MotorWeb(bytes, opciones);
    await motor.iniciar();
    return motor;
}

interface Pendiente {
    resolve: (valor: any) => void;
    reject: (e: Error) => void;
    timer?: ReturnType<typeof setTimeout>;
}

const TIMEOUT_DEFAULT_MS = 30000;

export class MotorWeb {
    private worker: WorkerLike | null = null;
    private arranque: Promise<InfoGrafo> | null = null;
    private infoGrafo: InfoGrafo = { nodos: 0, aristas: 0, dirigido: false };
    private siguienteId = 1;
    private pendientes = new Map<number, Pendiente>();
    private cerrado = false;

    /** Usa crearMotorWeb(). */
    constructor(private grafo: Uint8Array, private readonly opciones: OpcionesMotorWeb) {}

    get info(): InfoGrafo {
        return { ...this.infoGrafo };
    }

    /** Calcula la ruta en el Worker. */
    async calcular(puntos: [number, number][], orden: OpcionesOrden = {}): Promise<ResultadoRuta> {
        const errorEntrada = validarEntrada(puntos, orden);
        if (errorEntrada) throw errorEntrada;
        await this.iniciar();
        return this.enviar("calcular", { puntos, orden }, true);
    }

    /** Reemplaza el grafo (y vacía el caché de tramos). */
    async cambiarGrafo(grafo: Uint8Array | ArrayBuffer): Promise<InfoGrafo> {
        this.grafo = grafo instanceof Uint8Array ? grafo : new Uint8Array(grafo);
        await this.iniciar();
        this.infoGrafo = await this.enviar("grafo", { grafo: this.grafo });
        return this.info;
    }

    async exportarCache(): Promise<Record<string, string[]>> {
        await this.iniciar();
        return this.enviar("exportarCache", {});
    }

    async importarCache(cache: Record<string, (string | number)[]>): Promise<void> {
        await this.iniciar();
        await this.enviar("importarCache", { cache });
    }

    /** Termina el Worker. Las peticiones pendientes se rechazan. */
    async cerrar(): Promise<void> {
        this.cerrado = true;
        this.detener(new ErrorRutaCraft("MOTOR_NO_DISPONIBLE", "El motor se cerró"));
    }

    /** @internal Inicia (o reinicia) el Worker con el grafo actual. */
    iniciar(): Promise<InfoGrafo> {
        if (this.cerrado) return Promise.reject(new ErrorRutaCraft("MOTOR_NO_DISPONIBLE", "El motor se cerró"));
        if (this.arranque) return this.arranque;

        let worker: WorkerLike;
        try {
            worker = this.opciones.crearWorker ? this.opciones.crearWorker() : crearWorkerPorDefecto();
        } catch (e: any) {
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
        this.arranque = this.enviar<InfoGrafo>("iniciar", { grafo: this.grafo, wasmUrl }).then((info) => {
            this.infoGrafo = info;
            return info;
        });
        this.arranque.catch(() => { /* se reporta a quien espere el arranque */ });
        return this.arranque;
    }

    private enviar<T>(op: string, args: unknown, conTimeout = false): Promise<T> {
        const worker = this.worker;
        if (!worker) return Promise.reject(new ErrorRutaCraft("MOTOR_NO_DISPONIBLE", "El motor no está activo"));
        const id = this.siguienteId++;
        return new Promise<T>((resolve, reject) => {
            const pendiente: Pendiente = { resolve, reject };
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

    private recibir(r: { id: number; ok: boolean; valor?: unknown; codigo?: CodigoErrorRuta; error?: string }): void {
        const pendiente = this.pendientes.get(r.id);
        if (!pendiente) return;
        this.pendientes.delete(r.id);
        if (pendiente.timer) clearTimeout(pendiente.timer);
        if (r.ok) pendiente.resolve(r.valor);
        else pendiente.reject(new ErrorRutaCraft(r.codigo ?? "INTERNO", r.error ?? "Error del motor"));
    }

    private detener(error: ErrorRutaCraft): void {
        this.worker?.terminate();
        this.worker = null;
        this.arranque = null;
        for (const p of this.pendientes.values()) {
            if (p.timer) clearTimeout(p.timer);
            p.reject(error);
        }
        this.pendientes.clear();
    }
}

function crearWorkerPorDefecto(): WorkerLike {
    if (typeof Worker === "undefined") {
        throw new Error("Web Workers no disponibles en este entorno; usa cargarMotorWasm() o la opción crearWorker");
    }
    return new Worker(new URL("./worker.js", import.meta.url), { type: "module" }) as unknown as WorkerLike;
}
