import { spawn } from "child_process";
import * as path from "path";

export interface CalcularRutaOptions {
    puntos: [number, number][];
    grafo?: string;
    cachePath?: string;       // Ruta para leer un caché existente (usará --cache)
    saveCache?: boolean;      // Si es false, usará --no-save-cache
}

export interface ResultadoRuta {
    puntos_gps: [number, number][];
    ruta: [number, number][];
    distancia_total_m: number;
    distancia_total_km: number;
    instrucciones: {
        accion: string;
        calle: string;
        desde: [number, number];
        hacia: [number, number];
        distancia_m: number;
    }[];
}

// Detecta si está empaquetado (producción)
function isPackaged(): boolean {
    return process.mainModule?.filename.includes('app.asar') ?? false;
}

// Obtiene el path correcto al binario dependiendo del entorno
function getCliExePath(): string {
    if (isPackaged()) {
        const resourcesPath = (process as any).resourcesPath;
        return path.join(
            resourcesPath,
            "app.asar.unpacked",
            "node_modules",
            "ruta-craft-osm",
            "bin",
            "cli",
            "cli.exe"
        );
    } else {
        return path.join(__dirname, "..", "bin", "cli", "cli.exe");
    }
}
export function calcularRuta(options: CalcularRutaOptions): Promise<ResultadoRuta> {
    if (!options?.puntos || !Array.isArray(options.puntos)) {
        return Promise.reject(new Error("❌ Debes proporcionar 'options.puntos' como un array de coordenadas [lat, lon]"));
    }

    const exePath = getCliExePath();
    const args: string[] = ["--stdout", "--no-save-cache","--array"];

    args.push(...options.puntos.flatMap(([lat, lon]) => [lat.toString(), lon.toString()]));

    if (options.grafo) {
        args.push("--grafo", options.grafo);
    }

    if (options.cachePath) {
        args.push("--cache", options.cachePath);
    }

    

    //console.log("Ejecutando:", exePath, args);

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
                        return reject(new Error("❌ No se encontró JSON válido en la salida"));
                    }

                    const jsonString = out.substring(jsonStart, jsonEnd);
                    const parsed = JSON.parse(jsonString);
                    resolve(parsed);
                } catch (e: any) {
                    reject(new Error("❌ Error al parsear JSON: " + e.message));
                }
            } else {
                reject(new Error("❌ Error en ejecución: " + err));
            }
        });
    });
}
