# Referencia: Eventos Socket.io

Este documento sirve como diccionario de los principales eventos WebSocket emitidos y escuchados por el servidor.

## Eventos Recibidos por el Servidor (Client -> Server)

| Evento | Descripción | Payload |
| :--- | :--- | :--- |
| `join_room` | Un usuario solicita unirse a una sala específica. | `{ roomId, userId, nickname, avatarId, color, totalWins }` |
| `start_game` | El host de la sala inicia la partida. | `{ gameType: 'uno' \| 'parchis' \| 'stop' \| 'impostor', rules: Object }` |
| `update_room_rules` | El host actualiza las reglas de la sala en el lobby. | `Object` (Depende del juego seleccionado) |
| `return_to_lobby` | El host finaliza la partida y devuelve a todos al Lobby. | `null` |
| `update_profile` | El jugador actualiza su aspecto (Avatar/Color) en vivo. | `{ nickname, avatarId, color }` |

## Eventos Emitidos por el Servidor (Server -> Client)

| Evento | Descripción | Payload |
| :--- | :--- | :--- |
| `room_update` | Estado del Lobby y lista de jugadores actualizados. | `{ users, hostUserId, roomRules, selectedGame }` |
| `game_started` | Notifica que el estado de la sala ha transicionado a juego. | `{ gameType }` |
| `game_state_update` | Estado íntegro de la partida en curso. Puede ser un estado público (para todos) o privado (ej. tus cartas del UNO). | `Object` (Definido por el Engine del juego) |
| `game_action` | Animaciones o acciones físicas (ej. alguien robó una carta). Usado para transiciones UI. | `{ action: string, userId: string, ...payload }` |
| `game_message` | Alertas de texto globales (ej. "¡Fulanito cantó UNO!"). | `{ message: string }` |
| `player_won` | Alerta global de finalización de juego con un claro ganador. | `string` (El `userId` del ganador) |
