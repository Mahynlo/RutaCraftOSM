// Interfaz WebAssembly del motor (se compila con Emscripten, ver CMakeLists.txt).
//
// Funciones C con texto UTF-8 terminado en cero; el envoltorio de JavaScript está en
// ruta-craft-osm/src/web/motor-wasm.ts. Cada instancia del módulo tiene un solo motor.
//
//   rc_cargar_grafo(datos, bytes)  -> respuesta JSON {"ok": true, "nodos": N, "aristas": E, "dirigido": bool}
//   rc_calcular(peticion)          -> respuesta JSON del modo servidor (ver Motor::responder)
//   rc_exportar_cache()            -> objeto JSON con los tramos calculados
//   rc_importar_cache(json)        -> respuesta JSON {"ok": bool}
//   rc_limpiar_cache()
//
// Los punteros devueltos apuntan a un búfer interno válido hasta la siguiente llamada.
#include "../include/motor.hpp"

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

#ifdef __EMSCRIPTEN__
#include <emscripten/emscripten.h>
#define RC_EXPORTAR extern "C" EMSCRIPTEN_KEEPALIVE
#else
#define RC_EXPORTAR extern "C"
#endif

using namespace rutacraft;

namespace {

Motor& motor() {
    static Motor m;
    return m;
}

const char* devolver(const json& respuesta) {
    static std::string bufer;
    bufer = Motor::serializar(respuesta);
    return bufer.c_str();
}

}  // namespace

RC_EXPORTAR const char* rc_cargar_grafo(const uint8_t* datos, size_t bytes) {
    try {
        motor().cargar_memoria(std::vector<char>(reinterpret_cast<const char*>(datos),
                                                 reinterpret_cast<const char*>(datos) + bytes));
        motor().cache.cache.clear();  // Los tramos del grafo anterior ya no aplican
        const Grafo& g = motor().grafo();
        return devolver({{"ok", true}, {"nodos", g.num_nodos()}, {"aristas", g.num_aristas()}, {"dirigido", g.dirigido}});
    } catch (const ErrorRuta& e) {
        return devolver({{"ok", false}, {"codigo", nombre_codigo(e.codigo())}, {"error", e.what()}});
    } catch (const std::exception& e) {
        return devolver({{"ok", false}, {"codigo", nombre_codigo(CodigoError::Interno)}, {"error", e.what()}});
    }
}

RC_EXPORTAR const char* rc_calcular(const char* peticion) {
    return devolver(motor().responder(peticion ? peticion : ""));
}

RC_EXPORTAR const char* rc_exportar_cache() {
    return devolver(motor().cache.a_json());
}

RC_EXPORTAR const char* rc_importar_cache(const char* datos) {
    // GestorCache::cargar también intentaría abrir el texto como ruta de archivo: aquí solo se acepta JSON
    bool ok = false;
    try {
        ok = datos && json::parse(datos).is_object() && motor().cache.cargar(datos);
    } catch (...) {
        ok = false;
    }
    return devolver({{"ok", ok}});
}

RC_EXPORTAR void rc_limpiar_cache() {
    motor().cache.cache.clear();
}
