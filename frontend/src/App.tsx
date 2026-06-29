import { useEffect } from "react";
import "./App.css";
import { socket } from "./socket";

function App() {
  useEffect(() => {
    socket.connect();

    socket.emit("test", "Hello from the client!");

    const onTestResponse = (data: string) => {
      console.log(`Received test response: ${data}`);
    };
    socket.on("testResponse", onTestResponse);

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
