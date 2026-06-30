import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { GameService } from './game.service';

@WebSocketGateway({
  cors: {
    origin: 'http://localhost:5173',
  },
})
export class GameGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  constructor(private readonly gameService: GameService) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  async handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    await this.gameService.handleDisconnect(this.server, client);
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(@ConnectedSocket() socket: Socket) {
    await this.gameService.joinRoom(this.server, socket);
  }

  @SubscribeMessage('move')
  async handleMove(
    @ConnectedSocket() socket: Socket,
    @MessageBody() key: string,
  ) {
    await this.gameService.handleMove(this.server, socket, key);
  }
}
