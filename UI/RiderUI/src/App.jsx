import { Navigate, Route, Routes } from "react-router-dom";
import AvailableOrdersPage from "./pages/AvailableOrdersPage";
import RiderOrderDetailsPage from "./pages/RiderOrderDetailsPage";
import PickupPage from "./pages/PickupPage";
import DeliveryPage from "./pages/DeliveryPage";
import CompletedPage from "./pages/CompletedPage";
import RiderAuthPage from "./pages/RiderAuthPage";
import RequireRiderAuth from "./components/rider/RequireRiderAuth";

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to="/rider/login" replace />}
      />
      <Route path="/rider/login" element={<RiderAuthPage />} />
      <Route path="/rider/available-orders" element={<RequireRiderAuth><AvailableOrdersPage /></RequireRiderAuth>} />
      <Route path="/rider/order/:id" element={<RequireRiderAuth><RiderOrderDetailsPage /></RequireRiderAuth>} />
      <Route path="/rider/pickup/:id" element={<RequireRiderAuth><PickupPage /></RequireRiderAuth>} />
      <Route path="/rider/delivery/:id" element={<RequireRiderAuth><DeliveryPage /></RequireRiderAuth>} />
      <Route path="/rider/completed/:id" element={<RequireRiderAuth><CompletedPage /></RequireRiderAuth>} />
    </Routes>
  );
}
