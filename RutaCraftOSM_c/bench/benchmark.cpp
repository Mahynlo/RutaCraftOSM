// Benchmark del motor: mide cada fase sobre un grafo y una lista de escenarios de ruta.
//   benchmark <grafo.bin> <escenarios.json> [repeticiones]
// escenarios.json: {"escenarios": [{"nombre": "...", "puntos": [[lat, lon], ...]}, ...]}
// Imprime un JSON con los tiempos, la memoria y un resumen de las instrucciones generadas.
#include "../include/grafo.hpp"
#include "../include/ruta.hpp"

#include <algorithm>
#include <chrono>
#include <filesystem>
#include <fstream>
#include <iostream>

#ifdef _WIN32
#include <windows.h>
#include <psapi.h>
#else
#include <sys/resource.h>
#endif

using namespace rutacraft;
using Reloj = std::chrono::steady_clock;

static double ms_desde(Reloj::time_point inicio) {
    return std::chrono::duration<double, std::milli>(Reloj::now() - inicio).count();
}

static double memoria_pico_mb() {
#ifdef _WIN32
    PROCESS_MEMORY_COUNTERS pmc;
    if (GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc))) {
        return pmc.PeakWorkingSetSize / (1024.0 * 1024.0);
    }
    return 0.0;
#else
    struct rusage uso;
    getrusage(RUSAGE_SELF, &uso);
    return uso.ru_maxrss / 1024.0;  // Linux reporta KB
#endif
}

static double mediana(std::vector<double> v) {
    std::sort(v.begin(), v.end());
    size_t n = v.size();
    return n % 2 ? v[n / 2] : (v[n / 2 - 1] + v[n / 2]) / 2.0;
}

static double redondear(double x, int decimales = 3) {
    double f = std::pow(10.0, decimales);
    return std::round(x * f) / f;
}

int main(int argc, char* argv[]) {
    if (argc < 3) {
        std::cerr << "Uso: benchmark <grafo.bin> <escenarios.json> [repeticiones]\n";
        return 1;
    }
    const std::string ruta_grafo = argv[1];
    const int repeticiones = argc > 3 ? std::max(1, std::atoi(argv[3])) : 5;

    json escenarios = json::parse(std::ifstream(argv[2]))["escenarios"];

    // Fase 1: carga del grafo
    auto t = Reloj::now();
    Grafo grafo;
    if (!CargadorGrafo::cargar(ruta_grafo, grafo)) {
        std::cerr << "No se pudo cargar el grafo: " << ruta_grafo << "\n";
        return 1;
    }
    double carga_ms = ms_desde(t);

    const size_t aristas = grafo.num_aristas();

    // Fase 2: índice espacial
    t = Reloj::now();
    KDTree kdtree(grafo.coords);
    double kdtree_ms = ms_desde(t);

    json j_escenarios = json::array();
    for (const auto& esc : escenarios) {
        std::vector<Coordenada> puntos;
        for (const auto& p : esc["puntos"]) puntos.push_back({p[0].get<double>(), p[1].get<double>()});

        // Fase 3: snapping de los puntos al grafo
        t = Reloj::now();
        std::vector<int> nodos;
        double snap_max_m = 0.0;
        for (const auto& p : puntos) {
            double d = 0.0;
            nodos.push_back(kdtree.buscar_nodo_mas_cercano(p, &d));
            snap_max_m = std::max(snap_max_m, d);
        }
        double snapping_ms = ms_desde(t);

        // Fase 4: solo A* (todos los tramos)
        std::vector<double> astar_ms;
        size_t nodos_ruta = 0;
        for (int r = 0; r < repeticiones; ++r) {
            t = Reloj::now();
            nodos_ruta = 0;
            for (size_t i = 1; i < nodos.size(); ++i) nodos_ruta += Enrutador::astar(grafo, nodos[i - 1], nodos[i]).size();
            astar_ms.push_back(ms_desde(t));
        }

        // Fase 5: cálculo completo como lo hace la CLI (snapping + A* + instrucciones + JSON), sin caché
        std::vector<double> total_ms;
        json resultado;
        std::string error;
        for (int r = 0; r < repeticiones; ++r) {
            GestorCache cache_vacio;
            t = Reloj::now();
            try {
                resultado = calcular_ruta(grafo, kdtree, cache_vacio, puntos);
            } catch (const std::exception& e) {
                error = e.what();
                break;
            }
            total_ms.push_back(ms_desde(t));
        }

        json j = {
            {"nombre", esc["nombre"]},
            {"puntos", puntos.size()},
            {"snapping_ms", redondear(snapping_ms)},
            {"snap_max_m", redondear(snap_max_m, 1)},
        };

        if (!error.empty()) {
            j["error"] = error;
            j_escenarios.push_back(j);
            continue;
        }

        // Resumen de las instrucciones ("señales") generadas
        const auto& inst = resultado["instrucciones"];
        int recto = 0, derecha = 0, izquierda = 0, desconocidas = 0;
        double m_desconocidos = 0.0;
        for (const auto& i : inst) {
            const std::string accion = i["accion"];
            if (accion == "Sigue recto") ++recto;
            else if (accion == "Gira a la derecha") ++derecha;
            else ++izquierda;
            if (i["calle"] == "desconocida") {
                ++desconocidas;
                m_desconocidos += i["distancia_m"].get<double>();
            }
        }
        json muestra = json::array();
        for (size_t k = 0; k < std::min<size_t>(6, inst.size()); ++k) {
            muestra.push_back(inst[k]["accion"].get<std::string>() + " en " + inst[k]["calle"].get<std::string>() +
                              " (" + std::to_string(static_cast<int>(inst[k]["distancia_m"].get<double>())) + " m)");
        }
        double distancia_m = resultado["distancia_total_m"];

        j["astar_ms"] = redondear(mediana(astar_ms));
        j["astar_nodos"] = nodos_ruta;  // Consumir el resultado evita que el compilador elimine las llamadas medidas
        j["total_ms"] = redondear(mediana(total_ms));
        j["total_ms_min"] = redondear(*std::min_element(total_ms.begin(), total_ms.end()));
        j["distancia_km"] = redondear(distancia_m / 1000.0, 2);
        j["nodos_ruta"] = resultado["ruta"].size();
        j["instrucciones"] = {
            {"total", inst.size()},
            {"recto", recto},
            {"derecha", derecha},
            {"izquierda", izquierda},
            {"m_por_instruccion", inst.empty() ? 0.0 : redondear(distancia_m / inst.size(), 1)},
            {"pct_distancia_calle_desconocida", distancia_m > 0 ? redondear(100.0 * m_desconocidos / distancia_m, 1) : 0.0},
            {"con_calle_desconocida", desconocidas},
            {"muestra", muestra}
        };
        j_escenarios.push_back(j);
    }

    json salida = {
        {"grafo", std::filesystem::path(ruta_grafo).filename().string()},
        {"tamano_mb", redondear(std::filesystem::file_size(ruta_grafo) / 1e6, 1)},
        {"nodos", grafo.num_nodos()},
        {"aristas", aristas},
        {"carga_ms", redondear(carga_ms, 1)},
        {"kdtree_ms", redondear(kdtree_ms, 1)},
        {"memoria_pico_mb", redondear(memoria_pico_mb(), 1)},
        {"repeticiones", repeticiones},
        {"escenarios", j_escenarios}
    };
    std::cout << salida.dump(2, ' ', false, json::error_handler_t::replace) << std::endl;
    return 0;
}
