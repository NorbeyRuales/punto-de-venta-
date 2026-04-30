import React from 'react';

type ErrorBoundaryState = {
  hasError: boolean;
  message?: string;
};

const POS_STORAGE_KEYS = [
  'pos_products',
  'pos_categories',
  'pos_sales',
  'pos_kardex',
  'pos_customers',
  'pos_suppliers',
  'pos_recharges',
  'pos_cash_sessions',
  'pos_cash_movements',
  'pos_config',
  'pos_auth',
  'pos_offline_pin_hash',
  'pos_offline_role_default',
  'pos_offline_auth',
  'pos_offline_dirty',
  'pos_offline_invoice_seq',
  'pos_sale_drafts',
  'pos_active_draft_id',
  'pos_offline_backup',
  'pos_supabase_session',
];

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App error boundary caught an error', error, info);
  }

  private handleReload = () => {
    window.location.assign('/');
  };

  private handleClearLocal = () => {
    POS_STORAGE_KEYS.forEach((key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore
      }
    });
    window.location.assign('/');
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f2f4ff] p-6">
        <div className="w-full max-w-lg rounded-2xl border border-[#d8def7] bg-white p-6 shadow-[0_12px_40px_rgba(16,24,40,0.12)]">
          <h1 className="text-xl font-semibold text-[#1f2a44]">Ocurrio un error inesperado</h1>
          <p className="mt-2 text-sm text-[#516081]">
            La aplicacion no pudo cargar. Puedes recargar la pagina o limpiar los datos locales.
          </p>
          {this.state.message && (
            <p className="mt-3 text-xs text-[#7a88a6]">{this.state.message}</p>
          )}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              className="h-10 rounded-lg bg-[#4f6bff] px-4 text-sm font-semibold text-white"
              onClick={this.handleReload}
            >
              Recargar
            </button>
            <button
              type="button"
              className="h-10 rounded-lg border border-[#ccd3e5] px-4 text-sm font-semibold text-[#1f2a44]"
              onClick={this.handleClearLocal}
            >
              Limpiar datos locales
            </button>
          </div>
        </div>
      </div>
    );
  }
}
