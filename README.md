# ⚙️ Discord Party Hub (Backend)

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-000000?style=for-the-badge&logo=express&logoColor=white)
![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-4EA94B?style=for-the-badge&logo=mongodb&logoColor=white)

El motor de juego en tiempo real y API principal para **Discord Party Hub**. 

## ✨ Características Principales

*   **Motor de UNO Altamente Escalable:** Lógica de juego fragmentada usando el Patrón Facade (`UnoActions` delegando a `DrawLogic`, `PlayLogic`, `SpecialLogic`).
*   **Enrutamiento de Sockets Limpio:** Orquestador principal (`GameDispatcher`) que delega los flujos de red a enrutadores específicos (`UnoSocketRouter`).
*   **Gestión Autónoma de Memoria:** Recolector de basura nativo (`RoomGarbageCollector`) que barre y limpia automáticamente salas inactivas o vacías para prevenir fugas de memoria (Memory Leaks).
*   **Zero-Trust Security:** Todos los payloads que viajan a través de WebSockets y HTTP están estrictamente validados usando `Zod`.
*   **Robots de Testing:** Conjunto de scripts en `/test-*.ts` para realizar pruebas de estrés, escenarios de desconexión masiva y simulaciones automáticas de partidas de UNO enteras.

## 🛠️ Tecnologías

*   **Runtime:** Node.js (Ejecutado con Bun)
*   **Framework HTTP:** Express
*   **WebSockets:** Socket.io
*   **Validación:** Zod
*   **Base de Datos:** MongoDB (Mongoose)

## 🚀 Instalación y Uso

**Importante:** Este proyecto utiliza **Bun** como gestor de paquetes y entorno de ejecución.

```bash
# Instalar dependencias
bun install

# Iniciar servidor de desarrollo (Hot Reload)
bun run dev

# Compilar para producción (TypeScript)
bun run build
```

El servidor estará escuchando en el puerto `3001` (por defecto). Asegúrate de tener configuradas tus variables de entorno `.env` (MongoDB URI, puertos, etc.).

## 📂 Arquitectura (Clean Code)

*   `src/core`: Controladores de infraestructura (Manager de Salas, Despachador de Sockets, Garbage Collector).
*   `src/games/[juego]`: Motores de estado agnósticos a la red. (Ej. `UnoEngine.ts`, `UnoRulesManager.ts`).
*   `src/models`: Esquemas de base de datos de MongoDB.
*   `src/routes`: API REST convencional (Autenticación, Rankings).
*   `src/server.ts`: Punto de entrada, middlewares y bind de HTTP + WS.

---
*Hecho por la tripulación del Sombrero de Paja 🏴‍☠️*
