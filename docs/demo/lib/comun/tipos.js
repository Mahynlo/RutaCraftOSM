// Tipos y validación compartidos por el motor nativo (Node/Electron) y el motor WebAssembly.
// No importa nada de Node: este archivo también se compila para el navegador.
export class ErrorRutaCraft extends Error {
    constructor(codigo, mensaje) {
        super(`❌ ${mensaje}`);
        this.codigo = codigo;
        this.name = "ErrorRutaCraft";
    }
}
export function validarEntrada(puntos, orden = {}) {
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
