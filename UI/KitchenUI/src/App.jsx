import { Navigate, Route, Routes } from "react-router-dom";
import KitchenDashboardPage from "./pages/KitchenDashboardPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/kitchen" replace />} />
      <Route path="/kitchen" element={<KitchenDashboardPage />} />
    </Routes>
  );
}
