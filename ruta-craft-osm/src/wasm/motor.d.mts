// Tipos del módulo que genera Emscripten (RutaCraftOSM_c/src/wasm.cpp). El módulo se compila en
// ruta-craft-osm/wasm/ y el build lo copia junto a dist/esm/wasm/.

export interface ModuloMotor {
    _malloc(bytes: number): number;
    _free(puntero: number): void;
    _rc_cargar_grafo(datos: number, bytes: number): number;
    _rc_calcular(peticion: number): number;
    _rc_exportar_cache(): number;
    _rc_importar_cache(datos: number): number;
    _rc_limpiar_cache(): void;
    /** Vista de la memoria; se reemplaza si la memoria crece, así que hay que leerla en cada uso. */
    HEAPU8: Uint8Array;
    UTF8ToString(puntero: number): string;
    stringToNewUTF8(texto: string): number;
}

export interface OpcionesModuloMotor {
    /** Ubicación de motor.wasm (por defecto, junto a motor.mjs). */
    locateFile?(ruta: string, prefijo: string): string;
    /** Contenido de motor.wasm ya descargado. */
    wasmBinary?: ArrayBuffer | Uint8Array;
}

export default function crearModuloMotor(opciones?: OpcionesModuloMotor): Promise<ModuloMotor>;
