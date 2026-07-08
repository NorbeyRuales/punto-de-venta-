const DATABASE_NAME = 'variedades-jacke-pos';
const DATABASE_VERSION = 1;
const STORE_NAME = 'state';
const MIGRATION_KEY = '__migration_v1__';

export const LOCAL_STATE_KEYS = [
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
  'pos_sale_drafts',
] as const;

type LocalStateKey = typeof LOCAL_STATE_KEYS[number];
type StoredRecord = { key: string; value: unknown };

const openDatabase = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
  if (!globalThis.indexedDB) {
    reject(new Error('IndexedDB no está disponible.'));
    return;
  }

  const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      database.createObjectStore(STORE_NAME, { keyPath: 'key' });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('No se pudo abrir IndexedDB.'));
});

const readAll = async (database: IDBDatabase): Promise<StoredRecord[]> => new Promise((resolve, reject) => {
  const request = database.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
  request.onsuccess = () => resolve(request.result as StoredRecord[]);
  request.onerror = () => reject(request.error ?? new Error('No se pudo leer IndexedDB.'));
});

const writeRecords = async (database: IDBDatabase, records: StoredRecord[]): Promise<void> => new Promise((resolve, reject) => {
  const transaction = database.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  records.forEach((record) => store.put(record));
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo escribir en IndexedDB.'));
  transaction.onabort = () => reject(transaction.error ?? new Error('Escritura IndexedDB cancelada.'));
});

const parseLegacyValue = (raw: string): unknown => {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
};

export async function loadLocalState(
  readLegacy: (key: string) => string | null,
): Promise<Record<string, unknown>> {
  try {
    const database = await openDatabase();
    let records = await readAll(database);
    const migrated = records.some((record) => record.key === MIGRATION_KEY);

    if (!migrated) {
      const copied = LOCAL_STATE_KEYS.flatMap((key) => {
        const raw = readLegacy(key);
        return raw === null ? [] : [{ key, value: parseLegacyValue(raw) }];
      });
      await writeRecords(database, copied);
      const verification = await readAll(database);
      const verifiedKeys = new Set(verification.map((record) => record.key));
      if (copied.some((record) => !verifiedKeys.has(record.key))) {
        throw new Error('La copia hacia IndexedDB no superó la verificación de claves.');
      }
      await writeRecords(database, [{
        key: MIGRATION_KEY,
        value: { completedAt: new Date().toISOString(), copiedKeys: copied.length },
      }]);
      records = await readAll(database);
    }

    database.close();
    return Object.fromEntries(
      records.filter((record) => record.key !== MIGRATION_KEY).map((record) => [record.key, record.value]),
    );
  } catch (error) {
    console.warn('IndexedDB no disponible; usando respaldo de localStorage.', error);
    return Object.fromEntries(LOCAL_STATE_KEYS.map((key) => [key, readLegacy(key)]));
  }
}

export async function writeLocalState(key: LocalStateKey, value: unknown): Promise<void> {
  const database = await openDatabase();
  try {
    await writeRecords(database, [{ key, value }]);
  } finally {
    database.close();
  }
}

export async function clearLocalState(): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('No se pudo limpiar IndexedDB.'));
    });
  } finally {
    database.close();
  }
}
