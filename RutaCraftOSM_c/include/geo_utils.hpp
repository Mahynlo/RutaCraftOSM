#pragma once
#include "types.hpp"
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

// Distancia plana equirrectangular rápida (5x-8x más rápida que Haversine, ideal para heurística A*)
inline float distancia_rapida_metros(const Coordenada& c1, const Coordenada& c2) {
    double lat_media_rad = (c1.lat + c2.lat) * 0.5 * DEG_TO_RAD;
    double dx = (c2.lon - c1.lon) * std::cos(lat_media_rad) * 111320.0;
    double dy = (c2.lat - c1.lat) * 110574.0;
    return static_cast<float>(std::sqrt(dx * dx + dy * dy));
}

// Ángulo azimutal de navegación (-180 a 180 o 0 a 360)
inline double angulo(const Coordenada& a, const Coordenada& b) {
    double dx = b.lon - a.lon;
    double dy = b.lat - a.lat;
    return std::atan2(dx, dy) * RAD_TO_DEG;
}

} // namespace rutacraft
