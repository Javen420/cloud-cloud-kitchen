import { Navigate, useLocation } from "react-router-dom";
import { useRiderAuth } from "../../lib/authContext";

export default function RequireRiderAuth({ children }) {
  const { rider } = useRiderAuth();
  const location = useLocation();

  if (!rider) {
    return <Navigate to="/rider/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
