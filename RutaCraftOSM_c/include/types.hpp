#pragma once
#include <algorithm>
#include <cstdint>
#include <string>
#include <type_traits>
#include <utility>
#include <vector>

namespace rutacraft {

struct Coordenada {
    double lat = 0.0;
    double lon = 0.0;

    bool operator==(const Coordenada& other) const {
        return lat == other.lat && lon == other.lon;
    }
};

// El cargador de RCO2 copia el bloque de coordenadas (lat, lon intercalados) directamente al vector
static_assert(sizeof(Coordenada) == 2 * sizeof(double) && std::is_trivially_copyable_v<Coordenada>,
              "Coordenada debe ser dos double contiguos");

// Grafo vial en formato CSR (Compressed Sparse Row): las aristas del nodo u ocupan las posiciones
// [inicio_aristas[u], inicio_aristas[u + 1]) de los arreglos destino, peso y nombre_id. Cada nombre
// de calle se guarda una sola vez en `nombres`; nombres[0] es "" (calle sin nombre).
struct Grafo {
    std::vector<int64_t> osm_ids;          // OSM ID de cada nodo
    std::vector<Coordenada> coords;        // Coordenadas lat/lon
    std::vector<uint32_t> inicio_aristas;  // N + 1 posiciones
    std::vector<uint32_t> destino;         // Índice interno del nodo destino
    std::vector<float> peso;               // Longitud en metros
    std::vector<uint32_t> nombre_id;       // Índice en `nombres`
    std::vector<std::string> nombres;
    bool dirigido = false;                 // true si respeta las calles de un solo sentido

    // (osm_id, índice) ordenado por osm_id, para traducir los IDs del caché
    std::vector<std::pair<int64_t, int>> indice_osm_ordenado;

    size_t num_nodos() const { return coords.size(); }
    size_t num_aristas() const { return destino.size(); }

    // Arista u -> v (la primera si hubiera varias), o -1
    int64_t arista(int u, int v) const {
        for (uint32_t e = inicio_aristas[u]; e < inicio_aristas[u + 1]; ++e) {
            if (destino[e] == static_cast<uint32_t>(v)) return e;
        }
        return -1;
    }

    bool conectados(int u, int v) const { return arista(u, v) >= 0; }

    // Nombre de la calle de la arista u -> v, o "desconocida"
    const std::string& calle(int u, int v) const {
        static const std::string desconocida = "desconocida";
        if (u < 0 || static_cast<size_t>(u) >= num_nodos()) return desconocida;
        const int64_t e = arista(u, v);
        if (e < 0) return desconocida;
        const std::string& nombre = nombres[nombre_id[e]];
        return nombre.empty() ? desconocida : nombre;
    }

    void preparar_indice_osm() {
        indice_osm_ordenado.resize(osm_ids.size());
        for (size_t i = 0; i < osm_ids.size(); ++i) indice_osm_ordenado[i] = {osm_ids[i], static_cast<int>(i)};
        std::sort(indice_osm_ordenado.begin(), indice_osm_ordenado.end());
    }

    // Índice interno del nodo con ese OSM ID, o -1
    int indice_osm(int64_t osm_id) const {
        auto it = std::lower_bound(indice_osm_ordenado.begin(), indice_osm_ordenado.end(),
                                   std::make_pair(osm_id, 0));
        return (it != indice_osm_ordenado.end() && it->first == osm_id) ? it->second : -1;
    }
};

struct Instruccion {
    std::string accion;
    std::string calle;
    Coordenada desde;
    Coordenada hacia;
    double distancia_m = 0.0;
};

} // namespace rutacraft
