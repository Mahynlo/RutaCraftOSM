import { spawn } from "child_process";
import * as path from "path";

export interface CalcularRutaOptions {
    puntos: [number, number][];
    grafo?: string;
    cachePath?: string;       // Ruta para leer/guardar un caché existente (usará --cache)
    saveCache?: boolean;      // Si es false, usará --no-save-cache (default: true)
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

// Detecta si está empaquetado con Electron (producción)
function isPackaged(): boolean {
    return process.mainModule?.filename.includes('app.asar') ?? false;
}

// Obtiene el path correcto al binario dependiendo del entorno y plataforma
function getCliExePath(): string {
    const isWindows = process.platform === "win32";
    const binaryName = isWindows ? "cli.exe" : "cli";

    if (isPackaged()) {
        const resourcesPath = (process as any).resourcesPath;
        return path.join(
            resourcesPath,
            "app.asar.unpacked",
            "node_modules",
            "ruta-craft-osm",
            "bin",
            "cli",
            binaryName
        );
    } else {
        return path.join(__dirname, "..", "bin", "cli", binaryName);
    }
}

export function calcularRuta(options: CalcularRutaOptions): Promise<RespuestaRutaCompleta> {
    if (!options?.puntos || !Array.isArray(options.puntos) || options.puntos.length === 0) {
        return Promise.reject(new Error("❌ Debes proporcionar 'options.puntos' como un array de coordenadas [lat, lon]"));
    }

    const exePath = getCliExePath();
    const args: string[] = ["--stdout"];

    if (options.saveCache === false) {
        args.push("--no-save-cache");
    }

    if (options.grafo) {
        args.push("--grafo", options.grafo);
    }

    if (options.cachePath) {
        args.push("--cache", options.cachePath);
    }

    args.push("--array");
    args.push(...options.puntos.flatMap(([lat, lon]) => [lat.toString(), lon.toString()]));

    return new Promise((resolve, reject) => {
        const proc = spawn(exePath, args);

        let out = "";
        let err = "";

        proc.stdout.on("data", (data: Buffer) => out += data.toString());
        proc.stderr.on("data", (data: Buffer) => err += data.toString());

        proc.on("close", (code: number) => {
            if (code === 0) {
                try {
                    const jsonStart = out.indexOf("{");
                    const jsonEnd = out.lastIndexOf("}") + 1;

                    if (jsonStart === -1 || jsonEnd === -1) {
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
            reject(new Error("❌ Error al ejecutar el binario: " + e.message));
        });
    });
}
