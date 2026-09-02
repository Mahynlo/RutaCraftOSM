#pragma once
#include "types.hpp"
#include "json.hpp"
#include <iostream>
#include <fstream>
#include <string>
#include <vector>
#include <cstring>

namespace rutacraft {

using json = nlohmann::json;

class CargadorGrafo {
public:
    // Carga binaria ultra rápida
    static bool cargar_binario(const std::string& path, Grafo& grafo) {
        std::ifstream file(path, std::ios::binary);
        if (!file.is_open()) return false;

        char magic[4];
        file.read(magic, 4);
        if (std::strncmp(magic, "RCO1", 4) != 0) {
            return false;
        }

        uint32_t num_nodos = 0;
        file.read(reinterpret_cast<char*>(&num_nodos), sizeof(uint32_t));

        grafo.osm_ids.resize(num_nodos);
        grafo.coords.resize(num_nodos);
        grafo.adj_list.resize(num_nodos);
        grafo.osm_to_idx.reserve(num_nodos);

        for (uint32_t i = 0; i < num_nodos; ++i) {
            file.read(reinterpret_cast<char*>(&grafo.osm_ids[i]), sizeof(int64_t));
            file.read(reinterpret_cast<char*>(&grafo.coords[i].lat), sizeof(double));
            file.read(reinterpret_cast<char*>(&grafo.coords[i].lon), sizeof(double));
            grafo.osm_to_idx[grafo.osm_ids[i]] = static_cast<int>(i);
        }

        for (uint32_t i = 0; i < num_nodos; ++i) {
            uint32_t num_aristas = 0;
            file.read(reinterpret_cast<char*>(&num_aristas), sizeof(uint32_t));
            grafo.adj_list[i].resize(num_aristas);

            for (uint32_t j = 0; j < num_aristas; ++j) {
                uint32_t dest = 0;
                float peso = 0.0f;
                file.read(reinterpret_cast<char*>(&dest), sizeof(uint32_t));
                file.read(reinterpret_cast<char*>(&peso), sizeof(float));

                uint16_t len_calle = 0;
                file.read(reinterpret_cast<char*>(&len_calle), sizeof(uint16_t));
                std::string calle(len_calle, '\0');
                if (len_calle > 0) {
                    file.read(&calle[0], len_calle);
                }

                uint16_t len_tipo = 0;
                file.read(reinterpret_cast<char*>(&len_tipo), sizeof(uint16_t));
                std::string tipo_via(len_tipo, '\0');
                if (len_tipo > 0) {
                    file.read(&tipo_via[0], len_tipo);
                }

                grafo.adj_list[i][j] = {static_cast<int>(dest), peso, calle, tipo_via};
            }
        }

        return true;
    }

    // Guarda binario para exportador
    static bool guardar_binario(const std::string& path, const Grafo& grafo) {
        std::ofstream file(path, std::ios::binary);
        if (!file.is_open()) return false;

        const char magic[4] = {'R', 'C', 'O', '1'};
        file.write(magic, 4);

        uint32_t num_nodos = static_cast<uint32_t>(grafo.num_nodos());
        file.write(reinterpret_cast<const char*>(&num_nodos), sizeof(uint32_t));

        for (uint32_t i = 0; i < num_nodos; ++i) {
            file.write(reinterpret_cast<const char*>(&grafo.osm_ids[i]), sizeof(int64_t));
            file.write(reinterpret_cast<const char*>(&grafo.coords[i].lat), sizeof(double));
            file.write(reinterpret_cast<const char*>(&grafo.coords[i].lon), sizeof(double));
        }

        for (uint32_t i = 0; i < num_nodos; ++i) {
            uint32_t num_aristas = static_cast<uint32_t>(grafo.adj_list[i].size());
            file.write(reinterpret_cast<const char*>(&num_aristas), sizeof(uint32_t));

            for (const auto& arista : grafo.adj_list[i]) {
                uint32_t dest = static_cast<uint32_t>(arista.destino);
                file.write(reinterpret_cast<const char*>(&dest), sizeof(uint32_t));
                file.write(reinterpret_cast<const char*>(&arista.peso), sizeof(float));

                uint16_t len_calle = static_cast<uint16_t>(arista.calle.size());
                file.write(reinterpret_cast<const char*>(&len_calle), sizeof(uint16_t));
                if (len_calle > 0) {
                    file.write(arista.calle.data(), len_calle);
                }

                uint16_t len_tipo = static_cast<uint16_t>(arista.tipo_via.size());
                file.write(reinterpret_cast<const char*>(&len_tipo), sizeof(uint16_t));
                if (len_tipo > 0) {
                    file.write(arista.tipo_via.data(), len_tipo);
                }
            }
        }

        return true;
    }

    // Carga desde JSON
    static bool cargar_json(const std::string& path, Grafo& grafo) {
        std::ifstream file(path);
        if (!file.is_open()) return false;

        try {
            json data = json::parse(file);

            if (data.contains("coords") && data.contains("adj_list")) {
                // Formato con diccionario de coordenadas
                const auto& coords_obj = data["coords"];
                grafo.coords.clear();
                grafo.osm_ids.clear();
                grafo.osm_to_idx.clear();

                int idx = 0;
                for (auto it = coords_obj.begin(); it != coords_obj.end(); ++it) {
                    int64_t osm_id = std::stoll(it.key());
                    double lat = it.value()[0].get<double>();
                    double lon = it.value()[1].get<double>();

                    grafo.osm_ids.push_back(osm_id);
                    grafo.coords.push_back({lat, lon});
                    grafo.osm_to_idx[osm_id] = idx++;
                }

                grafo.adj_list.resize(grafo.coords.size());
                const auto& adj_obj = data["adj_list"];

                for (auto it = adj_obj.begin(); it != adj_obj.end(); ++it) {
                    int64_t u_osm = std::stoll(it.key());
                    if (grafo.osm_to_idx.find(u_osm) == grafo.osm_to_idx.end()) continue;
                    int u_idx = grafo.osm_to_idx[u_osm];

                    for (const auto& item : it.value()) {
                        int64_t v_osm = 0;
                        float peso = 1.0f;
                        std::string calle = "desconocida";
                        std::string tipo = "road";

                        if (item.is_array()) {
                            if (item[0].is_string()) {
                                v_osm = std::stoll(item[0].get<std::string>());
                            } else {
                                v_osm = item[0].get<int64_t>();
                            }
                            peso = item[1].get<float>();
                            if (item.size() > 2 && item[2].is_string()) calle = item[2].get<std::string>();
                            if (item.size() > 3 && item[3].is_string()) tipo = item[3].get<std::string>();
                        }

                        if (grafo.osm_to_idx.find(v_osm) != grafo.osm_to_idx.end()) {
                            int v_idx = grafo.osm_to_idx[v_osm];
                            grafo.adj_list[u_idx].push_back({v_idx, peso, calle, tipo});
                        }
                    }
                }
                return true;
            }
        } catch (...) {
            return false;
        }

        return false;
    }

    // Método universal de carga
    static bool cargar(const std::string& path, Grafo& grafo) {
        if (cargar_binario(path, grafo)) return true;
        if (cargar_json(path, grafo)) return true;

        // Intentar cambiar extensión a .bin si se pasó .pkl o .graphml
        std::string path_alt = path;
        size_t dot_pos = path_alt.rfind('.');
        if (dot_pos != std::string::npos) {
            path_alt = path_alt.substr(0, dot_pos) + ".bin";
            if (cargar_binario(path_alt, grafo)) return true;
        }

        return false;
    }
};

} // namespace rutacraft
