#pragma once
#include "types.hpp"
#include <algorithm>
#include <cmath>

namespace rutacraft {

constexpr double PI = 3.14159265358979323846;
constexpr double RADIO_TIERRA_M = 6371000.0;
constexpr double DEG_TO_RAD = PI / 180.0;
constexpr double RAD_TO_DEG = 180.0 / PI;

// Haversine exacto en metros
inline double haversine(const Coordenada& c1, const Coordenada& c2) {
    double dlat = (c2.lat - c1.lat) * DEG_TO_RAD;
    double dlon = (c2.lon - c1.lon) * DEG_TO_RAD;
    double lat1 = c1.lat * DEG_TO_RAD;
    double lat2 = c2.lat * DEG_TO_RAD;

    double a = std::sin(dlat / 2.0) * std::sin(dlat / 2.0) +
               std::cos(lat1) * std::cos(lat2) *
               std::sin(dlon / 2.0) * std::sin(dlon / 2.0);
    double c = 2.0 * std::atan2(std::sqrt(a), std::sqrt(1.0 - a));
    return RADIO_TIERRA_M * c;
}

constexpr double METROS_POR_GRADO = RADIO_TIERRA_M * DEG_TO_RAD;

// La aproximación equirrectangular sobreestima la distancia de gran círculo hasta ~0.0125%
// en 400 km; este margen la mantiene siempre por debajo.
constexpr double MARGEN_HEURISTICA = 0.999;

// Distancia plana equirrectangular rápida (5x-8x más rápida que Haversine) para la heurística A*.
// Es admisible: nunca supera la distancia real, porque usa el radio medio (6,371,000 m, menor que el
// de 6,371,009 m con el que OSMnx calcula la longitud de las aristas) y el margen anterior.
inline float distancia_rapida_metros(const Coordenada& c1, const Coordenada& c2) {
    double lat_media_rad = (c1.lat + c2.lat) * 0.5 * DEG_TO_RAD;
    double dx = (c2.lon - c1.lon) * std::cos(lat_media_rad) * METROS_POR_GRADO;
    double dy = (c2.lat - c1.lat) * METROS_POR_GRADO;
    return static_cast<float>(std::sqrt(dx * dx + dy * dy) * MARGEN_HEURISTICA);
}

// Heurística de A* con las posiciones de Grafo::preparar_plano: sin trigonometría por nodo.
// Admisible por la misma razón que distancia_rapida_metros (escala x menor o igual, mismo margen).
inline float distancia_plana(const PuntoPlano& a, const PuntoPlano& b) {
    const float dx = a.x - b.x;
    const float dy = a.y - b.y;
    return std::sqrt(dx * dx + dy * dy) * static_cast<float>(MARGEN_HEURISTICA);
}

inline void Grafo::preparar_plano() {
    plano.resize(coords.size());
    if (coords.empty()) return;
    double lat_min = coords[0].lat, lat_max = coords[0].lat, lon_min = coords[0].lon, lon_max = coords[0].lon;
    for (const auto& c : coords) {
        lat_min = std::min(lat_min, c.lat);
        lat_max = std::max(lat_max, c.lat);
        lon_min = std::min(lon_min, c.lon);
        lon_max = std::max(lon_max, c.lon);
    }
    const double lat_extrema = std::max(std::abs(lat_min), std::abs(lat_max));
    const double escala_x = std::cos(std::min(lat_extrema, 89.0) * DEG_TO_RAD) * METROS_POR_GRADO;
    const double lat_centro = (lat_min + lat_max) * 0.5;
    const double lon_centro = (lon_min + lon_max) * 0.5;
    for (size_t i = 0; i < coords.size(); ++i) {
        plano[i] = {static_cast<float>((coords[i].lon - lon_centro) * escala_x),
                    static_cast<float>((coords[i].lat - lat_centro) * METROS_POR_GRADO)};
    }
}

// Rumbo de a hacia b en grados (0 = norte, 90 = este, -90 = oeste). La diferencia de longitud se
// escala por cos(latitud): un grado de longitud mide menos que uno de latitud lejos del ecuador.
inline double angulo(const Coordenada& a, const Coordenada& b) {
    double lat_media_rad = (a.lat + b.lat) * 0.5 * DEG_TO_RAD;
    double dx = (b.lon - a.lon) * std::cos(lat_media_rad);
    double dy = b.lat - a.lat;
    return std::atan2(dx, dy) * RAD_TO_DEG;
}

} // namespace rutacraft
