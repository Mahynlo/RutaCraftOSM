import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as path from "path";

export interface CalcularRutaOptions {
    puntos: [number, number][];
    grafo?: string;
    cachePath?: string;       // Archivo de caché a leer/guardar (usará --cache). Sin él no se toca ningún archivo de caché.
    saveCache?: boolean;      // Si es false, usará --no-save-cache (default: true)
    timeoutMs?: number;       // Tiempo máximo de ejecución (default: 30000)
}

export interface MotorRutasOptions {
    grafo?: string;
    cachePath?: string;       // Se lee al iniciar y se guarda al llamar cerrar()
    saveCache?: boolean;      // Si es false, el caché solo vive en memoria (default: true)
    timeoutMs?: number;       // Tiempo máximo por petición (default: 30000)
}

export interface InstruccionNavegacion {
    accion: string;
    calle: string;
    desde: [number, number];
    hacia: [number, number];
    distancia_m: number;
}

export interface ResultadoRuta {
    puntos_gps: [number, number][];
    ruta: [number, number][];
    distancia_total_m: number;
    distancia_total_km: number;
    instrucciones: InstruccionNavegacion[];
}

export interface RespuestaRutaCompleta {
    resultado: ResultadoRuta;
    cache?: Record<string, string[]>;
}

const TIMEOUT_DEFAULT_MS = 30000;

// Obtiene el path correcto al binario. Empaquetado con Electron, los binarios no se pueden
// ejecutar desde dentro de app.asar, así que se usa la copia de app.asar.unpacked.
function getCliExePath(): string {
    const binaryName = process.platform === "win32" ? "cli.exe" : "cli";
    return path
        .join(__dirname, "..", "bin", "cli", binaryName)
        .replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
}

function validarPuntos(puntos: unknown): string | null {
    if (!Array.isArray(puntos) || puntos.length === 0) {
        return "❌ Debes proporcionar 'puntos' como un array de coordenadas [lat, lon]";
    }
    for (let i = 0; i < puntos.length; i++) {
        const p = puntos[i];
        if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
            return `❌ El punto ${i} no es un par [lat, lon] numérico válido`;
        }
        if (Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180) {
            return `❌ El punto ${i} está fuera de rango: [${p[0]}, ${p[1]}]`;
        }
    }
    return null;
}

function argsComunes(grafo?: string, cachePath?: string, saveCache?: boolean): string[] {
    const args: string[] = [];
    if (grafo) {
        args.push("--grafo", grafo);
    }
    if (cachePath) {
        args.push("--cache", cachePath);
        if (saveCache === false) {
            args.push("--no-save-cache");
        }
    } else {
        // Sin cachePath no se lee ni escribe cache_rutas.json en el directorio actual
        args.push("--sin-cache");
    }
    return args;
}

/**
 * Calcula una ruta lanzando un proceso nuevo por llamada (carga el grafo cada vez).
 * Para varias rutas seguidas es más rápido usar crearMotorRutas().
 */
export function calcularRuta(options: CalcularRutaOptions): Promise<RespuestaRutaCompleta> {
    const errorPuntos = validarPuntos(options?.puntos);
    if (errorPuntos) {
        return Promise.reject(new Error(errorPuntos));
    }

    const exePath = getCliExePath();
    // Los puntos van por stdin (--puntos -): como argumentos, Windows limita la línea de
    // comandos a ~32 KB y fallaba con más de ~1,300 puntos (spawn ENAMETOOLONG)
    const args: string[] = ["--stdout", ...argsComunes(options.grafo, options.cachePath, options.saveCache), "--puntos", "-"];

    return new Promise((resolve, reject) => {
        const proc = spawn(exePath, args, { windowsHide: true });

        let out = "";
        let err = "";

        // Si el motor termina antes de leer stdin, el error (EPIPE) se reporta por "close"
        proc.stdin.on("error", () => {});
        proc.stdin.end(JSON.stringify(options.puntos));

        const timer = setTimeout(() => {
            proc.kill();
            reject(new Error(`❌ El cálculo de ruta superó ${options.timeoutMs ?? TIMEOUT_DEFAULT_MS} ms`));
        }, options.timeoutMs ?? TIMEOUT_DEFAULT_MS);

        // setEncoding evita partir un carácter UTF-8 (p. ej. "á" en un nombre de calle) entre dos fragmentos
        proc.stdout.setEncoding("utf8");
        proc.stderr.setEncoding("utf8");
        proc.stdout.on("data", (data: string) => out += data);
        proc.stderr.on("data", (data: string) => err += data);

        proc.on("close", (code: number) => {
            clearTimeout(timer);
            if (code === 0) {
                try {
                    const jsonStart = out.indexOf("{");
                    const jsonEnd = out.lastIndexOf("}") + 1;

                    if (jsonStart === -1 || jsonEnd === 0) {
                        return reject(new Error("❌ No se encontró JSON válido en la salida: " + out));
                    }

                    const jsonString = out.substring(jsonStart, jsonEnd);
                    const parsed = JSON.parse(jsonString) as RespuestaRutaCompleta;
                    resolve(parsed);
                } catch (e: any) {
                    reject(new Error("❌ Error al parsear JSON: " + e.message));
                }
            } else {
                reject(new Error("❌ Error en ejecución: " + (err || out)));
            }
        });

        proc.on("error", (e: Error) => {
            clearTimeout(timer);
            reject(new Error("❌ Error al ejecutar el binario: " + e.message));
        });
    });
}

interface PeticionPendiente {
    resolve: (r: ResultadoRuta) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
}

/**
 * Motor persistente: mantiene un proceso `cli.exe --serve` con el grafo cargado en memoria
 * y le envía cada ruta por stdin. El proceso se inicia en la primera llamada y se reinicia
 * solo si termina inesperadamente. Llama a cerrar() al salir para guardar el caché.
 */
export class MotorRutas {
    private proc: ChildProcessWithoutNullStreams | null = null;
    private bufferSalida = "";
    private bufferError = "";
    private siguienteId = 1;
    private pendientes = new Map<number, PeticionPendiente>();
    private readonly matarAlSalir = () => this.proc?.kill();

    constructor(private readonly opciones: MotorRutasOptions = {}) {}

    calcular(puntos: [number, number][]): Promise<ResultadoRuta> {
        const errorPuntos = validarPuntos(puntos);
        if (errorPuntos) {
            return Promise.reject(new Error(errorPuntos));
        }

        const proc = this.iniciar();
        const id = this.siguienteId++;
        const timeoutMs = this.opciones.timeoutMs ?? TIMEOUT_DEFAULT_MS;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendientes.delete(id);
                reject(new Error(`❌ El cálculo de ruta superó ${timeoutMs} ms`));
            }, timeoutMs);

            this.pendientes.set(id, { resolve, reject, timer });
            proc.stdin.write(JSON.stringify({ id, puntos }) + "\n");
        });
    }

    /** Cierra el proceso del motor; el caché se guarda en cachePath antes de salir. */
    cerrar(): Promise<void> {
        const proc = this.proc;
        if (!proc) {
            return Promise.resolve();
        }
        return new Promise((resolve) => {
            proc.once("exit", () => resolve());
            proc.stdin.end();
        });
    }

    private iniciar(): ChildProcessWithoutNullStreams {
        if (this.proc) {
            return this.proc;
        }

        const { grafo, cachePath, saveCache } = this.opciones;
        const proc = spawn(getCliExePath(), ["--serve", ...argsComunes(grafo, cachePath, saveCache)], { windowsHide: true });
        this.proc = proc;
        this.bufferSalida = "";
        this.bufferError = "";

        // Escribir a un motor que ya terminó da EPIPE; sin este manejador tumbaría el proceso de Node/Electron.
        // Las peticiones pendientes se rechazan en el evento "exit".
        proc.stdin.on("error", () => {});

        proc.stdout.setEncoding("utf8");
        proc.stdout.on("data", (chunk: string) => this.procesarSalida(chunk));
        proc.stderr.setEncoding("utf8");
        proc.stderr.on("data", (chunk: string) => this.bufferError += chunk);

        proc.on("error", (e: Error) => this.terminar(proc, "❌ Error al ejecutar el binario: " + e.message));
        proc.on("exit", (code) => {
            this.terminar(proc, "❌ El motor de rutas terminó (código " + code + "): " + this.bufferError.trim());
        });

        process.once("exit", this.matarAlSalir);
        return proc;
    }

    private procesarSalida(chunk: string): void {
        this.bufferSalida += chunk;
        let salto: number;
        while ((salto = this.bufferSalida.indexOf("\n")) !== -1) {
            const linea = this.bufferSalida.slice(0, salto).trim();
            this.bufferSalida = this.bufferSalida.slice(salto + 1);
            if (!linea) continue;

            let respuesta: { id: number; ok: boolean; resultado?: ResultadoRuta; error?: string };
            try {
                respuesta = JSON.parse(linea);
            } catch {
                continue; // Línea que no es JSON: se ignora
            }

            const pendiente = this.pendientes.get(respuesta.id);
            if (!pendiente) continue; // Petición que ya expiró

            this.pendientes.delete(respuesta.id);
            clearTimeout(pendiente.timer);
            if (respuesta.ok && respuesta.resultado) {
                pendiente.resolve(respuesta.resultado);
            } else {
                pendiente.reject(new Error("❌ Error en ejecución: " + (respuesta.error ?? "respuesta inválida")));
            }
        }
    }

    // Rechaza todo lo pendiente y deja el motor listo para reiniciarse en la siguiente llamada
    private terminar(proc: ChildProcessWithoutNullStreams, mensaje: string): void {
        if (this.proc !== proc) return;
        this.proc = null;
        process.removeListener("exit", this.matarAlSalir);

        for (const pendiente of this.pendientes.values()) {
            clearTimeout(pendiente.timer);
            pendiente.reject(new Error(mensaje));
        }
        this.pendientes.clear();
    }
}

export function crearMotorRutas(opciones: MotorRutasOptions = {}): MotorRutas {
    return new MotorRutas(opciones);
}
