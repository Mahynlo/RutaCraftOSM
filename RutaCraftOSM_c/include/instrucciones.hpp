#pragma once
#include "types.hpp"
#include "geo_utils.hpp"
#include <vector>
#include <string>
#include <cmath>

namespace rutacraft {

class GeneradorInstrucciones {
public:
    static std::string buscar_nombre_calle(const Grafo& grafo, int u, int v) {
        if (u < 0 || u >= static_cast<int>(grafo.num_nodos())) return "desconocida";
        for (const auto& arista : grafo.adj_list[u]) {
            if (arista.destino == v) {
                return arista.calle.empty() ? "desconocida" : arista.calle;
            }
        }
        return "desconocida";
    }

    static std::pair<std::vector<Instruccion>, double> generar(const Grafo& grafo, const std::vector<int>& ruta_nodos) {
        std::vector<Instruccion> instrucciones;
        double distancia_total = 0.0;

        if (ruta_nodos.size() < 2) {
            return {instrucciones, 0.0};
        }

        Instruccion anterior;
        bool tiene_anterior = false;

        for (size_t i = 1; i + 1 < ruta_nodos.size(); ++i) {
            int u = ruta_nodos[i - 1];
            int v = ruta_nodos[i];
            int w = ruta_nodos[i + 1];

            const auto& coord_u = grafo.coords[u];
            const auto& coord_v = grafo.coords[v];
            const auto& coord_w = grafo.coords[w];

            double dist = haversine(coord_v, coord_w);
            distancia_total += dist;

            double ang1 = angulo(coord_u, coord_v);
            double ang2 = angulo(coord_v, coord_w);
            double giro = std::fmod(ang2 - ang1 + 360.0, 360.0);

            std::string accion;
            if (giro < 30.0 || giro > 330.0) {
                accion = "Sigue recto";
            } else if (giro < 180.0) {
                accion = "Gira a la derecha";
            } else {
                accion = "Gira a la izquierda";
            }

            std::string nombre_calle = buscar_nombre_calle(grafo, v, w);

            Instruccion actual {
                accion,
                nombre_calle,
                coord_v,
                coord_w,
                std::round(dist * 10.0) / 10.0
            };

            if (tiene_anterior && anterior.accion == actual.accion && anterior.calle == actual.calle) {
                anterior.distancia_m = std::round((anterior.distancia_m + actual.distancia_m) * 10.0) / 10.0;
                anterior.hacia = actual.hacia;
            } else {
                if (tiene_anterior) {
                    instrucciones.push_back(anterior);
                }
                anterior = actual;
                tiene_anterior = true;
            }
        }

        if (tiene_anterior) {
            instrucciones.push_back(anterior);
        } else if (ruta_nodos.size() == 2) {
            // Caso de ruta corta de solo 2 nodos
            int u = ruta_nodos[0];
            int v = ruta_nodos[1];
            double dist = haversine(grafo.coords[u], grafo.coords[v]);
            distancia_total += dist;
            std::string nombre_calle = buscar_nombre_calle(grafo, u, v);
            instrucciones.push_back({
                "Sigue recto",
                nombre_calle,
                grafo.coords[u],
                grafo.coords[v],
                std::round(dist * 10.0) / 10.0
            });
        }

        return {instrucciones, std::round(distancia_total * 10.0) / 10.0};
    }
};

} // namespace rutacraft
