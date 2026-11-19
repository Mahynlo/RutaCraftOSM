// Motor de rutas en WebAssembly: el mismo código C++ que el ejecutable nativo, compilado con
// Emscripten. Funciona en el navegador (hilo principal o Worker) y en Node.
//
// Las llamadas son síncronas: en el hilo principal de una página conviene usar crearMotorWeb(),
// que corre este motor dentro de un Web Worker para no congelar la interfaz.

import crearModuloMotor, { ModuloMotor, OpcionesModuloMotor } from "../wasm/motor.mjs";
import {
    ErrorRutaCraft, OpcionesOrden, RespuestaServidor, ResultadoRuta, validarEntrada,
} from "../comun/tipos.js";

export interface InfoGrafo {
    nodos: number;
    aristas: number;
    /** true si el grafo respeta las calles de un solo sentido. */
    dirigido: boolean;
}

export interface OpcionesMotorWasm {
    /** Grafo RCO2 (bytes del archivo .bin, p. ej. de fetch() o de generarGrafo()). */
    grafo: Uint8Array | ArrayBuffer;
    /** URL de motor.wasm, si el empaquetador no lo deja junto a motor.mjs. */
    wasmUrl?: string | URL;
    /** Contenido de motor.wasm ya descargado (alternativa a wasmUrl). */
    wasmBinary?: ArrayBuffer | Uint8Array;
}

/** Carga el módulo WebAssembly y el grafo. */
export async function cargarMotorWasm(opciones: OpcionesMotorWasm): Promise<MotorWasm> {
    const config: OpcionesModuloMotor = {};
    if (opciones.wasmBinary) config.wasmBinary = opciones.wasmBinary;
    if (opciones.wasmUrl) {
        const url = String(opciones.wasmUrl);
        config.locateFile = (ruta, prefijo) => (ruta.endsWith(".wasm") ? url : prefijo + ruta);
    }
    let modulo: ModuloMotor;
    try {
        modulo = await crearModuloMotor(config);
    } catch (e) {
        throw new ErrorRutaCraft("MOTOR_NO_DISPONIBLE", "No se pudo cargar el motor WebAssembly: " + mensajeDe(e));
    }
    const motor = new MotorWasm(modulo);
    motor.cambiarGrafo(opciones.grafo);
    return motor;
}

export class MotorWasm {
    private infoGrafo: InfoGrafo = { nodos: 0, aristas: 0, dirigido: false };
    private siguienteId = 1;

    /** Usa cargarMotorWasm(). */
    constructor(private readonly modulo: ModuloMotor) {}

    get info(): InfoGrafo {
        return { ...this.infoGrafo };
    }

    /** Reemplaza el grafo (y vacía el caché de tramos). */
    cambiarGrafo(grafo: Uint8Array | ArrayBuffer): InfoGrafo {
        const bytes = grafo instanceof Uint8Array ? grafo : new Uint8Array(grafo);
        const m = this.modulo;
        const puntero = m._malloc(Math.max(1, bytes.length));
        try {
            m.HEAPU8.set(bytes, puntero);  // HEAPU8 se lee después de malloc: la memoria pudo crecer
            const r = JSON.parse(m.UTF8ToString(m._rc_cargar_grafo(puntero, bytes.length)));
            if (!r.ok) throw new ErrorRutaCraft(r.codigo ?? "GRAFO_INVALIDO", r.error ?? "Grafo inválido");
            this.infoGrafo = { nodos: r.nodos, aristas: r.aristas, dirigido: r.dirigido };
            return this.info;
        } finally {
            m._free(puntero);
        }
    }

    /** Calcula la ruta. Lanza ErrorRutaCraft si no es posible. */
    calcular(puntos: [number, number][], orden: OpcionesOrden = {}): ResultadoRuta {
        const errorEntrada = validarEntrada(puntos, orden);
        if (errorEntrada) throw errorEntrada;

        const peticion = JSON.stringify({
            id: this.siguienteId++,
            puntos,
            optimizar: orden.optimizar === true,
            regresar: orden.regresarAlInicio === true,
            fijar_final: orden.fijarFinal === true,
        });
        const r = this.llamarConTexto(peticion, (p) => this.modulo._rc_calcular(p)) as RespuestaServidor;
        if (!r.ok || !r.resultado) {
            throw new ErrorRutaCraft(r.codigo ?? "INTERNO", r.error ?? "Respuesta inválida del motor");
        }
        return r.resultado;
    }

    /** Tramos calculados (mismo formato que el archivo de caché del motor nativo). */
    exportarCache(): Record<string, string[]> {
        return JSON.parse(this.modulo.UTF8ToString(this.modulo._rc_exportar_cache()));
    }

    /** Agrega tramos guardados antes con exportarCache(). Los que no sirvan para este grafo se recalculan. */
    importarCache(cache: Record<string, (string | number)[]>): void {
        const r = this.llamarConTexto(JSON.stringify(cache), (p) => this.modulo._rc_importar_cache(p));
        if (!r.ok) throw new ErrorRutaCraft("ENTRADA_INVALIDA", "El caché no tiene un formato válido");
    }

    limpiarCache(): void {
        this.modulo._rc_limpiar_cache();
    }

    // Pasa un texto a C++ (copiado en la memoria del módulo) y devuelve la respuesta JSON
    private llamarConTexto(texto: string, fn: (puntero: number) => number): any {
        const m = this.modulo;
        const puntero = m.stringToNewUTF8(texto);
        try {
            return JSON.parse(m.UTF8ToString(fn(puntero)));
        } finally {
            m._free(puntero);
        }
    }
}

export function mensajeDe(e: unknown): string {
    return e instanceof Error ? e.message : String(e);
}
