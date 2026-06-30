import { useEffect, useState } from "react";
import type { GameState } from "../../shared/types";
import "./App.css";
import { socket } from "./socket";

const GRID_SIZE = 10;

function App() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [status, setStatus] = useState<string>("Connecting...");

  useEffect(() => {
    const onConnect = () => {
      socket.emit("joinRoom");
    };
    socket.on("connect", onConnect);

    socket.connect();

    const onError = (error: string) => {
      console.error(`Received error: ${error}`);
      setStatus(`Error: ${error}`);
    };
    socket.on("error", onError);

    const onWaiting = (data: string) => {
      console.log(`Received waiting message: ${data}`);
      setStatus("Waiting for another player...");
    };
    socket.on("waiting", onWaiting);

    const onRoomJoined = (data: string) => {
      console.log(`Received room joined message: ${data}`);
    };
    socket.on("roomJoined", onRoomJoined);

    const onRoleAssigned = (data: string) => {
      console.log(`Received role assigned: ${data}`);
      setStatus(`You are the ${data}!`);
    };
    socket.on("roleAssigned", onRoleAssigned);

    const onGameStateUpdate = (data: GameState) => {
      console.log(`Game state update:`, data);
      setGameState(data);
    };
    socket.on("gameStateUpdate", onGameStateUpdate);

    const onTimeUpdate = (data: { timeRemaining: number }) => {
      setTimeRemaining(data.timeRemaining);
    };
    socket.on("timeUpdate", onTimeUpdate);

    return () => {
      socket.off("connect", onConnect);
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.key)
      ) {
        event.preventDefault();
        socket.emit("move", event.key);
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const players = gameState?.playerInfo
    ? Object.values(gameState.playerInfo)
    : [];

  const getCell = (x: number, y: number) => {
    const hider = players.some(
      (p) => p.role === "hider" && p.position?.x === x && p.position?.y === y,
    );
    const seeker = players.some(
      (p) => p.role === "seeker" && p.position?.x === x && p.position?.y === y,
    );
    if (hider && seeker) return "HS";
    if (hider) return "H";
    if (seeker) return "S";
    return "";
  };

  return (
    <div>
      <h1>Hide and Seek</h1>
      <p>{status}</p>
      {timeRemaining !== null && (
        <p>
          Time remaining: <strong>{timeRemaining}s</strong>
        </p>
      )}
      {gameState?.winner && (
        <p>
          Winner: <strong>{gameState.winner}</strong>
        </p>
      )}
      <table style={{ borderCollapse: "collapse", margin: "0 auto" }}>
        <tbody>
          {Array.from({ length: GRID_SIZE }, (_, y) => (
            <tr key={y}>
              {Array.from({ length: GRID_SIZE }, (_, x) => (
                <td
                  key={x}
                  style={{
                    width: 40,
                    height: 40,
                    border: "1px solid #ccc",
                    textAlign: "center",
                    background: getCell(x, y).includes("H")
                      ? "#4caf50"
                      : getCell(x, y).includes("S")
                        ? "#f44336"
                        : undefined,
                  }}
                >
                  {getCell(x, y)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
