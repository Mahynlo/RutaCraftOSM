#pragma once
// Motor de rutas con el grafo cargado en memoria. Lo usan la CLI nativa (modo clásico y --serve)
// y la versión WebAssembly, así que las dos dan exactamente las mismas respuestas.
#include "cache.hpp"
#include "errores.hpp"
#include "grafo.hpp"
#include "json.hpp"
#include "kdtree.hpp"
#include "ruta.hpp"
#include "types.hpp"

#include <filesystem>
#include <memory>
#include <string>
#include <vector>

namespace rutacraft {

using json = nlohmann::json;

// Interpreta un array JSON [[lat, lon], ...]; ignora elementos mal formados
inline std::vector<Coordenada> puntos_desde_json(const json& j_puntos) {
    std::vector<Coordenada> puntos;
    if (j_puntos.is_array()) {
        puntos.reserve(j_puntos.size());
        for (const auto& item : j_puntos) {
            if (item.is_array() && item.size() == 2 && item[0].is_number() && item[1].is_number()) {
                puntos.push_back({item[0].get<double>(), item[1].get<double>()});
            }
        }
    }
    return puntos;
}

class Motor {
public:
    GestorCache cache;

    Motor() = default;
    // El KD-Tree guarda una referencia a las coordenadas del grafo: el motor no se copia ni se mueve
    Motor(const Motor&) = delete;
    Motor& operator=(const Motor&) = delete;

    // Lanzan ErrorRuta(GrafoInvalido) si el grafo no existe o no es válido
    void cargar_archivo(const std::filesystem::path& ruta, const std::string& nombre_para_error) {
        Grafo nuevo;
        if (!CargadorGrafo::cargar(ruta, nuevo)) {
            throw ErrorRuta(CodigoError::GrafoInvalido,
                            "El archivo '" + nombre_para_error + "' no existe o formato no valido.");
        }
        instalar(std::move(nuevo));
    }

    void cargar_memoria(const std::vector<char>& datos) {
        Grafo nuevo;
        if (!CargadorGrafo::cargar_memoria(datos, nuevo)) {
            throw ErrorRuta(CodigoError::GrafoInvalido, "El grafo no es un archivo RCO2/RCO1 valido.");
        }
        instalar(std::move(nuevo));
    }

    bool cargado() const { return kdtree_ != nullptr; }
    const Grafo& grafo() const { return grafo_; }

    json calcular(const std::vector<Coordenada>& puntos, const OpcionesRuta& opciones = {}) {
        if (!cargado()) throw ErrorRuta(CodigoError::GrafoInvalido, "No hay un grafo cargado");
        return calcular_ruta(grafo_, *kdtree_, cache, puntos, opciones);
    }

    // Protocolo del modo servidor (una petición por línea):
    //   entrada: {"id": 1, "puntos": [[lat, lon], ...], "optimizar": false, "regresar": false, "fijar_final": false}
    //   salida:  {"id": 1, "ok": true, "resultado": {...}}
    //            {"id": 1, "ok": false, "codigo": "SIN_RUTA", "error": "..."}
    // Nunca lanza: cualquier error se devuelve en la respuesta.
    json responder(const std::string& linea) {
        json id = nullptr;
        try {
            json peticion;
            try {
                peticion = json::parse(linea);
            } catch (const std::exception& e) {
                throw ErrorRuta(CodigoError::EntradaInvalida, std::string("Peticion JSON invalida: ") + e.what());
            }
            if (!peticion.is_object()) throw ErrorRuta(CodigoError::EntradaInvalida, "La peticion debe ser un objeto JSON");
            if (peticion.contains("id")) id = peticion["id"];

            OpcionesRuta opciones;
            opciones.optimizar = valor_bool(peticion, "optimizar");
            opciones.regresar = valor_bool(peticion, "regresar");
            opciones.fijar_final = valor_bool(peticion, "fijar_final");

            const auto it = peticion.find("puntos");
            const std::vector<Coordenada> puntos = puntos_desde_json(it != peticion.end() ? *it : json::array());
            return {{"id", id}, {"ok", true}, {"resultado", calcular(puntos, opciones)}};
        } catch (const ErrorRuta& e) {
            return {{"id", id}, {"ok", false}, {"codigo", nombre_codigo(e.codigo())}, {"error", e.what()}};
        } catch (const std::exception& e) {
            return {{"id", id}, {"ok", false}, {"codigo", nombre_codigo(CodigoError::Interno)}, {"error", e.what()}};
        }
    }

    // Respuesta serializada: UTF-8 inválido en un nombre de calle se reemplaza en vez de lanzar
    static std::string serializar(const json& j, int sangria = -1) {
        return j.dump(sangria, ' ', false, json::error_handler_t::replace);
    }

private:
    Grafo grafo_;
    std::unique_ptr<KDTree> kdtree_;

    void instalar(Grafo&& nuevo) {
        kdtree_.reset();  // Referencia al grafo anterior: se descarta antes de reemplazarlo
        grafo_ = std::move(nuevo);
        kdtree_ = std::make_unique<KDTree>(grafo_.coords);
    }

    // Un campo booleano ausente o null es false; de otro tipo es un error de entrada
    static bool valor_bool(const json& peticion, const char* campo) {
        const auto it = peticion.find(campo);
        if (it == peticion.end() || it->is_null()) return false;
        if (!it->is_boolean()) {
            throw ErrorRuta(CodigoError::EntradaInvalida, std::string("El campo '") + campo + "' debe ser booleano");
        }
        return it->get<bool>();
    }
};

} // namespace rutacraft
