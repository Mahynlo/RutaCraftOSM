#pragma once
#include "types.hpp"
#include "geo_utils.hpp"
#include <algorithm>
#include <cmath>
#include <string>
#include <vector>

namespace rutacraft {

// Genera instrucciones giro a giro agrupando la ruta por calle:
//  1. Cada tramo continuo sobre la misma calle es una sola instrucción. Solo se separa si dentro de
//     ella hay un giro muy cerrado (p. ej. una vuelta en U) o, en vías sin nombre, un giro marcado.
//  2. El ángulo de cada maniobra se mide con la dirección de los ~15 m anteriores y posteriores, no
//     con un solo segmento: con simplify=False hay segmentos de pocos metros que meten ruido.
//  3. Los tramos de menos de ~15 m (cruces, desviaciones cortas) se absorben en el tramo vecino.
class GeneradorInstrucciones {
public:
    static constexpr double DISTANCIA_RUMBO_M = 15.0;    // tramo para medir la dirección de entrada y salida
    static constexpr double TRAMO_MINIMO_M = 15.0;       // tramos más cortos no generan instrucción propia
    static constexpr double CORTE_SIN_NOMBRE = 45.0;     // vías sin nombre: separar en giros mayores
    static constexpr double CORTE_CON_NOMBRE = 120.0;    // misma calle: separar solo giros muy cerrados

    static std::string buscar_nombre_calle(const Grafo& grafo, int u, int v) {
        if (u < 0 || u >= static_cast<int>(grafo.num_nodos())) return "desconocida";
        for (const auto& arista : grafo.adj_list[u]) {
            if (arista.destino == v) {
                return arista.calle.empty() ? "desconocida" : arista.calle;
            }
        }
        return "desconocida";
    }

    // giro en grados (-180, 180]: positivo a la derecha, negativo a la izquierda
    static std::string clasificar_giro(double giro) {
        const double a = std::abs(giro);
        const std::string lado = giro > 0 ? "derecha" : "izquierda";
        if (a < 30.0) return "Sigue recto";
        if (a < 60.0) return "Gira ligeramente a la " + lado;
        if (a < 135.0) return "Gira a la " + lado;
        if (a < 165.0) return "Gira bruscamente a la " + lado;
        return "Da vuelta en U";
    }

    static std::pair<std::vector<Instruccion>, double> generar(const Grafo& grafo, const std::vector<int>& ruta_nodos) {
        std::vector<Instruccion> instrucciones;
        const size_t n = ruta_nodos.size();
        if (n < 2) {
            return {instrucciones, 0.0};
        }

        auto coord = [&](size_t i) -> const Coordenada& { return grafo.coords[ruta_nodos[i]]; };

        // Distancia acumulada hasta cada vértice y nombre de la calle de cada arista (i -> i+1)
        std::vector<double> acumulada(n, 0.0);
        std::vector<std::string> calles(n - 1);
        for (size_t i = 1; i < n; ++i) {
            acumulada[i] = acumulada[i - 1] + haversine(coord(i - 1), coord(i));
            calles[i - 1] = buscar_nombre_calle(grafo, ruta_nodos[i - 1], ruta_nodos[i]);
        }
        const double total = acumulada[n - 1];

        // Punto de la ruta a una distancia dada desde el inicio
        auto punto_en = [&](double d) -> Coordenada {
            d = std::clamp(d, 0.0, total);
            size_t k = std::upper_bound(acumulada.begin(), acumulada.end(), d) - acumulada.begin();
            if (k == 0) return coord(0);
            if (k >= n) return coord(n - 1);
            const double largo = acumulada[k] - acumulada[k - 1];
            const double t = largo > 0 ? (d - acumulada[k - 1]) / largo : 0.0;
            const Coordenada& a = coord(k - 1);
            const Coordenada& b = coord(k);
            return {a.lat + (b.lat - a.lat) * t, a.lon + (b.lon - a.lon) * t};
        };

        // Giro en el vértice i usando la dirección de los tramos anteriores y posteriores
        auto giro_en = [&](size_t i) -> double {
            const Coordenada antes = punto_en(acumulada[i] - DISTANCIA_RUMBO_M);
            const Coordenada despues = punto_en(acumulada[i] + DISTANCIA_RUMBO_M);
            const Coordenada& aqui = coord(i);
            if ((antes.lat == aqui.lat && antes.lon == aqui.lon) || (despues.lat == aqui.lat && despues.lon == aqui.lon)) {
                return 0.0;
            }
            return std::fmod(angulo(aqui, despues) - angulo(antes, aqui) + 540.0, 360.0) - 180.0;
        };

        auto corte = [&](const std::string& calle) {
            return calle == "desconocida" ? CORTE_SIN_NOMBRE : CORTE_CON_NOMBRE;
        };

        // 1. Agrupar aristas consecutivas por calle (grupo = vértices ini..fin)
        struct Grupo { size_t ini; size_t fin; std::string calle; };
        std::vector<Grupo> grupos;
        size_t inicio = 0;
        for (size_t i = 1; i + 1 < n; ++i) {
            if (calles[i] != calles[i - 1] || std::abs(giro_en(i)) > corte(calles[i])) {
                grupos.push_back({inicio, i, calles[i - 1]});
                inicio = i;
            }
        }
        grupos.push_back({inicio, n - 1, calles[n - 2]});

        auto largo = [&](const Grupo& g) { return acumulada[g.fin] - acumulada[g.ini]; };

        // 2. Absorber tramos cortos
        bool cambio = true;
        while (cambio && grupos.size() > 1) {
            cambio = false;
            for (size_t k = 0; k < grupos.size(); ++k) {
                if (largo(grupos[k]) >= TRAMO_MINIMO_M) continue;
                if (k > 0 && k + 1 < grupos.size() && grupos[k - 1].calle == grupos[k + 1].calle &&
                    grupos[k - 1].calle != "desconocida") {
                    // Desviación corta entre dos tramos de la misma calle: es la misma calle
                    grupos[k - 1].fin = grupos[k + 1].fin;
                    grupos.erase(grupos.begin() + k, grupos.begin() + k + 2);
                } else if (k + 1 < grupos.size()) {
                    // La maniobra ocurre al inicio del tramo corto; se describe con la calle siguiente
                    grupos[k + 1].ini = grupos[k].ini;
                    grupos.erase(grupos.begin() + k);
                } else {
                    grupos[k - 1].fin = grupos[k].fin;
                    grupos.erase(grupos.begin() + k);
                }
                cambio = true;
                break;
            }
        }

        // 3. Unir grupos consecutivos de la misma calle que quedaron separados sin un giro marcado
        for (size_t k = 1; k < grupos.size();) {
            if (grupos[k].calle == grupos[k - 1].calle && std::abs(giro_en(grupos[k].ini)) <= corte(grupos[k].calle)) {
                grupos[k - 1].fin = grupos[k].fin;
                grupos.erase(grupos.begin() + k);
            } else {
                ++k;
            }
        }

        // 4. Una instrucción por grupo; la acción describe la maniobra al inicio del grupo
        for (size_t k = 0; k < grupos.size(); ++k) {
            const Grupo& g = grupos[k];
            instrucciones.push_back({
                k == 0 ? std::string("Sigue recto") : clasificar_giro(giro_en(g.ini)),
                g.calle,
                coord(g.ini),
                coord(g.fin),
                std::round(largo(g) * 10.0) / 10.0
            });
        }

        return {instrucciones, std::round(total * 10.0) / 10.0};
    }
};

} // namespace rutacraft
