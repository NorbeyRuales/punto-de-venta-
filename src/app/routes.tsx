// Definición centralizada de rutas y layout protegido.
import { Suspense, lazy, type ReactNode } from "react";
import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";

const Login = lazy(() => import("./pages/Login").then((module) => ({ default: module.Login })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((module) => ({ default: module.Dashboard })));
const POS = lazy(() => import("./pages/POS").then((module) => ({ default: module.POS })));
const Inventory = lazy(() => import("./pages/Inventory").then((module) => ({ default: module.Inventory })));
const Customers = lazy(() => import("./pages/Customers").then((module) => ({ default: module.Customers })));
const Suppliers = lazy(() => import("./pages/Suppliers").then((module) => ({ default: module.Suppliers })));
const Purchases = lazy(() => import("./pages/Purchases").then((module) => ({ default: module.Purchases })));
const Reports = lazy(() => import("./pages/Reports").then((module) => ({ default: module.Reports })));
const Recharges = lazy(() => import("./pages/Recharges").then((module) => ({ default: module.Recharges })));
const Configuration = lazy(() => import("./pages/Configuration").then((module) => ({ default: module.Configuration })));
const Invoice = lazy(() => import("./pages/Invoice").then((module) => ({ default: module.Invoice })));
const CashRegister = lazy(() => import("./pages/CashRegister").then((module) => ({ default: module.CashRegister })));

const RouteFallback = () => (
  <div className="p-6 text-sm text-gray-500" role="status" aria-live="polite">
    Cargando módulo...
  </div>
);

const withSuspense = (element: ReactNode) => (
  <Suspense fallback={<RouteFallback />}>
    {element}
  </Suspense>
);

// Mapa de rutas: login público y módulos internos protegidos.
export const router = createBrowserRouter([
  {
    path: "/",
    // Login no requiere autenticación.
    element: withSuspense(<Login />),
  },
  {
    path: "/dashboard",
    element: withSuspense((
      // Todas las rutas internas pasan por el Layout y se protegen por sesión.
      <ProtectedRoute>
        <Layout>
          <Dashboard />
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/pos",
    element: withSuspense((
      <ProtectedRoute>
        <Layout>
          <POS />
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/inventory",
    element: withSuspense((
      <ProtectedRoute>
        <Layout>
          <Inventory />
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/customers",
    element: withSuspense((
      <ProtectedRoute>
        <Layout>
          <Customers />
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/suppliers",
    element: withSuspense((
      <ProtectedRoute>
        <Layout>
          <Suppliers />
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/purchases",
    element: withSuspense((
      <ProtectedRoute>
        <Layout>
          <Purchases />
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/reports",
    element: withSuspense((
      <ProtectedRoute>
        <Layout>
          <Reports />
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/recharges",
    element: withSuspense((
      <ProtectedRoute>
        <Layout>
          <Recharges />
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/cash-register",
    element: withSuspense((
      <ProtectedRoute>
        <Layout>
          <CashRegister />
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/invoice",
    element: withSuspense((
      <ProtectedRoute>
        <Layout>
          <Invoice />
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/configuration",
    element: withSuspense((
      <ProtectedRoute>
        <Layout>
          <Configuration />
        </Layout>
      </ProtectedRoute>
    )),
  },
]);
