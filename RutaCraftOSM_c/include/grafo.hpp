#pragma once
#include "types.hpp"
#include "json.hpp"
#include <cstring>
#include <filesystem>
#include <fstream>
#include <string>
#include <unordered_map>
#include <vector>

namespace rutacraft {

using json = nlohmann::json;

// Arma un Grafo CSR a partir de aristas sueltas (formatos RCO1 y JSON).
// Deja una sola arista por par (u, v): peso mínimo y el nombre de la primera aparición, igual
// que formato_rco.deduplicar() en Python, de modo que las rutas no cambian.
class ConstructorGrafo {
public:
    explicit ConstructorGrafo(size_t num_nodos) : aristas_(num_nodos) {}

    void agregar(uint32_t u, uint32_t v, float peso, const std::string& calle) {
        for (auto& a : aristas_[u]) {
            if (a.destino == v) {
                a.peso = std::min(a.peso, peso);
                return;
            }
        }
        aristas_[u].push_back({v, peso, id_nombre(calle == "desconocida" ? std::string() : calle)});
    }

    void construir(Grafo& grafo) {
        grafo.inicio_aristas.assign(1, 0);
        grafo.destino.clear();
        grafo.peso.clear();
        grafo.nombre_id.clear();
        for (const auto& lista : aristas_) {
            for (const auto& a : lista) {
                grafo.destino.push_back(a.destino);
                grafo.peso.push_back(a.peso);
                grafo.nombre_id.push_back(a.nombre);
            }
            grafo.inicio_aristas.push_back(static_cast<uint32_t>(grafo.destino.size()));
        }
        grafo.nombres = std::move(nombres_);
    }

private:
    struct AristaTemporal { uint32_t destino; float peso; uint32_t nombre; };
    std::vector<std::vector<AristaTemporal>> aristas_;
    std::vector<std::string> nombres_{""};
    std::unordered_map<std::string, uint32_t> ids_{{"", 0}};

    uint32_t id_nombre(const std::string& calle) {
        auto [it, nuevo] = ids_.emplace(calle, static_cast<uint32_t>(nombres_.size()));
        if (nuevo) nombres_.push_back(calle);
        return it->second;
    }
};

class CargadorGrafo {
public:
    // Lee un archivo completo; vacío si no existe o no se puede leer
    static std::vector<char> leer_archivo(const std::filesystem::path& path) {
        std::ifstream file(path, std::ios::binary);
        if (!file.is_open()) return {};
        file.seekg(0, std::ios::end);
        const std::streamoff tamano = file.tellg();
        if (tamano <= 0) return {};
        std::vector<char> datos(static_cast<size_t>(tamano));
        file.seekg(0, std::ios::beg);
        if (!file.read(datos.data(), tamano)) return {};
        return datos;
    }

    // RCO2: arreglos contiguos que se copian en bloque (ver RutaCraftOSM/formato_rco.py)
    static bool cargar_rco2(const std::vector<char>& datos, Grafo& grafo) {
        struct Encabezado {
            char magic[4];
            uint32_t version, flags, num_nodos, num_aristas, num_nombres, bytes_nombres, reservado;
        };
        static_assert(sizeof(Encabezado) == 32, "El encabezado RCO2 mide 32 bytes");
        if (datos.size() < sizeof(Encabezado)) return false;

        Encabezado h;
        std::memcpy(&h, datos.data(), sizeof(h));
        if (std::memcmp(h.magic, "RCO2", 4) != 0 || h.version != 2) return false;

        const uint64_t n = h.num_nodos, e = h.num_aristas, k = h.num_nombres;
        const uint64_t esperado = sizeof(Encabezado) + n * 8 + n * 16 + (n + 1) * 4 + e * 12 + (k + 1) * 4 + h.bytes_nombres;
        if (datos.size() != esperado || k == 0) return false;  // Archivo truncado o con basura al final

        size_t o = sizeof(Encabezado);
        auto copiar = [&](auto& vec, uint64_t cantidad) {
            vec.resize(static_cast<size_t>(cantidad));
            const size_t bytes = static_cast<size_t>(cantidad) * sizeof(vec[0]);
            if (bytes > 0) std::memcpy(vec.data(), datos.data() + o, bytes);
            o += bytes;
        };
        std::vector<uint32_t> inicio_nombres;
        copiar(grafo.osm_ids, n);
        copiar(grafo.coords, n);
        copiar(grafo.inicio_aristas, n + 1);
        copiar(grafo.destino, e);
        copiar(grafo.peso, e);
        copiar(grafo.nombre_id, e);
        copiar(inicio_nombres, k + 1);

        // Validar índices para que un archivo corrupto no provoque accesos fuera de rango
        if (grafo.inicio_aristas.front() != 0 || grafo.inicio_aristas.back() != e) return false;
        for (size_t i = 1; i < grafo.inicio_aristas.size(); ++i) {
            if (grafo.inicio_aristas[i] < grafo.inicio_aristas[i - 1]) return false;
        }
        for (size_t i = 0; i < e; ++i) {
            if (grafo.destino[i] >= n || grafo.nombre_id[i] >= k) return false;
        }
        if (inicio_nombres.front() != 0 || inicio_nombres.back() != h.bytes_nombres) return false;

        grafo.nombres.resize(static_cast<size_t>(k));
        for (size_t i = 0; i < k; ++i) {
            if (inicio_nombres[i + 1] < inicio_nombres[i]) return false;
            grafo.nombres[i].assign(datos.data() + o + inicio_nombres[i], inicio_nombres[i + 1] - inicio_nombres[i]);
        }
        grafo.dirigido = (h.flags & 1u) != 0;
        return true;
    }

    // RCO1 (histórico): cada arista repite el nombre de calle y el tipo de vía
    static bool cargar_rco1(const std::vector<char>& datos, Grafo& grafo) {
        size_t o = 0;
        auto leer = [&](void* destino, size_t bytes) {
            if (o + bytes > datos.size()) return false;
            std::memcpy(destino, datos.data() + o, bytes);
            o += bytes;
            return true;
        };
        char magic[4];
        uint32_t n = 0;
        if (!leer(magic, 4) || std::memcmp(magic, "RCO1", 4) != 0 || !leer(&n, 4)) return false;
        if (static_cast<uint64_t>(n) * 24 > datos.size()) return false;

        grafo.osm_ids.resize(n);
        grafo.coords.resize(n);
        for (uint32_t i = 0; i < n; ++i) {
            if (!leer(&grafo.osm_ids[i], 8) || !leer(&grafo.coords[i].lat, 8) || !leer(&grafo.coords[i].lon, 8)) return false;
        }

        ConstructorGrafo constructor(n);
        std::string calle;
        for (uint32_t u = 0; u < n; ++u) {
            uint32_t num_aristas = 0;
            if (!leer(&num_aristas, 4)) return false;
            for (uint32_t j = 0; j < num_aristas; ++j) {
                uint32_t v = 0;
                float peso = 0.0f;
                uint16_t largo = 0;
                if (!leer(&v, 4) || !leer(&peso, 4) || !leer(&largo, 2) || o + largo > datos.size() || v >= n) return false;
                calle.assign(datos.data() + o, largo);
                o += largo;
                if (!leer(&largo, 2) || o + largo > datos.size()) return false;
                o += largo;  // Tipo de vía: el motor no lo usa
                constructor.agregar(u, v, peso, calle);
            }
        }
        if (o != datos.size()) return false;
        constructor.construir(grafo);
        grafo.dirigido = false;
        return true;
    }

    // JSON: {"coords": {"osm_id": [lat, lon]}, "adj_list": {"osm_id": [[destino, peso, calle?, tipo?], ...]}}
    static bool cargar_json(const std::filesystem::path& path, Grafo& grafo) {
        std::ifstream file(path);
        if (!file.is_open()) return false;
        try {
            json data = json::parse(file);
            if (!data.contains("coords") || !data.contains("adj_list")) return false;

            std::unordered_map<int64_t, uint32_t> indice;
            for (auto it = data["coords"].begin(); it != data["coords"].end(); ++it) {
                indice[std::stoll(it.key())] = static_cast<uint32_t>(grafo.osm_ids.size());
                grafo.osm_ids.push_back(std::stoll(it.key()));
                grafo.coords.push_back({it.value()[0].get<double>(), it.value()[1].get<double>()});
            }

            ConstructorGrafo constructor(grafo.osm_ids.size());
            for (auto it = data["adj_list"].begin(); it != data["adj_list"].end(); ++it) {
                auto u = indice.find(std::stoll(it.key()));
                if (u == indice.end()) continue;
                for (const auto& item : it.value()) {
                    if (!item.is_array() || item.size() < 2) continue;
                    const int64_t v_osm = item[0].is_string() ? std::stoll(item[0].get<std::string>()) : item[0].get<int64_t>();
                    auto v = indice.find(v_osm);
                    if (v == indice.end()) continue;
                    const std::string calle = (item.size() > 2 && item[2].is_string()) ? item[2].get<std::string>() : "";
                    constructor.agregar(u->second, v->second, item[1].get<float>(), calle);
                }
            }
            constructor.construir(grafo);
            grafo.dirigido = false;
            return true;
        } catch (...) {
            return false;
        }
    }

    // Detecta el formato por su encabezado: RCO2, RCO1 o JSON
    static bool cargar(const std::filesystem::path& path, Grafo& grafo) {
        if (cargar_sin_indice(path, grafo)) {
            grafo.preparar_indice_osm();
            return true;
        }
        grafo = Grafo{};
        return false;
    }

private:
    static bool cargar_sin_indice(const std::filesystem::path& path, Grafo& grafo) {
        const std::vector<char> datos = leer_archivo(path);
        if (datos.size() >= 4 && std::memcmp(datos.data(), "RCO2", 4) == 0) return cargar_rco2(datos, grafo);
        if (datos.size() >= 4 && std::memcmp(datos.data(), "RCO1", 4) == 0) return cargar_rco1(datos, grafo);
        if (!datos.empty() && cargar_json(path, grafo)) return true;

        // Intentar cambiar extensión a .bin si se pasó .pkl o .graphml
        if (path.has_extension() && path.extension() != ".bin") {
            std::filesystem::path path_alt = path;
            path_alt.replace_extension(".bin");
            grafo = Grafo{};
            return cargar_sin_indice(path_alt, grafo);
        }
        return false;
    }
};

} // namespace rutacraft
