import { Route, Switch } from "wouter";
import Menu from "@/pages/customer/Menu";
import Checkout from "@/pages/customer/Checkout";
import OrderTracking from "@/pages/customer/OrderTracking";

export default function App() {
  return (
    <Switch>
      <Route path="/" component={Menu} />
      <Route path="/customer" component={Menu} />
      <Route path="/customer/checkout" component={Checkout} />
      <Route path="/customer/track/:id" component={OrderTracking} />
      <Route>
        <div className="min-h-screen bg-background flex items-center justify-center text-foreground">
          <h1 className="text-2xl font-bold">404 — Page not found</h1>
        </div>
      </Route>
    </Switch>
  );
}
