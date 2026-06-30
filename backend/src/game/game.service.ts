import { Injectable } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import {
  GameStatus,
  type GameState,
  type PlayerInfo,
  type Position,
  type Role,
  type RoomId,
  type SocketId,
  type TimeRemaining,
} from '../../../shared/types.js';

@Injectable()
export class GameService {
  private waitingRoomId: RoomId | null = null;
  private timeRemaining: Record<RoomId, TimeRemaining> = {};
  private playerInfo: Record<SocketId, PlayerInfo> = {};
  private status: Record<RoomId, GameStatus> = {};
  private timers: Record<RoomId, ReturnType<typeof setInterval>> = {};

  removePlayer(socketId: SocketId): void {
    delete this.playerInfo[socketId];
  }

  setStartingPosition(socketId: SocketId): void {
    const player = this.playerInfo[socketId];
    if (player && player.role === 'hider') {
      player.position = { x: 0, y: 0 }; // Hider starts at top-left corner
    }
    if (player && player.role === 'seeker') {
      player.position = { x: 9, y: 9 }; // Seeker starts at bottom-right corner
    }
  }

  validMove(newPosition: Position): boolean {
    // Check if the new position is within the grid boundaries (0-9 for a 10x10 grid)
    if (
      newPosition.x < 0 ||
      newPosition.x > 9 ||
      newPosition.y < 0 ||
      newPosition.y > 9
    ) {
      return false; // Out of bounds
    }

    return true; // Valid move
  }

  private getGameState(roomId: RoomId): GameState {
    return {
      playerInfo: this.playerInfo,
      status: this.status[roomId],
    };
  }

  private emitGameState(server: Server, roomId: RoomId): void {
    server.to(roomId).emit('gameStateUpdate', this.getGameState(roomId));
  }

  startGame(
    server: Server,
    roomId: RoomId,
    hider: SocketId,
    seeker: SocketId,
  ): void {
    this.status[roomId] = GameStatus.RUNNING;
    this.setStartingPosition(hider);
    this.setStartingPosition(seeker);
    this.timeRemaining[roomId] = 60;
    this.emitGameState(server, roomId);

    this.timers[roomId] = setInterval(() => {
      this.timeRemaining[roomId]--;

      server
        .to(roomId)
        .emit('timeUpdate', { timeRemaining: this.timeRemaining[roomId] });

      if (this.timeRemaining[roomId] <= 0) {
        this.endGame(server, roomId, 'hider');
      }
    }, 1000);
  }

  endGame(server: Server, roomId: RoomId, winner: Role): void {
    clearInterval(this.timers[roomId]);
    delete this.timers[roomId];
    this.status[roomId] = GameStatus.FINISHED;
    server.to(roomId).emit('gameStateUpdate', {
      ...this.getGameState(roomId),
      winner,
    });
  }

  async joinRoom(server: Server, socket: Socket): Promise<void> {
    if (this.playerInfo[socket.id]) {
      socket.emit('error', 'You are already in a room.');
      return;
    }

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
    socket.emit('roomJoined', `You joined room "${roomId}".`);

    if (socketsInRoom.length === 0) {
      this.waitingRoomId = roomId;
      this.status[roomId] = GameStatus.WAITING;
      socket.emit(
        'waiting',
        `Waiting for another player to join room "${roomId}".`,
      );
      return;
    }

    // Second player joined — assign roles and start
    this.waitingRoomId = null;
    const hider = socketsInRoom[0];
    this.playerInfo[hider.id] = { roomId, role: 'hider' };
    this.playerInfo[socket.id] = { roomId, role: 'seeker' };

    server.to(hider.id).emit('roleAssigned', 'hider');
    socket.emit('roleAssigned', 'seeker');

    this.startGame(server, roomId, hider.id, socket.id);
  }

  handleMove(server: Server, socket: Socket, key: string): void {
    const player = this.playerInfo[socket.id];
    if (!player) {
      socket.emit('error', 'You are not in a game.');
      return;
    }
    if (!player.position) {
      socket.emit('error', 'Player position is not set.');
      return;
    }
    const roomId = player.roomId;
    const gameStatus = this.status[roomId];
    if (gameStatus !== GameStatus.RUNNING) {
      socket.emit('error', 'Game is not running.');
      return;
    }
    if (
      key !== 'ArrowUp' &&
      key !== 'ArrowDown' &&
      key !== 'ArrowLeft' &&
      key !== 'ArrowRight'
    ) {
      socket.emit('error', 'Invalid move key.');
      return;
    }
    const oldPosition = { ...player.position };
    if (key === 'ArrowUp') player.position.y--;
    if (key === 'ArrowDown') player.position.y++;
    if (key === 'ArrowLeft') player.position.x--;
    if (key === 'ArrowRight') player.position.x++;
    player.position = this.validMove(player.position)
      ? player.position
      : oldPosition;
    this.playerInfo[socket.id] = player;
    this.emitGameState(server, roomId);
  }
}
