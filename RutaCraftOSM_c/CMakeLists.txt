cmake_minimum_required(VERSION 3.16)
project(RutaCraftOSM LANGUAGES CXX)

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

if(MSVC)
    target_compile_options(cli PRIVATE /O2 /W3 /utf-8)
    set_property(TARGET cli PROPERTY MSVC_RUNTIME_LIBRARY "MultiThreaded")
else()
    target_compile_options(cli PRIVATE -O3 -Wall)
    # Binario estático: cli.exe no depende de las DLL de MinGW al distribuirse con Electron
    if(MINGW)
        target_link_options(cli PRIVATE -static)
    endif()
endif()
