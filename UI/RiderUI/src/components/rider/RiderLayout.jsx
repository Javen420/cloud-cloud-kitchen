import { UtensilsCrossed } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useRiderAuth } from "../../lib/authContext";
import { clearActiveOrder } from "../../lib/driverSession";

export default function RiderLayout({ title, subtitle, children }) {
  const navigate = useNavigate();
  const { rider, signOut } = useRiderAuth();

  function handleSignOut() {
    clearActiveOrder();
    signOut();
    navigate("/rider/login", { replace: true });
  }

  return (
    <div className="page-shell">
      <header className="page-header">
        <div>
          <div className="product-identity">
            <div className="app-logo-mark" aria-hidden="true">
              <UtensilsCrossed className="app-logo-icon" />
            </div>
            <p className="app-name">Cloud Cloud Kitchen</p>
            <span className="app-surface-badge">Rider</span>
          </div>
          <h1>{title}</h1>
          {subtitle ? <p className="page-subtitle">{subtitle}</p> : null}
        </div>
        {rider ? (
          <div className="header-auth-chip">
            <div>
              <span className="label">Signed in as</span>
              <p>{rider.email}</p>
            </div>
            <button className="secondary-btn" onClick={handleSignOut}>
              Sign Out
            </button>
          </div>
        ) : null}
      </header>

      {children}
    </div>
  );
}
