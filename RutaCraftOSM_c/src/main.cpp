#include "../include/archivos.hpp"
#include "../include/errores.hpp"
#include "../include/motor.hpp"

#include <iostream>
#include <fstream>
#include <iterator>
#include <sstream>
#include <string>
#include <vector>
#include <filesystem>
#include <iomanip>
#include <stdexcept>

// Versión del motor (la define CMake a partir de project(VERSION); build.bat no la conoce)
#ifndef RUTACRAFT_VERSION
#define RUTACRAFT_VERSION "desarrollo"
#endif

namespace fs = std::filesystem;
using json = nlohmann::json;
using namespace rutacraft;

fs::path obtener_directorio_ejecutable() {
    fs::path exe = ruta_ejecutable();
    if (exe.empty()) {
        std::error_code ec;
        return fs::current_path(ec);
    }
    return exe.parent_path();
}

// Busca el grafo en el directorio actual, junto al ejecutable, en grafos/ y en ../grafos/
// (paquete npm: bin/<plataforma>/cli con el grafo compartido en bin/grafos/). Rutas en UTF-8.
fs::path resolver_ruta_grafo(const std::string& ruta_utf8_grafo) {
    const fs::path ruta = ruta_utf8(ruta_utf8_grafo);
    const fs::path exe_dir = obtener_directorio_ejecutable();
    const fs::path grafos_hermana = exe_dir.parent_path() / "grafos";
    fs::path base_bin = ruta.stem();
    base_bin += ".bin";

    for (const fs::path& candidato : {
             ruta, exe_dir / ruta, exe_dir / "grafos" / ruta, grafos_hermana / ruta, fs::path("grafos") / ruta,
             base_bin, exe_dir / base_bin, exe_dir / "grafos" / base_bin, grafos_hermana / base_bin,
             fs::path("grafos") / base_bin}) {
        if (existe(candidato)) return candidato;
    }
    return ruta;
}

std::string leer_stdin_completo() {
    std::ostringstream contenido;
    contenido << std::cin.rdbuf();
    return contenido.str();
}

inline bool es_opcion_cli(const std::string& s) {
    if (s.rfind("--", 0) == 0) return true;
    return false;
}

// Modo servidor: el grafo se carga una sola vez y cada línea de stdin es una petición (protocolo
// en Motor::responder). Al cerrarse stdin se guarda el caché (si aplica) y el proceso termina.
int ejecutar_servidor(Motor& motor) {
    std::string linea;
    while (std::getline(std::cin, linea)) {
        if (linea.find_first_not_of(" \t\r\n") == std::string::npos) continue;
        std::cout << Motor::serializar(motor.responder(linea)) << "\n" << std::flush;
    }
    return 0;
}

int ejecutar(const std::vector<std::string>& argv);

// Códigos de salida: 0 ok, 1 error interno, 2 entrada inválida, 3 grafo inválido, 4 sin ruta (ver errores.hpp)
int main(int argc, char* argv[]) {
    try {
        return ejecutar(argumentos_utf8(argc, argv));
    } catch (const ErrorRuta& e) {
        std::cerr << "Error: " << e.what() << "\n";
        return static_cast<int>(e.codigo());
    } catch (const std::exception& e) {
        // Cualquier excepción no prevista termina con un mensaje, nunca con std::terminate
        std::cerr << "Error: " << e.what() << "\n";
        return static_cast<int>(CodigoError::Interno);
    }
}

// argv: argumentos en UTF-8, sin el nombre del programa
int ejecutar(const std::vector<std::string>& argv) {
    const int argc = static_cast<int>(argv.size());
    std::string grafo_path = "grafo_mazatan_villapesqueira.bin";
    std::string puntos_arg = "";
    std::vector<double> array_coords;
    std::string salida_path = "";
    std::string cache_arg = "cache_rutas.json";
    bool flag_stdout = false;
    bool no_save_cache = false;
    bool sin_cache = false;
    bool modo_servidor = false;
    OpcionesRuta opciones;

    auto valor = [&](int& i, const std::string& opcion) -> std::string {
        if (i + 1 >= argc) throw ErrorRuta(CodigoError::EntradaInvalida, "Falta el valor de " + opcion);
        return argv[++i];
    };

    // Parseo de argumentos CLI
    for (const std::string& arg : argv) {
        if (arg == "--version") {
            std::cout << "ruta-craft-osm " << RUTACRAFT_VERSION << "\n";
            return 0;
        }
    }

    for (int i = 0; i < argc; ++i) {
        const std::string& arg = argv[i];
        if (arg == "--grafo") {
            grafo_path = valor(i, arg);
        } else if (arg == "--puntos") {
            puntos_arg = valor(i, arg);
        } else if (arg == "--array") {
            while (i + 1 < argc && !es_opcion_cli(argv[i + 1])) {
                try {
                    array_coords.push_back(std::stod(argv[i + 1]));
                } catch (...) {
                    throw ErrorRuta(CodigoError::EntradaInvalida, "Coordenada no numerica en --array: " + argv[i + 1]);
                }
                ++i;
            }
        } else if (arg == "--salida") {
            salida_path = valor(i, arg);
        } else if (arg == "--cache") {
            cache_arg = valor(i, arg);
        } else if (arg == "--stdout") {
            flag_stdout = true;
        } else if (arg == "--no-save-cache") {
            no_save_cache = true;
        } else if (arg == "--sin-cache") {
            sin_cache = true;
        } else if (arg == "--serve") {
            modo_servidor = true;
        } else if (arg == "--optimizar") {
            opciones.optimizar = true;
        } else if (arg == "--regresar") {
            opciones.regresar = true;
        } else if (arg == "--fijar-final") {
            opciones.fijar_final = true;
        } else {
            throw ErrorRuta(CodigoError::EntradaInvalida, "Opcion desconocida: " + arg);
        }
    }

    if (opciones.regresar && opciones.fijar_final) {
        throw ErrorRuta(CodigoError::EntradaInvalida, "Las opciones --regresar y --fijar-final no se pueden combinar");
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
            throw ErrorRuta(CodigoError::EntradaInvalida, "cantidad impar de coordenadas en --array");
        }
        for (size_t i = 0; i < array_coords.size(); i += 2) {
            puntos_gps.push_back({array_coords[i], array_coords[i + 1]});
        }
    } else if (!puntos_arg.empty()) {
        try {
            json j_puntos;
            if (puntos_arg == "-") {
                // Puntos por stdin: evita el límite de longitud de la línea de comandos (~32 KB en Windows)
                j_puntos = json::parse(leer_stdin_completo());
            } else if (existe(ruta_utf8(puntos_arg))) {
                std::ifstream f(ruta_utf8(puntos_arg));
                j_puntos = json::parse(f);
            } else {
                j_puntos = json::parse(puntos_arg);
            }
            puntos_gps = puntos_desde_json(j_puntos);
        } catch (const std::exception& e) {
            throw ErrorRuta(CodigoError::EntradaInvalida, std::string("Error al interpretar puntos: ") + e.what());
        }
    } else {
        throw ErrorRuta(CodigoError::EntradaInvalida, "debes proporcionar los puntos GPS con --array o --puntos");
    }

    if (!modo_servidor && puntos_gps.empty()) {
        throw ErrorRuta(CodigoError::EntradaInvalida, "Lista de puntos GPS vacia");
    }

    // Cargar grafo y caché
    Motor motor;
    const fs::path ruta_real_grafo = resolver_ruta_grafo(grafo_path);
    motor.cargar_archivo(ruta_real_grafo, a_utf8(ruta_real_grafo));
    motor.cache.cargar(cache_arg);

    int codigo_salida = 0;
    json resultado;

    if (modo_servidor) {
        codigo_salida = ejecutar_servidor(motor);
    } else {
        resultado = motor.calcular(puntos_gps, opciones);
    }

    // Guardar cache si aplica
    if (!no_save_cache) {
        bool es_json_directo = false;
        try {
            auto test_json = json::parse(cache_arg);
            if (test_json.is_object()) es_json_directo = true;
        } catch (...) {}

        if (!es_json_directo && !cache_arg.empty()) {
            motor.cache.guardar(cache_arg);
        }
    }

    if (modo_servidor) return codigo_salida;

    // Guardar archivo de salida si se solicitó
    if (!salida_path.empty()) {
        std::ofstream file_out(ruta_utf8(salida_path));
        if (file_out.is_open()) {
            file_out << Motor::serializar(resultado, 2);
        }
    }

    // Salida por consola
    if (flag_stdout) {
        json full_output = {
            {"resultado", resultado},
            {"cache", motor.cache.a_json()}
        };
        std::cout << Motor::serializar(full_output, 2) << std::endl;
    } else if (salida_path.empty()) {
        std::cout << Motor::serializar(resultado, 2) << std::endl;
    }

    return 0;
}
