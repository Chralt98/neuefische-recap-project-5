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

const WALL_LAYOUT: Position[] = [
  { x: 3, y: 1 },
  { x: 3, y: 2 },
  { x: 3, y: 3 },
  { x: 3, y: 7 },
  { x: 3, y: 8 },
  { x: 6, y: 1 },
  { x: 6, y: 2 },
  { x: 6, y: 6 },
  { x: 6, y: 7 },
  { x: 6, y: 8 },
  { x: 1, y: 5 },
  { x: 2, y: 5 },
  { x: 7, y: 4 },
  { x: 8, y: 4 },
];

@Injectable()
export class GameService {
  private waitingRoomId: RoomId | null = null;
  private timeRemaining: Record<RoomId, TimeRemaining> = {};
  private playerInfo: Record<SocketId, PlayerInfo> = {};
  private status: Record<RoomId, GameStatus> = {};
  private timers: Record<RoomId, ReturnType<typeof setInterval>> = {};
  private walls: Record<RoomId, Position[]> = {};

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

  validMove(roomId: RoomId, newPosition: Position): boolean {
    // Check if the new position is within the grid boundaries (0-9 for a 10x10 grid)
    if (
      newPosition.x < 0 ||
      newPosition.x > 9 ||
      newPosition.y < 0 ||
      newPosition.y > 9
    ) {
      return false; // Out of bounds
    }

    if (
      (this.walls[roomId] ?? []).some((wall) =>
        this.isCollision(wall, newPosition),
      )
    ) {
      return false; // Blocked by a wall
    }

    return true; // Valid move
  }

  isCollision(pos1: Position, pos2: Position): boolean {
    return pos1.x === pos2.x && pos1.y === pos2.y;
  }

  private getGameState(roomId: RoomId): GameState {
    const playerInfo = Object.fromEntries(
      Object.entries(this.playerInfo).filter(
        ([, player]) => player.roomId === roomId,
      ),
    );
    return {
      playerInfo,
      status: this.status[roomId],
      walls: this.walls[roomId] ?? [],
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
    this.walls[roomId] = [...WALL_LAYOUT];
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
    for (const [socketId, player] of Object.entries(this.playerInfo)) {
      if (player.roomId === roomId) {
        this.removePlayer(socketId);
      }
    }
    server.in(roomId).socketsLeave(roomId);
    delete this.status[roomId];
    delete this.timeRemaining[roomId];
    delete this.walls[roomId];
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

  async handleMove(server: Server, socket: Socket, key: string): Promise<void> {
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
    const newPosition = { ...player.position };
    if (key === 'ArrowUp') newPosition.y--;
    if (key === 'ArrowDown') newPosition.y++;
    if (key === 'ArrowLeft') newPosition.x--;
    if (key === 'ArrowRight') newPosition.x++;
    if (!this.validMove(roomId, newPosition)) {
      return;
    }
    player.position = newPosition;
    this.playerInfo[socket.id] = player;
    this.emitGameState(server, roomId);
    // Check for collision after the move
    const socketsInRoom = await server.in(roomId).fetchSockets();
    const hider = socketsInRoom[0];
    const seeker = socketsInRoom[1];
    if (
      this.isCollision(
        this.playerInfo[hider.id].position!,
        this.playerInfo[seeker.id].position!,
      )
    ) {
      this.endGame(server, roomId, 'seeker');
    }
  }

  async handleDisconnect(server: Server, socket: Socket): Promise<void> {
    const player = this.playerInfo[socket.id];
    if (!player) {
      const roomId = this.waitingRoomId;
      if (roomId && (await server.in(roomId).fetchSockets()).length === 0) {
        this.waitingRoomId = null;
        delete this.status[roomId];
      }
      return;
    }
    const roomId = player.roomId;
    server.to(roomId).emit('error', `Player ${socket.id} has left the game.`);
    this.endGame(server, roomId, player.role === 'hider' ? 'seeker' : 'hider');
    this.removePlayer(socket.id);
  }
}
