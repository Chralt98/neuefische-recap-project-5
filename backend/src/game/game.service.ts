import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

export type SocketId = string;
export type Role = 'hider' | 'seeker';
export interface ClientInfo {
  roomId: string;
  role: Role;
}

@Injectable()
export class GameService {
  private waitingRoomId: string | null = null;
  private clientInfo: Record<SocketId, ClientInfo> = {};

  async joinRoom(server: Server, socket: Socket): Promise<void> {
    const generateRoomId = () =>
      `room-${Math.random().toString(36).substring(2, 8)}`;

    const waiting = this.waitingRoomId;
    const hasWaitingPlayer =
      waiting && (await server.in(waiting).fetchSockets()).length === 1;

    const roomId = hasWaitingPlayer ? waiting : generateRoomId();

    const socketsInRoom = await server.in(roomId).fetchSockets();

    if (socketsInRoom.some((s) => s.id === socket.id)) {
      socket.emit('error', `You are already in room "${roomId}".`);
      return;
    }

    if (socketsInRoom.length >= 2) {
      socket.emit('error', `Room "${roomId}" is full.`);
      return;
    }

    await socket.join(roomId);

    if (socketsInRoom.length === 0) {
      this.waitingRoomId = roomId;
      socket.emit(
        'waiting',
        `Waiting for another player to join room "${roomId}".`,
      );
      return;
    }

    // Second player joined — assign roles and start
    this.waitingRoomId = null;
    const hider = socketsInRoom[0];
    this.clientInfo[hider.id] = { roomId, role: 'hider' };
    this.clientInfo[socket.id] = { roomId, role: 'seeker' };

    server.to(hider.id).emit('roleAssigned', 'hider');
    socket.emit('roleAssigned', 'seeker');

    server.to(roomId).emit('gameStarted', 'The game has started!');
  }
}
