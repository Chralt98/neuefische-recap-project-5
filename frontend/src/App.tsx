import { useEffect } from "react";
import "./App.css";
import { socket } from "./socket";

const SECRET_ROOM_ID = "super-secret-room-id";

function App() {
  useEffect(() => {
    socket.connect();

    socket.emit("joinRoom", SECRET_ROOM_ID);

    const onError = (error: string) => {
      console.error(`Received error: ${error}`);
    };
    socket.on("error", onError);

    const onWaiting = (message: string) => {
      console.log(`Received waiting message: ${message}`);
    };
    socket.on("waiting", onWaiting);

    const onRoleAssigned = (role: string) => {
      console.log(`Received role assigned: ${role}`);
    };
    socket.on("roleAssigned", onRoleAssigned);

    const onGameStarted = (message: string) => {
      console.log(`Received game started message: ${message}`);
    };
    socket.on("gameStarted", onGameStarted);

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
