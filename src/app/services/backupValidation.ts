export type BackupSection =
  | 'products'
  | 'sales'
  | 'customers'
  | 'suppliers'
  | 'kardex'
  | 'recharges'
  | 'cash_sessions'
  | 'cash_movements';

export type BackupValidationResult = {
  valid: boolean;
  counts: Record<BackupSection, number>;
  errors: string[];
  warnings: string[];
};

const SECTIONS: BackupSection[] = [
  'products', 'sales', 'customers', 'suppliers', 'kardex', 'recharges',
  'cash_sessions', 'cash_movements',
];

const emptyCounts = (): Record<BackupSection, number> => Object.fromEntries(
  SECTIONS.map((section) => [section, 0]),
) as Record<BackupSection, number>;

const parseSection = (value: unknown): unknown => {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

export function validateBackupPayload(value: unknown): BackupValidationResult {
  const result: BackupValidationResult = {
    valid: false,
    counts: emptyCounts(),
    errors: [],
    warnings: [],
  };

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    result.errors.push('El archivo no contiene un objeto JSON de respaldo.');
    return result;
  }

  const payload = value as Record<string, unknown>;
  const parsed = new Map<BackupSection, unknown[]>();
  SECTIONS.forEach((section) => {
    const sectionValue = parseSection(payload[section]);
    if (!Array.isArray(sectionValue)) {
      result.errors.push(`La sección ${section} falta o no es una lista válida.`);
      return;
    }
    parsed.set(section, sectionValue);
    result.counts[section] = sectionValue.length;
  });

  const config = parseSection(payload.config);
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    result.errors.push('La configuración de tienda falta o no es válida.');
  }

  const products = parsed.get('products') ?? [];
  const sales = parsed.get('sales') ?? [];
  const productIds = new Set(
    products.flatMap((item) => item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string'
      ? [(item as { id: string }).id]
      : []),
  );
  const invalidSales = sales.filter((sale) => {
    if (!sale || typeof sale !== 'object') return true;
    const candidate = sale as { id?: unknown; date?: unknown; items?: unknown };
    return typeof candidate.id !== 'string' || typeof candidate.date !== 'string' || !Array.isArray(candidate.items);
  }).length;
  if (invalidSales > 0) result.errors.push(`${invalidSales} ventas tienen una estructura inválida.`);

  let missingProductReferences = 0;
  sales.forEach((sale) => {
    if (!sale || typeof sale !== 'object' || !Array.isArray((sale as { items?: unknown }).items)) return;
    ((sale as { items: unknown[] }).items).forEach((item) => {
      if (!item || typeof item !== 'object') return;
      const product = (item as { product?: unknown }).product;
      const productId = product && typeof product === 'object' ? (product as { id?: unknown }).id : undefined;
      if (typeof productId === 'string' && productId && !productIds.has(productId)) missingProductReferences += 1;
    });
  });
  if (missingProductReferences > 0) {
    result.warnings.push(`${missingProductReferences} detalles de venta apuntan a productos que ya no están en el catálogo.`);
  }

  result.valid = result.errors.length === 0;
  return result;
}
