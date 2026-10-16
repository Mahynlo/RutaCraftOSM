#pragma once
#include "astar.hpp"
#include "types.hpp"
#include <algorithm>
#include <cmath>
#include <limits>
#include <numeric>
#include <vector>

namespace rutacraft {

// Cómo se fija el recorrido al optimizar el orden. La primera parada siempre es el inicio.
enum class ModoOrden {
    Abierto,     // Termina en cualquier parada
    Regresar,    // Vuelve al inicio al terminar
    FijarFinal,  // La última parada de la entrada se mantiene al final
};

struct ResultadoOrden {
    std::vector<int> orden;          // Índices de las paradas en orden de visita (con Regresar, termina en 0)
    double distancia_original = 0;   // Distancia por la red en el orden recibido (metros)
    double distancia_optimizada = 0; // Distancia por la red en el orden calculado (metros)
    bool exacto = false;             // true si se probaron todas las permutaciones
};

class OptimizadorOrden {
public:
    // Hasta este número de paradas libres se prueban todas las permutaciones (8! = 40,320)
    static constexpr size_t MAX_EXACTO = 8;

    // Matriz de distancias por la red entre los nodos (asimétrica si el grafo respeta sentidos)
    static std::vector<std::vector<double>> matriz(const Grafo& grafo, const std::vector<int>& nodos) {
        std::vector<std::vector<double>> d(nodos.size(), std::vector<double>(nodos.size(), 0.0));
        for (size_t i = 0; i < nodos.size(); ++i) {
            const std::vector<float> fila = Enrutador::distancias(grafo, nodos[i], nodos);
            for (size_t j = 0; j < nodos.size(); ++j) {
                // Sin camino: costo muy alto pero finito, para que la suma de costos no dé NaN
                d[i][j] = std::isinf(fila[j]) ? SIN_CAMINO : static_cast<double>(fila[j]);
            }
        }
        return d;
    }

    static ResultadoOrden optimizar(const std::vector<std::vector<double>>& d, ModoOrden modo) {
        const size_t n = d.size();
        ResultadoOrden r;

        // Secuencia con extremos fijos: inicio = 0; con Regresar se agrega 0 al final;
        // con FijarFinal la última parada (n - 1) queda al final.
        std::vector<int> secuencia(n);
        std::iota(secuencia.begin(), secuencia.end(), 0);
        if (modo == ModoOrden::Regresar && n > 0) secuencia.push_back(0);
        r.distancia_original = costo(d, secuencia);

        const bool final_fijo = modo != ModoOrden::Abierto;
        const size_t libres_ini = 1;
        const size_t libres_fin = secuencia.size() - (final_fijo ? 1 : 0);  // [libres_ini, libres_fin)

        if (libres_fin <= libres_ini + 1) {  // Cero o una parada libre: no hay nada que ordenar
            r.orden = secuencia;
            r.distancia_optimizada = r.distancia_original;
            r.exacto = true;
            return r;
        }

        if (libres_fin - libres_ini <= MAX_EXACTO) {
            r.orden = exacto(d, secuencia, libres_ini, libres_fin);
            r.exacto = true;
        } else {
            // Se mejoran dos puntos de partida: el vecino más cercano y el orden recibido. Partir también
            // del orden recibido garantiza no empeorar una ruta que ya venía bien ordenada.
            std::vector<int> desde_vecino = vecino_mas_cercano(d, secuencia, libres_ini, libres_fin);
            std::vector<int> desde_original = secuencia;
            mejorar(d, desde_vecino, libres_ini, libres_fin);
            mejorar(d, desde_original, libres_ini, libres_fin);
            r.orden = costo(d, desde_vecino) <= costo(d, desde_original) ? desde_vecino : desde_original;
        }
        r.distancia_optimizada = costo(d, r.orden);
        return r;
    }

private:
    static constexpr double SIN_CAMINO = 1e12;

    static double costo(const std::vector<std::vector<double>>& d, const std::vector<int>& s) {
        double total = 0;
        for (size_t i = 1; i < s.size(); ++i) total += d[s[i - 1]][s[i]];
        return total;
    }

    static std::vector<int> exacto(const std::vector<std::vector<double>>& d, std::vector<int> s,
                                   size_t ini, size_t fin) {
        std::sort(s.begin() + ini, s.begin() + fin);
        std::vector<int> mejor = s;
        double mejor_costo = costo(d, s);
        while (std::next_permutation(s.begin() + ini, s.begin() + fin)) {
            const double c = costo(d, s);
            if (c < mejor_costo - 1e-9) {
                mejor_costo = c;
                mejor = s;
            }
        }
        return mejor;
    }

    // Construcción inicial: desde el inicio, siempre a la parada libre más cercana
    static std::vector<int> vecino_mas_cercano(const std::vector<std::vector<double>>& d, std::vector<int> s,
                                               size_t ini, size_t fin) {
        for (size_t pos = ini; pos < fin; ++pos) {
            size_t mejor = pos;
            for (size_t k = pos + 1; k < fin; ++k) {
                if (d[s[pos - 1]][s[k]] < d[s[pos - 1]][s[mejor]]) mejor = k;
            }
            std::swap(s[pos], s[mejor]);
        }
        return s;
    }

    // 2-opt (invertir un tramo) y Or-opt (mover una parada), aceptando la primera mejora encontrada,
    // hasta que ninguna mejore. Las distancias pueden ser asimétricas (calles de un solo sentido):
    // el costo del tramo invertido se obtiene con sumas acumuladas en ambos sentidos.
    static void mejorar(const std::vector<std::vector<double>>& d, std::vector<int>& s, size_t ini, size_t fin) {
        const size_t m = s.size();
        std::vector<double> ida(m, 0.0), vuelta(m, 0.0);  // ida[k] = Σ d[s[t]][s[t+1]], t < k
        auto acumular = [&]() {
            for (size_t k = 1; k < m; ++k) {
                ida[k] = ida[k - 1] + d[s[k - 1]][s[k]];
                vuelta[k] = vuelta[k - 1] + d[s[k]][s[k - 1]];
            }
        };
        const double EPS = 1e-6;

        for (int ronda = 0; ronda < 10000; ++ronda) {
            acumular();
            bool mejoro = false;

            // 2-opt: invertir s[i..j]
            for (size_t i = ini; i < fin && !mejoro; ++i) {
                for (size_t j = i + 1; j < fin && !mejoro; ++j) {
                    const bool hay_siguiente = j + 1 < m;
                    const double antes = d[s[i - 1]][s[i]] + (ida[j] - ida[i]) + (hay_siguiente ? d[s[j]][s[j + 1]] : 0.0);
                    const double despues = d[s[i - 1]][s[j]] + (vuelta[j] - vuelta[i]) + (hay_siguiente ? d[s[i]][s[j + 1]] : 0.0);
                    if (despues < antes - EPS) {
                        std::reverse(s.begin() + i, s.begin() + j + 1);
                        mejoro = true;
                    }
                }
            }
            if (mejoro) continue;

            // Or-opt: mover la parada de la posición p para que quede entre s[q] y s[q + 1].
            // q va de ini - 1 (justo después del inicio) a fin - 1 (justo antes del final fijo, si hay),
            // así que la parada siempre queda dentro de la zona libre.
            for (size_t p = ini; p < fin && !mejoro; ++p) {
                const int x = s[p];
                const int a = s[p - 1];
                const bool hay_b = p + 1 < m;
                const double quitar = d[a][x] + (hay_b ? d[x][s[p + 1]] - d[a][s[p + 1]] : 0.0);
                for (size_t q = ini - 1; q < fin && !mejoro; ++q) {
                    if (q == p || q + 1 == p) continue;  // Misma posición
                    const int c = s[q];
                    const bool hay_e = q + 1 < m;
                    const double poner = d[c][x] + (hay_e ? d[x][s[q + 1]] - d[c][s[q + 1]] : 0.0);
                    if (poner < quitar - EPS) {
                        s.erase(s.begin() + p);
                        s.insert(s.begin() + (q < p ? q + 1 : q), x);
                        mejoro = true;
                    }
                }
            }
            if (!mejoro) break;
        }
    }
};

} // namespace rutacraft
