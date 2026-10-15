// Definición centralizada de rutas y layout protegido.
import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import { createBrowserRouter } from "react-router";
import { Layout } from "./components/Layout";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { usePOS, type SyncSection } from "./context/POSContext";

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

const ViewDataGate = ({
  sections,
  fullHistory = false,
  children,
}: {
  sections: SyncSection[];
  fullHistory?: boolean;
  children: ReactNode;
}) => {
  const { loadViewData } = usePOS();
  const loadRef = useRef(loadViewData);
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const sectionsKey = sections.join(',');
  loadRef.current = loadViewData;

  useEffect(() => {
    let active = true;
    setStatus('loading');
    void loadRef.current(sections, { fullHistory }).then((ok) => {
      if (active) setStatus(ok ? 'ready' : 'error');
    }).catch(() => {
      if (active) setStatus('error');
    });
    return () => { active = false; };
  }, [sectionsKey, fullHistory, attempt]);

  if (status === 'loading') {
    return <div className="flex min-h-[45vh] items-center justify-center text-sm text-slate-500" role="status">Cargando datos de esta vista…</div>;
  }
  if (status === 'error') {
    return <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-sm text-slate-600" role="alert">
      <p>No se pudieron cargar los datos de esta vista.</p>
      <button className="rounded-md border px-4 py-2" onClick={() => setAttempt((current) => current + 1)}>Reintentar</button>
    </div>;
  }
  return <>{children}</>;
};

const withViewData = (element: ReactNode, sections: SyncSection[], fullHistory = false) => (
  <ViewDataGate sections={sections} fullHistory={fullHistory}>{element}</ViewDataGate>
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
      <ProtectedRoute allowedRoles={['admin', 'cashier']}>
        <Layout>
          {withViewData(<Dashboard />, ['catalog', 'sales', 'kardex'])}
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/pos",
    element: withSuspense((
      <ProtectedRoute allowedRoles={['admin', 'cashier']}>
        <Layout>
          {withViewData(<POS />, ['drafts', 'currentCash'])}
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/inventory",
    element: withSuspense((
      <ProtectedRoute allowedRoles={['admin', 'cashier']}>
        <Layout>
          {withViewData(<Inventory />, ['supplierList'])}
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/customers",
    element: withSuspense((
      <ProtectedRoute allowedRoles={['admin', 'cashier']}>
        <Layout>
          {withViewData(<Customers />, ['customers', 'sales'], true)}
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/suppliers",
    element: withSuspense((
      <ProtectedRoute allowedRoles={['admin']}>
        <Layout>
          {withViewData(<Suppliers />, ['suppliers'], true)}
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/purchases",
    element: withSuspense((
      <ProtectedRoute allowedRoles={['admin', 'cashier']}>
        <Layout>
          {withViewData(<Purchases />, ['supplierList'])}
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/reports",
    element: withSuspense((
      <ProtectedRoute allowedRoles={['admin', 'cashier']}>
        <Layout>
          {withViewData(<Reports />, ['suppliers'], true)}
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/recharges",
    element: withSuspense((
      <ProtectedRoute allowedRoles={['admin', 'cashier']}>
        <Layout>
          {withViewData(<Recharges />, ['recharges'], true)}
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/cash-register",
    element: withSuspense((
      <ProtectedRoute allowedRoles={['admin', 'cashier']}>
        <Layout>
          {withViewData(<CashRegister />, ['cash', 'sales'], true)}
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/invoice",
    element: withSuspense((
      <ProtectedRoute allowedRoles={['admin', 'cashier']}>
        <Layout>
          <Invoice />
        </Layout>
      </ProtectedRoute>
    )),
  },
  {
    path: "/configuration",
    element: withSuspense((
      <ProtectedRoute allowedRoles={['admin']}>
        <Layout>
          {withViewData(<Configuration />, ['store'])}
        </Layout>
      </ProtectedRoute>
    )),
  },
]);
