#include "../include/types.hpp"
#include "../include/geo_utils.hpp"
#include "../include/kdtree.hpp"
#include "../include/astar.hpp"
#include "../include/instrucciones.hpp"
#include "../include/grafo.hpp"
#include "../include/cache.hpp"
#include "../include/json.hpp"
#include "../include/ruta.hpp"

#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <filesystem>
#include <iomanip>
#include <stdexcept>

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
    std::error_code ec;
    fs::path exe = fs::read_symlink("/proc/self/exe", ec);
    return ec ? fs::current_path().string() : exe.parent_path().string();
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

// Interpreta un array JSON [[lat, lon], ...]; ignora elementos mal formados
std::vector<Coordenada> puntos_desde_json(const json& j_puntos) {
    std::vector<Coordenada> puntos;
    if (j_puntos.is_array()) {
        for (const auto& item : j_puntos) {
            if (item.is_array() && item.size() == 2 && item[0].is_number() && item[1].is_number()) {
                puntos.push_back({item[0].get<double>(), item[1].get<double>()});
            }
        }
    }
    return puntos;
}

// Modo servidor: el grafo se carga una sola vez y cada línea de stdin es una petición
//   entrada: {"id": 1, "puntos": [[lat, lon], ...]}
//   salida:  {"id": 1, "ok": true, "resultado": {...}}  |  {"id": 1, "ok": false, "error": "..."}
// Al cerrarse stdin se guarda el caché (si aplica) y el proceso termina.
int ejecutar_servidor(const Grafo& grafo, const KDTree& kdtree, GestorCache& cache_gestor) {
    std::string linea;
    while (std::getline(std::cin, linea)) {
        if (linea.find_first_not_of(" \t\r\n") == std::string::npos) continue;

        json respuesta = {{"id", nullptr}};
        try {
            json peticion = json::parse(linea);
            if (peticion.contains("id")) respuesta["id"] = peticion["id"];

            std::vector<Coordenada> puntos = puntos_desde_json(peticion.value("puntos", json::array()));
            respuesta["resultado"] = calcular_ruta(grafo, kdtree, cache_gestor, puntos);
            respuesta["ok"] = true;
        } catch (const std::exception& e) {
            respuesta.erase("resultado");
            respuesta["ok"] = false;
            respuesta["error"] = e.what();
        }

        std::cout << respuesta.dump(-1, ' ', false, json::error_handler_t::replace) << "\n" << std::flush;
    }
    return 0;
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
    bool sin_cache = false;
    bool modo_servidor = false;

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
        } else if (arg == "--sin-cache") {
            sin_cache = true;
        } else if (arg == "--serve") {
            modo_servidor = true;
        }
    }

    // --sin-cache: ni se lee ni se escribe ningún archivo de caché
    if (sin_cache) {
        cache_arg = "";
        no_save_cache = true;
    }

    // Validación y carga de puntos GPS (no aplica en modo servidor)
    std::vector<Coordenada> puntos_gps;

    if (modo_servidor) {
        // Los puntos llegan por stdin
    } else if (!array_coords.empty()) {
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
            puntos_gps = puntos_desde_json(j_puntos);
        } catch (const std::exception& e) {
            std::cerr << "Error(py): Error al interpretar puntos: " << e.what() << "\n";
            return 1;
        }
    } else {
        std::cerr << "Error(py): debes proporcionar los puntos GPS con --array o --puntos\n";
        return 1;
    }

    if (!modo_servidor && puntos_gps.empty()) {
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
    cache_gestor.cargar(cache_arg);

    // Construcción del índice espacial KD-Tree
    KDTree kdtree(grafo.coords);

    int codigo_salida = 0;
    json resultado;

    if (modo_servidor) {
        codigo_salida = ejecutar_servidor(grafo, kdtree, cache_gestor);
    } else {
        try {
            resultado = calcular_ruta(grafo, kdtree, cache_gestor, puntos_gps);
        } catch (const std::exception& e) {
            std::cerr << "Error(py): " << e.what() << "\n";
            return 1;
        }
    }

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

    if (modo_servidor) return codigo_salida;

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
