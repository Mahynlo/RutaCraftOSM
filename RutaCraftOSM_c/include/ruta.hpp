#pragma once
#include "types.hpp"
#include "kdtree.hpp"
#include "astar.hpp"
#include "instrucciones.hpp"
#include "cache.hpp"
#include "json.hpp"
#include <cmath>
#include <stdexcept>
#include <string>
#include <vector>

namespace rutacraft {

using json = nlohmann::json;

// Calcula la ruta multi-parada completa. Lanza std::runtime_error si no es posible.
inline json calcular_ruta(const Grafo& grafo, const KDTree& kdtree, GestorCache& cache_gestor,
                          const std::vector<Coordenada>& puntos_gps) {
    if (puntos_gps.empty()) {
        throw std::runtime_error("Lista de puntos GPS vacia");
    }

    // Búsqueda de nodos más cercanos
    std::vector<int> nodos_cercanos;
    nodos_cercanos.reserve(puntos_gps.size());

    for (const auto& pt : puntos_gps) {
        int nodo = kdtree.buscar_nodo_mas_cercano(pt);
        if (nodo != -1) {
            nodos_cercanos.push_back(nodo);
        }
    }

    if (nodos_cercanos.empty()) {
        throw std::runtime_error("No se pudieron mapear los puntos GPS al grafo.");
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
            for (int64_t osm_id : en_cache->second) {
                auto it = grafo.osm_to_idx.find(osm_id);
                if (it != grafo.osm_to_idx.end()) {
                    segmento.push_back(it->second);
                }
            }
        } else {
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
            throw std::runtime_error("No se encontro ruta entre " + std::to_string(u_osm) + " y " +
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

    return {
        {"puntos_gps", j_puntos_gps},
        {"ruta", j_ruta},
        {"distancia_total_m", distancia_total},
        {"distancia_total_km", std::round((distancia_total / 1000.0) * 100.0) / 100.0},
        {"instrucciones", j_instrucciones}
    };
}

} // namespace rutacraft
