import { spawn } from "child_process";
import * as path from "path";

export interface CalcularRutaOptions {
    puntos: [number, number][];
    grafo?: string;
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

export function calcularRuta(options: CalcularRutaOptions): Promise<ResultadoRuta> {
    if (!options?.puntos || !Array.isArray(options.puntos)) {
        return Promise.reject(new Error("❌ Debes proporcionar 'options.puntos' como un array de coordenadas [lat, lon]"));
    }

    const exePath = path.join(__dirname, "..", "bin", "cli.dist", "cli.exe");

    const args: string[] = [
        "--stdout",
        "--array",
        ...options.puntos.flatMap(([lat, lon]) => [lat.toString(), lon.toString()])
    ];

    if (options.grafo) { // Si se proporciona un grafo, lo añadimos a los argumentos
        args.unshift("--grafo", options.grafo);
    }

    return new Promise((resolve, reject) => {
        const proc = spawn(exePath, args, { shell: true });

        let out = "";
        let err = "";

        proc.stdout.on("data", (data: Buffer) => out += data.toString());
        proc.stderr.on("data", (data: Buffer) => err += data.toString());

        proc.on("close", (code: number) => {
            if (code === 0) {
                try {
                    // Filtrar todo hasta la primera '{' y desde ahí hasta el final
                    const jsonStart = out.indexOf('{');
                    const jsonEnd = out.lastIndexOf('}') + 1;

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
