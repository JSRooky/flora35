import { useState } from "react";
import MapView from "./components/MapView";
import { checkServer } from "./api/status";

export default function App() {
  const [status, setStatus] = useState(null);

  async function testConnection() {
    const data = await checkServer();
    setStatus(JSON.stringify(data));
  }

  return (
    <>
      <button onClick={testConnection}>Проверить сервер</button>
      <div>{status}</div>
      <MapView />
    </>
  );
}
