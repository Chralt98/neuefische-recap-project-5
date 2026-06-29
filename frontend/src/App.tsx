import { useEffect } from "react";
import type { PlayerInfo, SocketId } from "../../shared/types";
import "./App.css";
import { socket } from "./socket";

function App() {
  useEffect(() => {
    socket.connect();

    socket.emit("joinRoom");

    const onError = (error: string) => {
      console.error(`Received error: ${error}`);
    };
    socket.on("error", onError);

    const onWaiting = (data: string) => {
      console.log(`Received waiting message: ${data}`);
    };
    socket.on("waiting", onWaiting);

    const onRoomJoined = (data: string) => {
      console.log(`Received room joined message: ${data}`);
    };
    socket.on("roomJoined", onRoomJoined);

    const onRoleAssigned = (data: string) => {
      console.log(`Received role assigned: ${data}`);
    };
    socket.on("roleAssigned", onRoleAssigned);

    const onGameStarted = (data: {
      playerInfo: Record<SocketId, PlayerInfo>;
      status: string;
      timeRemaining: number;
    }) => {
      console.log(`Game started! Player info:`, data.playerInfo);
      console.log(`Game status: ${data.status}`);
      console.log(`Time remaining: ${data.timeRemaining} seconds`);
    };
    socket.on("gameStarted", onGameStarted);

    const onTimeUpdate = (data: { timeRemaining: number }) => {
      console.log(`Time remaining: ${data.timeRemaining} seconds`);
    };
    socket.on("timeUpdate", onTimeUpdate);

    const onGameOver = (data: { winner: string }) => {
      console.log(`Game over! Winner: ${data.winner}`);
    };
    socket.on("gameOver", onGameOver);

    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <div>
      <h1>Hide and Seek</h1>
    </div>
  );
}

export default App;
