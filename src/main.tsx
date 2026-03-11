
// Punto de entrada: carga estilos globales y monta el componente raíz en #root.
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import "./styles/index.css";

// Renderiza la aplicación dentro del contenedor principal del HTML.
createRoot(document.getElementById("root")!).render(<App />);
  
