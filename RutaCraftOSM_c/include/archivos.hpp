#pragma once
// Rutas de archivo en UTF-8 en todas las plataformas.
//
// En Windows, argv llega en la página de códigos ANSI y std::filesystem no puede convertir
// caracteres como "é" o "ñ" (por ejemplo C:\Users\José\...), lo que hacía fallar al motor.
// Aquí todas las rutas se manejan como std::string en UTF-8 y se convierten a fs::path solo
// al tocar el sistema de archivos.
#include <filesystem>
#include <string>
#include <system_error>
#include <vector>

#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX  // windows.h define min/max como macros y rompe std::min, std::max y numeric_limits
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <shellapi.h>
#elif defined(__APPLE__)
#include <cstdint>
#include <cstring>
#include <mach-o/dyld.h>
#endif

namespace rutacraft {

namespace fs = std::filesystem;

inline fs::path ruta_utf8(const std::string& s) {
    return fs::path(std::u8string(reinterpret_cast<const char8_t*>(s.data()), s.size()));
}

inline std::string a_utf8(const fs::path& p) {
    const std::u8string u = p.u8string();
    return std::string(reinterpret_cast<const char*>(u.data()), u.size());
}

// fs::exists sin excepciones (una ruta inválida o sin permisos cuenta como inexistente)
inline bool existe(const fs::path& p) {
    std::error_code ec;
    return fs::exists(p, ec);
}

#ifdef _WIN32
inline std::string utf16_a_utf8(const wchar_t* w) {
    const int largo = WideCharToMultiByte(CP_UTF8, 0, w, -1, nullptr, 0, nullptr, nullptr);
    if (largo <= 1) return {};
    std::string s(static_cast<size_t>(largo - 1), '\0');
    WideCharToMultiByte(CP_UTF8, 0, w, -1, s.data(), largo, nullptr, nullptr);
    return s;
}
#endif

// Argumentos de la línea de comandos en UTF-8 (sin el nombre del programa)
inline std::vector<std::string> argumentos_utf8(int argc, char* argv[]) {
    std::vector<std::string> args;
#ifdef _WIN32
    (void)argc;
    (void)argv;
    int n = 0;
    if (LPWSTR* wargv = CommandLineToArgvW(GetCommandLineW(), &n)) {
        for (int i = 1; i < n; ++i) args.push_back(utf16_a_utf8(wargv[i]));
        LocalFree(wargv);
    }
#else
    for (int i = 1; i < argc; ++i) args.emplace_back(argv[i]);
#endif
    return args;
}

inline fs::path ruta_ejecutable() {
#ifdef _WIN32
    std::wstring buffer(MAX_PATH, L'\0');
    for (;;) {
        const DWORD n = GetModuleFileNameW(nullptr, buffer.data(), static_cast<DWORD>(buffer.size()));
        if (n == 0) return {};
        if (n < buffer.size()) {
            buffer.resize(n);
            return fs::path(buffer);
        }
        buffer.resize(buffer.size() * 2);  // Rutas más largas que MAX_PATH
    }
#elif defined(__APPLE__)
    uint32_t tamano = 0;
    _NSGetExecutablePath(nullptr, &tamano);  // Devuelve el tamaño necesario
    std::string buffer(tamano, '\0');
    if (_NSGetExecutablePath(buffer.data(), &tamano) != 0) return {};
    buffer.resize(std::strlen(buffer.c_str()));
    std::error_code ec;
    fs::path canonica = fs::weakly_canonical(fs::path(buffer), ec);  // Resuelve enlaces simbólicos
    return ec ? fs::path(buffer) : canonica;
#else
    std::error_code ec;
    fs::path exe = fs::read_symlink("/proc/self/exe", ec);
    return ec ? fs::path() : exe;
#endif
}

} // namespace rutacraft
