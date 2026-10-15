#pragma once
#include "types.hpp"
#include "geo_utils.hpp"
#include <queue>
#include <vector>
#include <limits>
#include <algorithm>

namespace rutacraft {

class Enrutador {
public:
    // A* Unidireccional optimizado
    static std::vector<int> astar(const Grafo& grafo, int origen, int destino) {
        if (origen < 0 || destino < 0 ||
            origen >= static_cast<int>(grafo.num_nodos()) ||
            destino >= static_cast<int>(grafo.num_nodos())) {
            return {};
        }

        if (origen == destino) {
            return {origen};
        }

        const size_t n = grafo.num_nodos();
        const float INF = std::numeric_limits<float>::infinity();

        std::vector<float> g_score(n, INF);
        std::vector<int> came_from(n, -1);
        std::vector<bool> closed(n, false);

        // Min-heap: pair<f_score, nodo_id>
        typedef std::pair<float, int> ElementoPQ;
        std::priority_queue<ElementoPQ, std::vector<ElementoPQ>, std::greater<ElementoPQ>> open_set;

        const Coordenada& coord_dest = grafo.coords[destino];

        g_score[origen] = 0.0f;
        open_set.push({distancia_rapida_metros(grafo.coords[origen], coord_dest), origen});

        while (!open_set.empty()) {
            auto [f_actual, actual] = open_set.top();
            open_set.pop();

            if (actual == destino) {
                // Reconstruir camino
                std::vector<int> camino;
                int curr = destino;
                while (curr != -1) {
                    camino.push_back(curr);
                    curr = came_from[curr];
                }
                std::reverse(camino.begin(), camino.end());
                return camino;
            }

            if (closed[actual]) continue;
            closed[actual] = true;

            const float g_actual = g_score[actual];

            for (const auto& arista : grafo.adj_list[actual]) {
                int vecino = arista.destino;
                if (closed[vecino]) continue;

                float tentative_g = g_actual + arista.peso;
                if (tentative_g < g_score[vecino]) {
                    came_from[vecino] = actual;
                    g_score[vecino] = tentative_g;
                    float f_vecino = tentative_g + distancia_rapida_metros(grafo.coords[vecino], coord_dest);
                    open_set.push({f_vecino, vecino});
                }
            }
        }

        return {}; // No se encontró camino
    }
};

} // namespace rutacraft
