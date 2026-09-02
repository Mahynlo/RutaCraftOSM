#pragma once
#include <string>
#include <vector>
#include <unordered_map>
#include <cstdint>

namespace rutacraft {

struct Coordenada {
    double lat = 0.0;
    double lon = 0.0;

    bool operator==(const Coordenada& other) const {
        return lat == other.lat && lon == other.lon;
    }
};

struct Arista {
    int destino = 0;       // Índice interno del nodo (0..N-1)
    float peso = 0.0f;     // Longitud / peso en metros
    std::string calle;     // Nombre de la calle
    std::string tipo_via;  // Tipo de vía OSM (residential, primary, etc.)
};

struct Grafo {
    std::vector<int64_t> osm_ids;                // OSM ID de cada nodo
    std::vector<Coordenada> coords;              // Coordenadas lat/lon
    std::vector<std::vector<Arista>> adj_list;   // Lista de adyacencia
    std::unordered_map<int64_t, int> osm_to_idx; // Mapeo de OSM ID a índice interno

    size_t num_nodos() const { return coords.size(); }
};

struct Instruccion {
    std::string accion;
    std::string calle;
    Coordenada desde;
    Coordenada hacia;
    double distancia_m = 0.0;
};

struct ConexionVerde {
    Coordenada desde;
    Coordenada hacia;
};

struct ResultadoRuta {
    std::vector<Coordenada> puntos_gps;
    std::vector<Coordenada> ruta;
    double distancia_total_m = 0.0;
    double distancia_total_km = 0.0;
    std::vector<Instruccion> instrucciones;
    std::vector<ConexionVerde> conexiones_verdes;
};

} // namespace rutacraft
