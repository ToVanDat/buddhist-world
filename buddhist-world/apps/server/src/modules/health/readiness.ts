/** Latest migration required by the current demo feature set. */
export const REQUIRED_DEMO_MIGRATION = "015_parties.sql";

/** The migration runner applies files in sorted order, so the final required migration gates the schema. */
export function hasRequiredDemoSchema(appliedMigrations: readonly string[]): boolean {
  return appliedMigrations.includes(REQUIRED_DEMO_MIGRATION);
}
