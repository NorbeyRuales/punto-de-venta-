// Vista de factura (demo) con datos de la tienda.
import { Card } from '../components/ui/card';
import { usePOS } from '../context/POSContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { DEFAULT_LOGO_PATH, FALLBACK_LOGO_DATA_URL } from '../constants/branding';

export function Invoice() {
  const { storeConfig } = usePOS();
  const logoSrc = storeConfig.logo || DEFAULT_LOGO_PATH;

  // Ejemplo de factura - en producción vendría de parámetros o estado.
  const invoice = {
    number: 'FAC-000001',
    date: new Date(),
    customer: { name: 'Cliente General', nit: '222222222-2' },
    items: [
      { name: 'Producto Ejemplo', quantity: 1, price: 10000 }
    ],
    subtotal: 10000,
    iva: 1900,
    total: 11900
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <h1 className="text-3xl font-bold">Factura Electrónica</h1>

      <Card className="p-8">
        <div className="border-b pb-6 mb-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="w-16 h-16 rounded-lg border border-border bg-white overflow-hidden flex items-center justify-center">
                <img
                  src={logoSrc}
                  alt="Logo de la tienda"
                  className="w-full h-full object-contain"
                  onError={(event) => {
                    if (event.currentTarget.src !== FALLBACK_LOGO_DATA_URL) {
                      event.currentTarget.src = FALLBACK_LOGO_DATA_URL;
                    }
                  }}
                />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[var(--primary)]">{storeConfig.name}</h2>
                <p className="text-sm mt-2">NIT: {storeConfig.nit}</p>
                <p className="text-sm">{storeConfig.address}</p>
                <p className="text-sm">{storeConfig.phone}</p>
                <p className="text-sm">{storeConfig.email}</p>
              </div>
            </div>
            <div className="text-left md:text-right">
              <h3 className="text-2xl font-bold">FACTURA</h3>
              <p className="text-sm mt-2">No. {invoice.number}</p>
              <p className="text-sm">{format(invoice.date, "d 'de' MMMM 'de' yyyy", { locale: es })}</p>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h4 className="font-bold mb-2">Cliente:</h4>
          <p>{invoice.customer.name}</p>
          <p className="text-sm">NIT: {invoice.customer.nit}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] mb-6">
            <thead className="bg-secondary border-b-2">
              <tr>
                <th className="text-left p-3">Producto</th>
                <th className="text-center p-3">Cantidad</th>
                <th className="text-right p-3">Precio</th>
                <th className="text-right p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={index} className="border-b">
                  <td className="p-3">{item.name}</td>
                  <td className="text-center p-3">{item.quantity}</td>
                  <td className="text-right p-3">${item.price.toLocaleString('es-CO')}</td>
                  <td className="text-right p-3">${(item.price * item.quantity).toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end">
          <div className="w-full sm:w-64">
            <div className="flex justify-between py-2">
              <span>Subtotal:</span>
              <span>${invoice.subtotal.toLocaleString('es-CO')}</span>
            </div>
            <div className="flex justify-between py-2">
              <span>IVA (19%):</span>
              <span>${invoice.iva.toLocaleString('es-CO')}</span>
            </div>
            <div className="flex justify-between py-3 border-t-2 font-bold text-lg">
              <span>TOTAL:</span>
              <span className="text-[#2ECC71]">${invoice.total.toLocaleString('es-CO')}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t text-sm text-center text-gray-600">
          <p>Factura generada electrónicamente según normativa DIAN</p>
          {storeConfig.dianResolution && <p>Resolución DIAN: {storeConfig.dianResolution}</p>}
        </div>
      </Card>
    </div>
  );
}
