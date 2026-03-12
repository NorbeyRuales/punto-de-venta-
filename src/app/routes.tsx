// Definición centralizada de rutas y layout protegido.
import { createBrowserRouter } from "react-router";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { POS } from "./pages/POS";
import { Inventory } from "./pages/Inventory";
import { Customers } from "./pages/Customers";
import { Suppliers } from "./pages/Suppliers";
import { Purchases } from "./pages/Purchases";
import { Reports } from "./pages/Reports";
import { Recharges } from "./pages/Recharges";
import { Configuration } from "./pages/Configuration";
import { Invoice } from "./pages/Invoice";
import { CashRegister } from "./pages/CashRegister";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";

// Mapa de rutas: login público y módulos internos protegidos.
export const router = createBrowserRouter([
  {
    path: "/",
    // Login no requiere autenticación.
    element: <Login />,
  },
  {
    path: "/dashboard",
    element: (
      // Todas las rutas internas pasan por el Layout y se protegen por sesión.
      <ProtectedRoute>
        <Layout>
          <Dashboard />
        </Layout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/pos",
    element: (
      <ProtectedRoute>
        <Layout>
          <POS />
        </Layout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/inventory",
    element: (
      <ProtectedRoute>
        <Layout>
          <Inventory />
        </Layout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/customers",
    element: (
      <ProtectedRoute>
        <Layout>
          <Customers />
        </Layout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/suppliers",
    element: (
      <ProtectedRoute>
        <Layout>
          <Suppliers />
        </Layout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/purchases",
    element: (
      <ProtectedRoute>
        <Layout>
          <Purchases />
        </Layout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/reports",
    element: (
      <ProtectedRoute>
        <Layout>
          <Reports />
        </Layout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/recharges",
    element: (
      <ProtectedRoute>
        <Layout>
          <Recharges />
        </Layout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/cash-register",
    element: (
      <ProtectedRoute>
        <Layout>
          <CashRegister />
        </Layout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/invoice",
    element: (
      <ProtectedRoute>
        <Layout>
          <Invoice />
        </Layout>
      </ProtectedRoute>
    ),
  },
  {
    path: "/configuration",
    element: (
      <ProtectedRoute>
        <Layout>
          <Configuration />
        </Layout>
      </ProtectedRoute>
    ),
  },
]);
