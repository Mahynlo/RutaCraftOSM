#pragma once
#include "types.hpp"
#include "geo_utils.hpp"
#include <vector>
#include <algorithm>
#include <limits>
#include <cmath>

namespace rutacraft {

class KDTree {
private:
    struct KDNode {
        int idx = -1;       // Índice en el grafo
        int left = -1;
        int right = -1;
        int axis = 0;       // 0 para lat, 1 para lon
    };

    const std::vector<Coordenada>& coords;
    std::vector<KDNode> tree;
    int root = -1;

    int construir(std::vector<int>& indices, int inicio, int fin, int profundidad) {
        if (inicio >= fin) return -1;

        int axis = profundidad % 2;
        int medio = inicio + (fin - inicio) / 2;

        if (axis == 0) {
            std::nth_element(indices.begin() + inicio, indices.begin() + medio, indices.begin() + fin,
                [this](int a, int b) { return coords[a].lat < coords[b].lat; });
        } else {
            std::nth_element(indices.begin() + inicio, indices.begin() + medio, indices.begin() + fin,
                [this](int a, int b) { return coords[a].lon < coords[b].lon; });
        }

        int node_pos = static_cast<int>(tree.size());
        tree.push_back({indices[medio], -1, -1, axis});

        int left_child = construir(indices, inicio, medio, profundidad + 1);
        int right_child = construir(indices, medio + 1, fin, profundidad + 1);

        tree[node_pos].left = left_child;
        tree[node_pos].right = right_child;

        return node_pos;
    }

    void buscar_cercano_rec(int curr, const Coordenada& objetivo, int& mejor_idx, double& mejor_dist) const {
        if (curr == -1) return;

        const auto& nodo = tree[curr];
        const auto& c = coords[nodo.idx];

        double d = haversine(objetivo, c);
        if (d < mejor_dist) {
            mejor_dist = d;
            mejor_idx = nodo.idx;
        }

        double diff = (nodo.axis == 0) ? (objetivo.lat - c.lat) : (objetivo.lon - c.lon);
        // Estimación rápida de distancia mínima al plano divisor en metros
        double diff_m = (nodo.axis == 0) ? (std::abs(diff) * 110574.0) : (std::abs(diff) * 111320.0 * std::cos(objetivo.lat * DEG_TO_RAD));

        int primer_hijo = (diff <= 0) ? nodo.left : nodo.right;
        int segundo_hijo = (diff <= 0) ? nodo.right : nodo.left;

        buscar_cercano_rec(primer_hijo, objetivo, mejor_idx, mejor_dist);

        if (diff_m < mejor_dist) {
            buscar_cercano_rec(segundo_hijo, objetivo, mejor_idx, mejor_dist);
        }
    }

public:
    explicit KDTree(const std::vector<Coordenada>& coordenadas) : coords(coordenadas) {
        if (coords.empty()) return;
        std::vector<int> indices(coords.size());
        for (size_t i = 0; i < coords.size(); ++i) indices[i] = static_cast<int>(i);
        tree.reserve(coords.size());
        root = construir(indices, 0, static_cast<int>(indices.size()), 0);
    }

    int buscar_nodo_mas_cercano(const Coordenada& objetivo, double* out_distancia = nullptr) const {
        if (root == -1 || coords.empty()) return -1;
        int mejor_idx = -1;
        double mejor_dist = std::numeric_limits<double>::infinity();
        buscar_cercano_rec(root, objetivo, mejor_idx, mejor_dist);
        if (out_distancia) *out_distancia = mejor_dist;
        return mejor_idx;
    }
};

} // namespace rutacraft
