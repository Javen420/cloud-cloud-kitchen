import { Navigate, Route, Routes } from "react-router-dom";
import AvailableOrdersPage from "./pages/AvailableOrdersPage";
import RiderOrderDetailsPage from "./pages/RiderOrderDetailsPage";
import PickupPage from "./pages/PickupPage";
import DeliveryPage from "./pages/DeliveryPage";
import CompletedPage from "./pages/CompletedPage";

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={<Navigate to="/rider/available-orders" replace />}
      />
      <Route path="/rider/available-orders" element={<AvailableOrdersPage />} />
      <Route path="/rider/order/:id" element={<RiderOrderDetailsPage />} />
      <Route path="/rider/pickup/:id" element={<PickupPage />} />
      <Route path="/rider/delivery/:id" element={<DeliveryPage />} />
      <Route path="/rider/completed/:id" element={<CompletedPage />} />
    </Routes>
  );
}
