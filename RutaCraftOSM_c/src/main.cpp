#include "../include/types.hpp"
#include "../include/geo_utils.hpp"
#include "../include/kdtree.hpp"
#include "../include/astar.hpp"
#include "../include/instrucciones.hpp"
#include "../include/grafo.hpp"
#include "../include/cache.hpp"
#include "../include/json.hpp"

#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <filesystem>
#include <iomanip>

#ifdef _WIN32
#include <windows.h>
#endif

namespace fs = std::filesystem;
using json = nlohmann::json;
using namespace rutacraft;

std::string obtener_directorio_ejecutable() {
#ifdef _WIN32
    char buffer[MAX_PATH];
    GetModuleFileNameA(NULL, buffer, MAX_PATH);
    return fs::path(buffer).parent_path().string();
#else
    return fs::current_path().string();
#endif
}

std::string resolver_ruta_grafo(const std::string& ruta_relativa) {
    if (fs::exists(ruta_relativa)) return ruta_relativa;

    std::string exe_dir = obtener_directorio_ejecutable();
    fs::path p1 = fs::path(exe_dir) / ruta_relativa;
    if (fs::exists(p1)) return p1.string();

    fs::path p2 = fs::path(exe_dir) / "grafos" / ruta_relativa;
    if (fs::exists(p2)) return p2.string();

    fs::path p3 = fs::path("grafos") / ruta_relativa;
    if (fs::exists(p3)) return p3.string();

    // Probar cambiando extensión a .bin si no existe
    std::string base_bin = fs::path(ruta_relativa).stem().string() + ".bin";
    if (fs::exists(base_bin)) return base_bin;
    if (fs::exists(fs::path(exe_dir) / base_bin)) return (fs::path(exe_dir) / base_bin).string();
    if (fs::exists(fs::path(exe_dir) / "grafos" / base_bin)) return (fs::path(exe_dir) / "grafos" / base_bin).string();
    if (fs::exists(fs::path("grafos") / base_bin)) return (fs::path("grafos") / base_bin).string();

    return ruta_relativa;
}

inline bool es_opcion_cli(const std::string& s) {
    if (s.rfind("--", 0) == 0) return true;
    return false;
}

int main(int argc, char* argv[]) {
    std::string grafo_path = "grafo_mazatan_villapesqueira.bin";
    std::string puntos_arg = "";
    std::vector<double> array_coords;
    std::string salida_path = "";
    std::string cache_arg = "cache_rutas.json";
    std::string cache_formato = "json";
    bool flag_stdout = false;
    bool no_save_cache = false;

    // Parseo de argumentos CLI
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--grafo" && i + 1 < argc) {
            grafo_path = argv[++i];
        } else if (arg == "--puntos" && i + 1 < argc) {
            puntos_arg = argv[++i];
        } else if (arg == "--array") {
            while (i + 1 < argc && !es_opcion_cli(argv[i + 1])) {
                try {
                    array_coords.push_back(std::stod(argv[++i]));
                } catch (...) {
                    break;
                }
            }
        } else if (arg == "--salida" && i + 1 < argc) {
            salida_path = argv[++i];
        } else if (arg == "--cache" && i + 1 < argc) {
            cache_arg = argv[++i];
        } else if (arg == "--cache-formato" && i + 1 < argc) {
            cache_formato = argv[++i];
        } else if (arg == "--stdout") {
            flag_stdout = true;
        } else if (arg == "--no-save-cache") {
            no_save_cache = true;
        }
    }

    // Validación y carga de puntos GPS
    std::vector<Coordenada> puntos_gps;

    if (!array_coords.empty()) {
        if (array_coords.size() % 2 != 0) {
            std::cerr << "Error(py): cantidad impar de coordenadas en --array\n";
            return 1;
        }
        for (size_t i = 0; i < array_coords.size(); i += 2) {
            puntos_gps.push_back({array_coords[i], array_coords[i + 1]});
        }
    } else if (!puntos_arg.empty()) {
        try {
            json j_puntos;
            if (fs::exists(puntos_arg)) {
                std::ifstream f(puntos_arg);
                j_puntos = json::parse(f);
            } else {
                j_puntos = json::parse(puntos_arg);
            }

            if (j_puntos.is_array()) {
                for (const auto& item : j_puntos) {
                    if (item.is_array() && item.size() == 2) {
                        puntos_gps.push_back({item[0].get<double>(), item[1].get<double>()});
                    }
                }
            }
        } catch (const std::exception& e) {
            std::cerr << "Error(py): Error al interpretar puntos: " << e.what() << "\n";
            return 1;
        }
    } else {
        std::cerr << "Error(py): debes proporcionar los puntos GPS con --array o --puntos\n";
        return 1;
    }

    if (puntos_gps.empty()) {
        std::cerr << "Error(py): Lista de puntos GPS vacia\n";
        return 1;
    }

    // Cargar Grafo
    std::string ruta_real_grafo = resolver_ruta_grafo(grafo_path);
    Grafo grafo;
    if (!CargadorGrafo::cargar(ruta_real_grafo, grafo)) {
        std::cerr << "Error(py): El archivo '" << ruta_real_grafo << "' no existe o formato no valido.\n";
        return 1;
    }

    // Cargar Caché
    GestorCache cache_gestor;
    bool cache_cargado = cache_gestor.cargar(cache_arg);

    // Construcción del índice espacial KD-Tree
    KDTree kdtree(grafo.coords);

    // Búsqueda de nodos más cercanos
    std::vector<int> nodos_cercanos;
    std::vector<ConexionVerde> conexiones_verdes;
    nodos_cercanos.reserve(puntos_gps.size());

    for (const auto& pt : puntos_gps) {
        double dist = 0.0;
        int nodo = kdtree.buscar_nodo_mas_cercano(pt, &dist);
        if (nodo != -1) {
            nodos_cercanos.push_back(nodo);
            if (dist > 10.0) {
                conexiones_verdes.push_back({grafo.coords[nodo], pt});
            }
        }
    }

    if (nodos_cercanos.empty()) {
        std::cerr << "Error(py): No se pudieron mapear los puntos GPS al grafo.\n";
        return 1;
    }

    // Cálculo de la ruta entre segmentos
    std::vector<int> ruta_nodos;

    for (size_t i = 1; i < nodos_cercanos.size(); ++i) {
        int u = nodos_cercanos[i - 1];
        int v = nodos_cercanos[i];

        int64_t u_osm = grafo.osm_ids[u];
        int64_t v_osm = grafo.osm_ids[v];
        std::string clave = GestorCache::hacer_clave(u_osm, v_osm);

        std::vector<int> segmento;

        if (cache_gestor.cache.find(clave) != cache_gestor.cache.end()) {
            const auto& ruta_osm = cache_gestor.cache[clave];
            for (int64_t osm_id : ruta_osm) {
                if (grafo.osm_to_idx.find(osm_id) != grafo.osm_to_idx.end()) {
                    segmento.push_back(grafo.osm_to_idx[osm_id]);
                }
            }
        } else {
            segmento = Enrutador::astar(grafo, u, v);
            if (!segmento.empty()) {
                std::vector<int64_t> ruta_osm;
                for (int idx : segmento) {
                    ruta_osm.push_back(grafo.osm_ids[idx]);
                }
                cache_gestor.cache[clave] = ruta_osm;
            }
        }

        if (segmento.empty()) {
            std::cerr << "Error(py): No se encontro ruta entre " << u_osm << " y " << v_osm << "\n";
        } else {
            if (i == 1) {
                ruta_nodos.insert(ruta_nodos.end(), segmento.begin(), segmento.end());
            } else {
                ruta_nodos.insert(ruta_nodos.end(), segmento.begin() + 1, segmento.end());
            }
        }
    }

    // Generar coordenadas de la ruta
    json j_ruta = json::array();
    for (int n_idx : ruta_nodos) {
        j_ruta.push_back({grafo.coords[n_idx].lat, grafo.coords[n_idx].lon});
    }

    // Generar instrucciones de navegación
    auto [instrucciones, distancia_total] = GeneradorInstrucciones::generar(grafo, ruta_nodos);

    json j_instrucciones = json::array();
    for (const auto& inst : instrucciones) {
        j_instrucciones.push_back({
            {"accion", inst.accion},
            {"calle", inst.calle},
            {"desde", {inst.desde.lat, inst.desde.lon}},
            {"hacia", {inst.hacia.lat, inst.hacia.lon}},
            {"distancia_m", inst.distancia_m}
        });
    }

    json j_puntos_gps = json::array();
    for (const auto& pt : puntos_gps) {
        j_puntos_gps.push_back({pt.lat, pt.lon});
    }

    json resultado = {
        {"puntos_gps", j_puntos_gps},
        {"ruta", j_ruta},
        {"distancia_total_m", distancia_total},
        {"distancia_total_km", std::round((distancia_total / 1000.0) * 100.0) / 100.0},
        {"instrucciones", j_instrucciones}
    };

    // Guardar cache si aplica
    if (!no_save_cache) {
        bool es_json_directo = false;
        try {
            auto test_json = json::parse(cache_arg);
            if (test_json.is_object()) es_json_directo = true;
        } catch (...) {}

        if (!es_json_directo && !cache_arg.empty()) {
            cache_gestor.guardar(cache_arg);
        }
    }

    // Guardar archivo de salida si se solicitó
    if (!salida_path.empty()) {
        std::ofstream file_out(salida_path);
        if (file_out.is_open()) {
            file_out << resultado.dump(2);
        }
    }

    // Salida por consola
    if (flag_stdout) {
        json full_output = {
            {"resultado", resultado},
            {"cache", cache_gestor.a_json()}
        };
        std::cout << full_output.dump(2) << std::endl;
    } else if (salida_path.empty()) {
        std::cout << resultado.dump(2) << std::endl;
    }

    return 0;
}
