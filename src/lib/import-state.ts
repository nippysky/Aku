/**
 * Tiny module-level singleton for passing parsed import rows from the picker
 * entry point to the review screen without URL params or a persisted store.
 *
 * Usage:
 *   setImportRows(rows);
 *   router.push('/import-statement');
 *
 *   // inside /import-statement.tsx:
 *   const rows = getImportRows();
 *   clearImportRows();   // call on unmount or after saving
 */
import type { ImportRow } from './statement-parser';

let _rows: ImportRow[] = [];

export function setImportRows(rows: ImportRow[]): void { _rows = rows; }
export function getImportRows(): ImportRow[]            { return _rows; }
export function clearImportRows(): void                 { _rows = []; }
