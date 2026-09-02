#pragma once
#include "json.hpp"
#include <unordered_map>
#include <string>
#include <vector>
#include <fstream>
#include <sstream>

namespace rutacraft {

using json = nlohmann::json;

class GestorCache {
public:
    // Almacena cache con clave string "(origen_osm, destino_osm)" -> vector de osm_ids
    std::unordered_map<std::string, std::vector<int64_t>> cache;

    static std::string hacer_clave(int64_t u_osm, int64_t v_osm) {
        return "(" + std::to_string(u_osm) + ", " + std::to_string(v_osm) + ")";
    }

    bool cargar(const std::string& input) {
        if (input.empty()) return false;

        // 1. Intentar interpretar como JSON directo
        try {
            json data = json::parse(input);
            if (data.is_object()) {
                for (auto it = data.begin(); it != data.end(); ++it) {
                    std::vector<int64_t> ruta;
                    for (const auto& item : it.value()) {
                        if (item.is_string()) {
                            ruta.push_back(std::stoll(item.get<std::string>()));
                        } else if (item.is_number()) {
                            ruta.push_back(item.get<int64_t>());
                        }
                    }
                    cache[it.key()] = ruta;
                }
                return true;
            }
        } catch (...) {
            // No es JSON string directo, intentar como ruta de archivo
        }

        // 2. Intentar leer desde archivo
        std::ifstream file(input);
        if (file.is_open()) {
            try {
                json data = json::parse(file);
                if (data.is_object()) {
                    for (auto it = data.begin(); it != data.end(); ++it) {
                        std::vector<int64_t> ruta;
                        for (const auto& item : it.value()) {
                            if (item.is_string()) {
                                ruta.push_back(std::stoll(item.get<std::string>()));
                            } else if (item.is_number()) {
                                ruta.push_back(item.get<int64_t>());
                            }
                        }
                        cache[it.key()] = ruta;
                    }
                    return true;
                }
            } catch (...) {}
        }

        return false;
    }

    bool guardar(const std::string& path) const {
        std::ofstream file(path);
        if (!file.is_open()) return false;

        json j = json::object();
        for (const auto& [k, v] : cache) {
            std::vector<std::string> ruta_str;
            for (int64_t id : v) ruta_str.push_back(std::to_string(id));
            j[k] = ruta_str;
        }

        file << j.dump(2);
        return true;
    }

    json a_json() const {
        json j = json::object();
        for (const auto& [k, v] : cache) {
            std::vector<std::string> ruta_str;
            for (int64_t id : v) ruta_str.push_back(std::to_string(id));
            j[k] = ruta_str;
        }
        return j;
    }
};

} // namespace rutacraft
