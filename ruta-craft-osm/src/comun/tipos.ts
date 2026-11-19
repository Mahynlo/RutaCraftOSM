// Tipos y validación compartidos por el motor nativo (Node/Electron) y el motor WebAssembly.
// No importa nada de Node: este archivo también se compila para el navegador.

/** Opciones de orden de las paradas (las acepta calcularRuta() y motor.calcular()). */
export interface OpcionesOrden {
    /** Reordenar las paradas para minimizar la distancia. La primera parada siempre es el inicio. */
    optimizar?: boolean;
    /** Terminar la ruta en el punto de inicio (con o sin optimizar). */
    regresarAlInicio?: boolean;
    /** Al optimizar, mantener la última parada al final. No se combina con regresarAlInicio. */
    fijarFinal?: boolean;
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

export function validarEntrada(puntos: unknown, orden: OpcionesOrden = {}): ErrorRutaCraft | null {
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

/** Respuesta del motor en el protocolo del modo servidor (`--serve` y WebAssembly). */
export interface RespuestaServidor {
    id: number | string | null;
    ok: boolean;
    resultado?: ResultadoRuta;
    codigo?: CodigoErrorRuta;
    error?: string;
}
