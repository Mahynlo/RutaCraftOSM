#pragma once
#include "types.hpp"
#include "geo_utils.hpp"
#include <algorithm>
#include <cstdint>
#include <functional>
#include <limits>
#include <utility>
#include <vector>

namespace rutacraft {

class Enrutador {
public:
    // A* sobre el grafo CSR. Devuelve los nodos del camino de origen a destino, o vacío si no hay.
    static std::vector<int> astar(const Grafo& grafo, int origen, int destino) {
        const size_t n = grafo.num_nodos();
        if (origen < 0 || destino < 0 || static_cast<size_t>(origen) >= n || static_cast<size_t>(destino) >= n) {
            return {};
        }
        if (origen == destino) {
            return {origen};
        }

        EspacioTrabajo& w = espacio(n);
        const uint32_t gen = w.nueva_busqueda();

        // Un valor de g, padre o cerrado solo es válido si su marca es la generación actual: así no
        // hay que reiniciar los arreglos (de tamaño N) en cada búsqueda.
        auto g_de = [&](int nodo) {
            return w.marca[nodo] == gen ? w.g[nodo] : std::numeric_limits<float>::infinity();
        };

        const Coordenada& coord_dest = grafo.coords[destino];
        auto& cola = w.cola;
        cola.clear();
        const auto mayor = std::greater<ElementoPQ>();

        w.marca[origen] = gen;
        w.g[origen] = 0.0f;
        w.padre[origen] = -1;
        cola.push_back({distancia_rapida_metros(grafo.coords[origen], coord_dest), origen});

        while (!cola.empty()) {
            std::pop_heap(cola.begin(), cola.end(), mayor);
            const int actual = cola.back().second;
            cola.pop_back();

            if (actual == destino) {
                std::vector<int> camino;
                for (int curr = destino; curr != -1; curr = w.padre[curr]) camino.push_back(curr);
                std::reverse(camino.begin(), camino.end());
                return camino;
            }

            if (w.cerrado[actual] == gen) continue;  // Entrada vieja de la cola
            w.cerrado[actual] = gen;

            const float g_actual = w.g[actual];
            for (uint32_t e = grafo.inicio_aristas[actual]; e < grafo.inicio_aristas[actual + 1]; ++e) {
                const int vecino = static_cast<int>(grafo.destino[e]);
                if (w.cerrado[vecino] == gen) continue;

                const float tentativo = g_actual + grafo.peso[e];
                if (tentativo < g_de(vecino)) {
                    w.marca[vecino] = gen;
                    w.g[vecino] = tentativo;
                    w.padre[vecino] = actual;
                    cola.push_back({tentativo + distancia_rapida_metros(grafo.coords[vecino], coord_dest), vecino});
                    std::push_heap(cola.begin(), cola.end(), mayor);
                }
            }
        }

        return {};  // No se encontró camino
    }

private:
    typedef std::pair<float, int> ElementoPQ;  // (f, nodo)

    struct EspacioTrabajo {
        std::vector<float> g;
        std::vector<int> padre;
        std::vector<uint32_t> marca;    // generación en que se escribió g/padre
        std::vector<uint32_t> cerrado;  // generación en que se cerró el nodo
        std::vector<ElementoPQ> cola;   // montículo (min-heap) reutilizado
        uint32_t generacion = 0;

        uint32_t nueva_busqueda() {
            if (++generacion == 0) {  // Desbordamiento tras 2^32 búsquedas: reiniciar las marcas
                std::fill(marca.begin(), marca.end(), 0);
                std::fill(cerrado.begin(), cerrado.end(), 0);
                generacion = 1;
            }
            return generacion;
        }
    };

    // Un espacio por hilo, dimensionado para el grafo en uso
    static EspacioTrabajo& espacio(size_t n) {
        thread_local EspacioTrabajo w;
        if (w.g.size() != n) {
            w.g.assign(n, 0.0f);
            w.padre.assign(n, -1);
            w.marca.assign(n, 0);
            w.cerrado.assign(n, 0);
            w.generacion = 0;
        }
        return w;
    }
};

} // namespace rutacraft
