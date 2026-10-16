cmake_minimum_required(VERSION 3.16)

# macOS: macOS 11 o superior (std::filesystem requiere 10.15). Debe definirse antes de project().
set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0" CACHE STRING "Versión mínima de macOS")

project(RutaCraftOSM LANGUAGES CXX)

# Binario estático en Windows (MinGW) y Linux: el ejecutable no depende de las DLL de MinGW ni de
# la versión de glibc de la máquina donde se instala la app. macOS no admite binarios estáticos.
option(RUTACRAFT_ESTATICO "Enlazar el motor de forma estática (MinGW y Linux)" ON)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release)
endif()

add_executable(cli src/main.cpp)
target_include_directories(cli PRIVATE include)

# El binario queda en bin/ (igual que build.bat), también con generadores multi-config (Visual Studio)
set_target_properties(cli PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/bin)
foreach(config ${CMAKE_CONFIGURATION_TYPES})
    string(TOUPPER ${config} config_upper)
    set_target_properties(cli PROPERTIES RUNTIME_OUTPUT_DIRECTORY_${config_upper} ${CMAKE_CURRENT_SOURCE_DIR}/bin)
endforeach()

# Benchmark por fases (no se distribuye): cmake --build build --target benchmark
add_executable(benchmark EXCLUDE_FROM_ALL bench/benchmark.cpp)
target_include_directories(benchmark PRIVATE include)
set_target_properties(benchmark PROPERTIES RUNTIME_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/bin)
if(WIN32)
    # shell32: CommandLineToArgvW (argumentos Unicode); psapi: memoria del proceso en el benchmark
    target_link_libraries(cli PRIVATE shell32)
    target_link_libraries(benchmark PRIVATE shell32 psapi)
endif()

foreach(target cli benchmark)
    if(MSVC)
        target_compile_options(${target} PRIVATE /O2 /W3 /utf-8)
        set_property(TARGET ${target} PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded")
    else()
        target_compile_options(${target} PRIVATE -O3 -Wall)
        if(RUTACRAFT_ESTATICO AND (MINGW OR CMAKE_SYSTEM_NAME STREQUAL "Linux"))
            target_link_options(${target} PRIVATE -static)
        endif()
    endif()
endforeach()
