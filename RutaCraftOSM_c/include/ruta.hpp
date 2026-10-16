#pragma once
#include "types.hpp"
#include "kdtree.hpp"
#include "astar.hpp"
#include "instrucciones.hpp"
#include "cache.hpp"
#include "json.hpp"
#include "errores.hpp"
#include "optimizar.hpp"
#include <algorithm>
#include <cmath>
#include <stdexcept>
#include <string>
#include <vector>

namespace rutacraft {

using json = nlohmann::json;

// Convierte un tramo guardado en caché (OSM IDs) a índices del grafo actual. Devuelve vacío si
// el tramo no es un camino válido de u a v en este grafo: por ejemplo, si el grafo se regeneró y
// el caché quedó con nodos que ya no existen o que ya no están conectados.
inline std::vector<int> tramo_desde_cache(const Grafo& grafo, const std::vector<int64_t>& ruta_osm, int u, int v) {
    std::vector<int> tramo;
    tramo.reserve(ruta_osm.size());
    for (int64_t osm_id : ruta_osm) {
        const int indice = grafo.indice_osm(osm_id);
        if (indice < 0) return {};
        tramo.push_back(indice);
    }
    if (tramo.empty() || tramo.front() != u || tramo.back() != v) return {};

    for (size_t k = 1; k < tramo.size(); ++k) {
        if (!grafo.conectados(tramo[k - 1], tramo[k])) return {};
    }
    return tramo;
}

struct OpcionesRuta {
    bool optimizar = false;    // Reordenar las paradas para minimizar la distancia (la primera es el inicio)
    bool regresar = false;     // Terminar en el punto de inicio
    bool fijar_final = false;  // Al optimizar, mantener la última parada al final
};

// Calcula la ruta multi-parada completa. Lanza ErrorRuta si no es posible.
inline json calcular_ruta(const Grafo& grafo, const KDTree& kdtree, GestorCache& cache_gestor,
                          const std::vector<Coordenada>& puntos_entrada, const OpcionesRuta& opciones = {}) {
    if (puntos_entrada.empty()) {
        throw ErrorRuta(CodigoError::EntradaInvalida, "Lista de puntos GPS vacia");
    }
    if (opciones.regresar && opciones.fijar_final) {
        throw ErrorRuta(CodigoError::EntradaInvalida, "Las opciones regresar y fijar_final no se pueden combinar");
    }
    if (grafo.num_nodos() == 0) {
        throw ErrorRuta(CodigoError::GrafoInvalido, "El grafo no tiene nodos");
    }

    // Búsqueda de nodos más cercanos
    std::vector<int> nodos_entrada;
    nodos_entrada.reserve(puntos_entrada.size());
    for (const auto& pt : puntos_entrada) {
        nodos_entrada.push_back(kdtree.buscar_nodo_mas_cercano(pt));
    }

    // Orden de visita: índices de puntos_entrada (el inicio se repite al final si se regresa)
    std::vector<int> orden(puntos_entrada.size());
    for (size_t i = 0; i < orden.size(); ++i) orden[i] = static_cast<int>(i);
    json j_optimizacion = nullptr;

    if (opciones.optimizar) {
        const ModoOrden modo = opciones.regresar ? ModoOrden::Regresar
                             : opciones.fijar_final ? ModoOrden::FijarFinal : ModoOrden::Abierto;
        const ResultadoOrden r = OptimizadorOrden::optimizar(OptimizadorOrden::matriz(grafo, nodos_entrada), modo);
        orden = r.orden;
        j_optimizacion = {
            {"distancia_original_m", std::round(r.distancia_original * 10.0) / 10.0},
            {"distancia_optimizada_m", std::round(r.distancia_optimizada * 10.0) / 10.0},
            {"metodo", r.exacto ? "exacto" : "heuristico"}
        };
    } else if (opciones.regresar) {
        orden.push_back(0);
    }

    std::vector<Coordenada> puntos_gps;
    std::vector<int> nodos_cercanos;
    for (int i : orden) {
        puntos_gps.push_back(puntos_entrada[i]);
        nodos_cercanos.push_back(nodos_entrada[i]);
    }

    // Cálculo de la ruta entre segmentos
    std::vector<int> ruta_nodos;

    for (size_t i = 1; i < nodos_cercanos.size(); ++i) {
        int u = nodos_cercanos[i - 1];
        int v = nodos_cercanos[i];

        int64_t u_osm = grafo.osm_ids[u];
        int64_t v_osm = grafo.osm_ids[v];
        std::string clave = GestorCache::hacer_clave(u_osm, v_osm);

        std::vector<int> segmento;

        auto en_cache = cache_gestor.cache.find(clave);
        if (en_cache != cache_gestor.cache.end()) {
            segmento = tramo_desde_cache(grafo, en_cache->second, u, v);
            if (segmento.empty()) {
                cache_gestor.cache.erase(en_cache);  // Tramo inválido para este grafo: se recalcula
            }
        }

        if (segmento.empty()) {
            segmento = Enrutador::astar(grafo, u, v);
            if (!segmento.empty()) {
                std::vector<int64_t> ruta_osm;
                for (int idx : segmento) {
                    ruta_osm.push_back(grafo.osm_ids[idx]);
                }
                cache_gestor.cache[clave] = ruta_osm;
            }
        }

        if (segmento.empty()) {
            // Continuar uniría tramos no conectados con un salto en línea recta
            throw ErrorRuta(CodigoError::SinRuta, "No se encontro ruta entre " + std::to_string(u_osm) + " y " +
                                     std::to_string(v_osm) + " (puntos " + std::to_string(i - 1) +
                                     " y " + std::to_string(i) + ")");
        }

        if (i == 1) {
            ruta_nodos.insert(ruta_nodos.end(), segmento.begin(), segmento.end());
        } else {
            ruta_nodos.insert(ruta_nodos.end(), segmento.begin() + 1, segmento.end());
        }
    }

    // Generar coordenadas de la ruta
    json j_ruta = json::array();
    for (int n_idx : ruta_nodos) {
        j_ruta.push_back({grafo.coords[n_idx].lat, grafo.coords[n_idx].lon});
    }

    // Generar instrucciones de navegación
    auto [instrucciones, distancia_total] = GeneradorInstrucciones::generar(grafo, ruta_nodos);

    json j_instrucciones = json::array();
    for (const auto& inst : instrucciones) {
        j_instrucciones.push_back({
            {"accion", inst.accion},
            {"calle", inst.calle},
            {"desde", {inst.desde.lat, inst.desde.lon}},
            {"hacia", {inst.hacia.lat, inst.hacia.lon}},
            {"distancia_m", inst.distancia_m}
        });
    }

    json j_puntos_gps = json::array();
    for (const auto& pt : puntos_gps) {
        j_puntos_gps.push_back({pt.lat, pt.lon});
    }

    json resultado = {
        {"puntos_gps", j_puntos_gps},
        {"ruta", j_ruta},
        {"distancia_total_m", distancia_total},
        {"distancia_total_km", std::round((distancia_total / 1000.0) * 100.0) / 100.0},
        {"instrucciones", j_instrucciones}
    };
    if (opciones.optimizar || opciones.regresar) {
        resultado["orden"] = orden;  // Índice en la entrada de cada elemento de puntos_gps
    }
    if (!j_optimizacion.is_null()) {
        resultado["optimizacion"] = j_optimizacion;
    }
    return resultado;
}

} // namespace rutacraft
