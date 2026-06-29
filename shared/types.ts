export type SocketId = string;
export type RoomId = string;
export type Role = 'hider' | 'seeker';

export interface Position {
  x: number;
  y: number;
}

export interface PlayerInfo {
  roomId: string;
  role: Role;
  position?: Position;
}

export enum GameStatus {
  WAITING = 'waiting',
  RUNNING = 'running',
  FINISHED = 'finished',
}

export type TimeRemaining = number;
