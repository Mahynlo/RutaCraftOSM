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

    // A* Bidireccional (ideal para rutas largas)
    static std::vector<int> astar_bidireccional(const Grafo& grafo, int origen, int destino) {
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

        std::vector<float> g_forward(n, INF);
        std::vector<float> g_backward(n, INF);
        std::vector<int> parent_forward(n, -1);
        std::vector<int> parent_backward(n, -1);
        std::vector<bool> closed_forward(n, false);
        std::vector<bool> closed_backward(n, false);

        typedef std::pair<float, int> ElementoPQ;
        std::priority_queue<ElementoPQ, std::vector<ElementoPQ>, std::greater<ElementoPQ>> pq_forward;
        std::priority_queue<ElementoPQ, std::vector<ElementoPQ>, std::greater<ElementoPQ>> pq_backward;

        const Coordenada& c_orig = grafo.coords[origen];
        const Coordenada& c_dest = grafo.coords[destino];

        g_forward[origen] = 0.0f;
        pq_forward.push({distancia_rapida_metros(c_orig, c_dest), origen});

        g_backward[destino] = 0.0f;
        pq_backward.push({distancia_rapida_metros(c_dest, c_orig), destino});

        int punto_encuentro = -1;
        float mejor_distancia = INF;

        while (!pq_forward.empty() && !pq_backward.empty()) {
            // Paso hacia adelante
            if (!pq_forward.empty()) {
                auto [f_fwd, u] = pq_forward.top();
                pq_forward.pop();

                if (!closed_forward[u]) {
                    closed_forward[u] = true;

                    if (closed_backward[u]) {
                        float dist_total = g_forward[u] + g_backward[u];
                        if (dist_total < mejor_distancia) {
                            mejor_distancia = dist_total;
                            punto_encuentro = u;
                            break;
                        }
                    }

                    for (const auto& arista : grafo.adj_list[u]) {
                        int v = arista.destino;
                        float tentative_g = g_forward[u] + arista.peso;
                        if (tentative_g < g_forward[v]) {
                            g_forward[v] = tentative_g;
                            parent_forward[v] = u;
                            float f_v = tentative_g + distancia_rapida_metros(grafo.coords[v], c_dest);
                            pq_forward.push({f_v, v});

                            if (closed_backward[v]) {
                                float dist_total = tentative_g + g_backward[v];
                                if (dist_total < mejor_distancia) {
                                    mejor_distancia = dist_total;
                                    punto_encuentro = v;
                                }
                            }
                        }
                    }
                }
            }

            // Paso hacia atrás
            if (!pq_backward.empty()) {
                auto [f_bwd, u] = pq_backward.top();
                pq_backward.pop();

                if (!closed_backward[u]) {
                    closed_backward[u] = true;

                    if (closed_forward[u]) {
                        float dist_total = g_forward[u] + g_backward[u];
                        if (dist_total < mejor_distancia) {
                            mejor_distancia = dist_total;
                            punto_encuentro = u;
                            break;
                        }
                    }

                    for (const auto& arista : grafo.adj_list[u]) {
                        int v = arista.destino;
                        float tentative_g = g_backward[u] + arista.peso;
                        if (tentative_g < g_backward[v]) {
                            g_backward[v] = tentative_g;
                            parent_backward[v] = u;
                            float f_v = tentative_g + distancia_rapida_metros(grafo.coords[v], c_orig);
                            pq_backward.push({f_v, v});

                            if (closed_forward[v]) {
                                float dist_total = tentative_g + g_forward[v];
                                if (dist_total < mejor_distancia) {
                                    mejor_distancia = dist_total;
                                    punto_encuentro = v;
                                }
                            }
                        }
                    }
                }
            }
        }

        if (punto_encuentro == -1) {
            // Fallback a A* normal por si acaso
            return astar(grafo, origen, destino);
        }

        // Reconstruir camino desde origen hasta punto_encuentro
        std::vector<int> camino_fwd;
        int curr = punto_encuentro;
        while (curr != -1) {
            camino_fwd.push_back(curr);
            curr = parent_forward[curr];
        }
        std::reverse(camino_fwd.begin(), camino_fwd.end());

        // Reconstruir camino desde punto_encuentro hasta destino
        curr = parent_backward[punto_encuentro];
        while (curr != -1) {
            camino_fwd.push_back(curr);
            curr = parent_backward[curr];
        }

        return camino_fwd;
    }
};

} // namespace rutacraft
