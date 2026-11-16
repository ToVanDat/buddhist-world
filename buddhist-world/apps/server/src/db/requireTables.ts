import type { Request, Response, NextFunction } from "express";
import { pool } from "./pool.js";

export function requireTables(...tableNames: string[]) {
  return async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await pool.query<{ table_name: string; available: boolean }>(
        "SELECT table_name, to_regclass(table_name) IS NOT NULL AS available FROM unnest($1::text[]) AS table_name",
        [tableNames],
      );
      const missing = result.rows.filter((row) => !row.available).map((row) => row.table_name);
      if (missing.length) {
        res.status(503).json({ error: "Module schema chưa sẵn sàng. Cần migration 013.", missing });
        return;
      }
      next();
    } catch (error) { next(error); }
  };
}
