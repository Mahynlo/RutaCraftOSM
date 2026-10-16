import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as fs from "fs";
import * as path from "path";

/** Opciones de orden de las paradas (las acepta calcularRuta() y motor.calcular()). */
export interface OpcionesOrden {
    /** Reordenar las paradas para minimizar la distancia. La primera parada siempre es el inicio. */
    optimizar?: boolean;
    /** Terminar la ruta en el punto de inicio (con o sin optimizar). */
    regresarAlInicio?: boolean;
    /** Al optimizar, mantener la última parada al final. No se combina con regresarAlInicio. */
    fijarFinal?: boolean;
}

export interface CalcularRutaOptions extends OpcionesOrden {
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

export interface ResultadoOptimizacion {
    /** Distancia por la red en el orden recibido (metros). */
    distancia_original_m: number;
    /** Distancia por la red en el orden calculado (metros). */
    distancia_optimizada_m: number;
    /** "exacto" (hasta 8 paradas libres, se prueban todas las permutaciones) o "heuristico". */
    metodo: "exacto" | "heuristico";
}

export interface ResultadoRuta {
    /** Paradas en orden de visita (si se optimizó o se regresa al inicio, difiere de la entrada). */
    puntos_gps: [number, number][];
    ruta: [number, number][];
    distancia_total_m: number;
    distancia_total_km: number;
    instrucciones: InstruccionNavegacion[];
    /** Índice en la entrada de cada elemento de puntos_gps (solo con optimizar o regresarAlInicio). */
    orden?: number[];
    optimizacion?: ResultadoOptimizacion;
}

export interface RespuestaRutaCompleta {
    resultado: ResultadoRuta;
    cache?: Record<string, string[]>;
}

/** Tipo de error, estable para que la aplicación decida qué mostrar al usuario. */
export type CodigoErrorRuta =
    | "ENTRADA_INVALIDA"          // Puntos u opciones inválidos
    | "GRAFO_INVALIDO"            // El grafo no existe o el archivo es inválido
    | "SIN_RUTA"                  // Algún tramo no tiene camino posible
    | "TIMEOUT"                   // Se superó timeoutMs
    | "PLATAFORMA_NO_SOPORTADA"   // El paquete no incluye el motor para este sistema
    | "MOTOR_NO_DISPONIBLE"       // No se pudo ejecutar el motor, o terminó inesperadamente
    | "INTERNO";                  // Error inesperado del motor

export class ErrorRutaCraft extends Error {
    constructor(public readonly codigo: CodigoErrorRuta, mensaje: string) {
        super(`❌ ${mensaje}`);
        this.name = "ErrorRutaCraft";
    }
}

// Código de salida de la CLI -> tipo de error (ver RutaCraftOSM_c/include/errores.hpp)
const CODIGOS_SALIDA: Record<number, CodigoErrorRuta> = {
    2: "ENTRADA_INVALIDA",
    3: "GRAFO_INVALIDO",
    4: "SIN_RUTA",
};

const TIMEOUT_DEFAULT_MS = 30000;

/** Plataformas para las que la CI compila el motor (bin/<plataforma>/cli). */
export const PLATAFORMAS_SOPORTADAS = ["win32-x64", "linux-x64", "darwin-x64", "darwin-arm64"];

/** Plataforma de este proceso en el formato de bin/<plataforma>, p. ej. "win32-x64". */
export function plataformaActual(): string {
    return `${process.platform}-${process.arch}`;
}

// Ruta a un archivo del paquete. Empaquetado con Electron, los binarios no se pueden ejecutar
// desde dentro de app.asar, así que se usa la copia de app.asar.unpacked.
function rutaDelPaquete(...partes: string[]): string {
    return path.join(__dirname, "..", ...partes).replace(/app\.asar([\\/])/, "app.asar.unpacked$1");
}

/** Grafo incluido en el paquete; se usa cuando no se indica la opción `grafo`. */
export const GRAFO_INCLUIDO = rutaDelPaquete("bin", "grafos", "grafo_mazatan_villapesqueira.bin");

const binariosVerificados = new Set<string>();

// Binario del motor para esta plataforma. Lanza un error claro si el paquete no lo incluye.
function getCliExePath(): string {
    const plataforma = plataformaActual();
    const ruta = rutaDelPaquete("bin", plataforma, process.platform === "win32" ? "cli.exe" : "cli");
    if (binariosVerificados.has(ruta)) return ruta;

    if (!fs.existsSync(ruta)) {
        throw new ErrorRutaCraft("PLATAFORMA_NO_SOPORTADA",
            `ruta-craft-osm no incluye el motor para ${plataforma} (incluidas: ${PLATAFORMAS_SOPORTADAS.join(", ")}). ` +
            `Compílalo con CMake (RutaCraftOSM_c) y cópialo a bin/${plataforma}/`);
    }
    // Algunos empaquetados (zip, artefactos de CI) pierden el permiso de ejecución en Linux/macOS
    if (process.platform !== "win32") {
        try {
            fs.accessSync(ruta, fs.constants.X_OK);
        } catch {
            try { fs.chmodSync(ruta, 0o755); } catch { /* se reportará al ejecutar */ }
        }
    }
    binariosVerificados.add(ruta);
    return ruta;
}

function validarEntrada(puntos: unknown, orden: OpcionesOrden = {}): ErrorRutaCraft | null {
    if (!Array.isArray(puntos) || puntos.length === 0) {
        return new ErrorRutaCraft("ENTRADA_INVALIDA", "Debes proporcionar 'puntos' como un array de coordenadas [lat, lon]");
    }
    for (let i = 0; i < puntos.length; i++) {
        const p = puntos[i];
        if (!Array.isArray(p) || p.length !== 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) {
            return new ErrorRutaCraft("ENTRADA_INVALIDA", `El punto ${i} no es un par [lat, lon] numérico válido`);
        }
        if (Math.abs(p[0]) > 90 || Math.abs(p[1]) > 180) {
            return new ErrorRutaCraft("ENTRADA_INVALIDA", `El punto ${i} está fuera de rango: [${p[0]}, ${p[1]}]`);
        }
    }
    if (orden.regresarAlInicio && orden.fijarFinal) {
        return new ErrorRutaCraft("ENTRADA_INVALIDA", "Las opciones regresarAlInicio y fijarFinal no se pueden combinar");
    }
    return null;
}

function argsComunes(grafo?: string, cachePath?: string, saveCache?: boolean): string[] {
    const args: string[] = ["--grafo", grafo ?? GRAFO_INCLUIDO];
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
    const errorEntrada = validarEntrada(options?.puntos, options);
    if (errorEntrada) {
        return Promise.reject(errorEntrada);
    }

    let exePath: string;
    try {
        exePath = getCliExePath();
    } catch (e) {
        return Promise.reject(e);
    }
    // Los puntos van por stdin (--puntos -): como argumentos, Windows limita la línea de
    // comandos a ~32 KB y fallaba con más de ~1,300 puntos (spawn ENAMETOOLONG)
    const args: string[] = ["--stdout", ...argsComunes(options.grafo, options.cachePath, options.saveCache), "--puntos", "-"];
    if (options.optimizar) args.push("--optimizar");
    if (options.regresarAlInicio) args.push("--regresar");
    if (options.fijarFinal) args.push("--fijar-final");
    const timeoutMs = options.timeoutMs ?? TIMEOUT_DEFAULT_MS;

    return new Promise((resolve, reject) => {
        const proc = spawn(exePath, args, { windowsHide: true });

        let out = "";
        let err = "";

        // Si el motor termina antes de leer stdin, el error (EPIPE) se reporta por "close"
        proc.stdin.on("error", () => {});
        proc.stdin.end(JSON.stringify(options.puntos));

        const timer = setTimeout(() => {
            proc.kill();
            reject(new ErrorRutaCraft("TIMEOUT", `El cálculo de ruta superó ${timeoutMs} ms`));
        }, timeoutMs);

        // setEncoding evita partir un carácter UTF-8 (p. ej. "á" en un nombre de calle) entre dos fragmentos
        proc.stdout.setEncoding("utf8");
        proc.stderr.setEncoding("utf8");
        proc.stdout.on("data", (data: string) => out += data);
        proc.stderr.on("data", (data: string) => err += data);

        proc.on("close", (code: number | null) => {
            clearTimeout(timer);
            if (code !== 0) {
                const mensaje = (err || out).trim().replace(/^Error:\s*/, "");
                const codigo = code !== null ? CODIGOS_SALIDA[code] : undefined;
                return reject(new ErrorRutaCraft(codigo ?? "INTERNO", mensaje || `El motor terminó con código ${code}`));
            }
            try {
                resolve(JSON.parse(out) as RespuestaRutaCompleta);
            } catch (e: any) {
                reject(new ErrorRutaCraft("INTERNO", "Respuesta del motor no válida: " + e.message));
            }
        });

        proc.on("error", (e: Error) => {
            clearTimeout(timer);
            reject(new ErrorRutaCraft("MOTOR_NO_DISPONIBLE", "No se pudo ejecutar el motor: " + e.message));
        });
    });
}

interface PeticionPendiente {
    resolve: (r: ResultadoRuta) => void;
    reject: (e: Error) => void;
    timer: NodeJS.Timeout;
}

interface RespuestaServidor {
    id: number;
    ok: boolean;
    resultado?: ResultadoRuta;
    codigo?: CodigoErrorRuta;
    error?: string;
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

    calcular(puntos: [number, number][], orden: OpcionesOrden = {}): Promise<ResultadoRuta> {
        const errorEntrada = validarEntrada(puntos, orden);
        if (errorEntrada) {
            return Promise.reject(errorEntrada);
        }

        let proc: ChildProcessWithoutNullStreams;
        try {
            proc = this.iniciar();
        } catch (e) {
            return Promise.reject(e);
        }
        const id = this.siguienteId++;
        const timeoutMs = this.opciones.timeoutMs ?? TIMEOUT_DEFAULT_MS;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendientes.delete(id);
                reject(new ErrorRutaCraft("TIMEOUT", `El cálculo de ruta superó ${timeoutMs} ms`));
            }, timeoutMs);

            this.pendientes.set(id, { resolve, reject, timer });
            proc.stdin.write(JSON.stringify({
                id,
                puntos,
                optimizar: orden.optimizar === true,
                regresar: orden.regresarAlInicio === true,
                fijar_final: orden.fijarFinal === true,
            }) + "\n");
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

        proc.on("error", (e: Error) => this.terminar(proc, new ErrorRutaCraft(
            "MOTOR_NO_DISPONIBLE", "No se pudo ejecutar el motor: " + e.message)));
        proc.on("exit", (code) => {
            const detalle = this.bufferError.trim().replace(/^Error:\s*/, "");
            const tipo = (code !== null && CODIGOS_SALIDA[code]) || "MOTOR_NO_DISPONIBLE";
            this.terminar(proc, new ErrorRutaCraft(tipo, `El motor de rutas terminó (código ${code}): ${detalle}`));
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

            let respuesta: RespuestaServidor;
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
                pendiente.reject(new ErrorRutaCraft(respuesta.codigo ?? "INTERNO", respuesta.error ?? "Respuesta inválida del motor"));
            }
        }
    }

    // Rechaza todo lo pendiente y deja el motor listo para reiniciarse en la siguiente llamada
    private terminar(proc: ChildProcessWithoutNullStreams, error: ErrorRutaCraft): void {
        if (this.proc !== proc) return;
        this.proc = null;
        process.removeListener("exit", this.matarAlSalir);

        for (const pendiente of this.pendientes.values()) {
            clearTimeout(pendiente.timer);
            pendiente.reject(error);
        }
        this.pendientes.clear();
    }
}

export function crearMotorRutas(opciones: MotorRutasOptions = {}): MotorRutas {
    return new MotorRutas(opciones);
}
