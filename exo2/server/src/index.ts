import { WebSocketServer, WebSocket } from 'ws';
import type { ServerMessage, ClientMessage } from '@shared/types';

const server = new WebSocketServer({ port: 8686 });

const nicks = new Map<WebSocket, string>();
const rooms = new Map<string, Set<WebSocket>>();

function broadcast(msg: ServerMessage) {
    for (const client of server.clients) {
        client.send(JSON.stringify(msg));
    }
}

function broadcastUserList() {
    const users = Array.from(nicks.values());
    broadcast({ type: 'user-list', users });
}
function joinRoom(socket: WebSocket, roomId: string) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, new Set());
    }
    const r = rooms.get(roomId)!;
    if (r.has(socket)) {
        return;
    }
    r.add(socket);
}

function leaveRoom(socket: WebSocket, roomId: string) {
    const r = rooms.get(roomId)!;
    r.delete(socket);
    if (rooms.get(roomId)!.size === 0) {
        rooms.delete(roomId);
    }
}

server.on('connection', (socket: WebSocket, ) => {
    const defaultNick = 'anon_' + Math.random().toString(36).slice(2, 6);
    nicks.set(socket, defaultNick);

    broadcast({ type: 'system', text: `${defaultNick} joined` });
    broadcastUserList();

    socket.on('message', (data) => {
        const msg: ClientMessage = JSON.parse(data.toString());

        switch (msg.type) {
            case 'set-nick': {
                const oldNick = nicks.get(socket)!;
                nicks.set(socket, msg.nick);
                broadcast({ type: 'system', text: `${oldNick} is now ${msg.nick}` });
                broadcastUserList();
                break;
            }
            case 'chat': {
                const nick = nicks.get(socket)!;
                broadcast({ type: 'chat', nick, text: msg.text, ts: Date.now() });
                break;
            }
            case 'typing': {
                const nick = nicks.get(socket)!;
                broadcast({ type: 'typing', nick });
                break;
            }
            case 'join-room': {
                if (rooms.get(msg.roomID)?.has(socket)) {
                    broadcast({ type: 'system', text: `${nicks.get(socket)} is already in room ${msg.roomID}` });
                    break;
                }
                joinRoom(socket, msg.roomID);
                broadcast({ type: 'system', text: `${nicks.get(socket)} joined room ${msg.roomID}` });
                break;
            }
            case 'leave-room': {
                if (!rooms.get(msg.roomID)?.has(socket)) {
                    broadcast({ type: 'system', text: `${nicks.get(socket)} is not in room ${msg.roomID}` });
                    break;
                }
                leaveRoom(socket, msg.roomID);
                broadcast({ type: 'system', text: `${nicks.get(socket)} left room ${msg.roomID}` });
                break;
            }
        }
    });

    socket.on('close', () => {
        const nick = nicks.get(socket)!;
        nicks.delete(socket);
        broadcast({ type: 'system', text: `${nick} left` });
        broadcastUserList();
    });
});

console.log('Server ready on ws://localhost:8686');
