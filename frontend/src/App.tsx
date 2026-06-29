import { useEffect } from "react";
import "./App.css";
import { socket } from "./socket";

const SECRET_ROOM_ID = "super-secret-room-id";

function App() {
  useEffect(() => {
    socket.connect();

    socket.emit("joinRoom", SECRET_ROOM_ID);

    const onRoomJoinedResponse = (data: string) => {
      console.log(`Received response: ${data}`);
    };
    socket.on("roomJoined", onRoomJoinedResponse);

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
