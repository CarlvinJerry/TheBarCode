using Microsoft.EntityFrameworkCore;
namespace TheBarcode.Api;
public static class ModularOperationsMigration
{
 public static async Task Apply(AppDbContext db){var sql=db.Database.IsSqlite()?new[]{
 "CREATE TABLE IF NOT EXISTS recipes (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, product_id TEXT NOT NULL, name TEXT NOT NULL, yield_quantity TEXT NOT NULL, version INTEGER NOT NULL, active INTEGER NOT NULL, notes TEXT NULL, is_demo INTEGER NOT NULL)",
 "CREATE UNIQUE INDEX IF NOT EXISTS ix_recipes_active_product ON recipes(product_id, is_demo) WHERE active = 1",
 "CREATE TABLE IF NOT EXISTS recipe_ingredients (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, recipe_id TEXT NOT NULL, ingredient_product_id TEXT NOT NULL, quantity TEXT NOT NULL, waste_percent TEXT NOT NULL, FOREIGN KEY(recipe_id) REFERENCES recipes(id) ON DELETE CASCADE)",
 "CREATE INDEX IF NOT EXISTS ix_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id)",
 "CREATE TABLE IF NOT EXISTS production_runs (id TEXT NOT NULL PRIMARY KEY, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, recipe_id TEXT NOT NULL, product_id TEXT NOT NULL, staff_id TEXT NOT NULL, quantity_produced TEXT NOT NULL, total_cost TEXT NOT NULL, status TEXT NOT NULL, notes TEXT NULL, occurred_at TEXT NOT NULL, is_demo INTEGER NOT NULL)"}:new[]{
 "CREATE TABLE IF NOT EXISTS recipes (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, product_id uuid NOT NULL, name text NOT NULL, yield_quantity numeric(18,3) NOT NULL, version integer NOT NULL, active boolean NOT NULL, notes text NULL, is_demo boolean NOT NULL)",
 "CREATE UNIQUE INDEX IF NOT EXISTS ix_recipes_active_product ON recipes(product_id, is_demo) WHERE active = true",
 "CREATE TABLE IF NOT EXISTS recipe_ingredients (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, recipe_id uuid NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, ingredient_product_id uuid NOT NULL, quantity numeric(18,3) NOT NULL, waste_percent numeric(18,2) NOT NULL)",
 "CREATE INDEX IF NOT EXISTS ix_recipe_ingredients_recipe_id ON recipe_ingredients(recipe_id)",
 "CREATE TABLE IF NOT EXISTS production_runs (id uuid PRIMARY KEY, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL, recipe_id uuid NOT NULL, product_id uuid NOT NULL, staff_id uuid NOT NULL, quantity_produced numeric(18,3) NOT NULL, total_cost numeric(18,2) NOT NULL, status text NOT NULL, notes text NULL, occurred_at timestamptz NOT NULL, is_demo boolean NOT NULL)"};foreach(var statement in sql)await db.Database.ExecuteSqlRawAsync(statement);
 // Ensure databases created by earlier previews gain columns used by the current read models.
 var compatibility=db.Database.IsSqlite()?new[]{"ALTER TABLE production_runs ADD COLUMN status TEXT NOT NULL DEFAULT 'Completed'","ALTER TABLE production_runs ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0","ALTER TABLE recipes ADD COLUMN is_demo INTEGER NOT NULL DEFAULT 0","ALTER TABLE recipe_ingredients ADD COLUMN waste_percent TEXT NOT NULL DEFAULT '0'"}:new[]{"ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Completed'","ALTER TABLE production_runs ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false","ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false","ALTER TABLE recipe_ingredients ADD COLUMN IF NOT EXISTS waste_percent numeric(18,2) NOT NULL DEFAULT 0"};
 foreach(var statement in compatibility){try{await db.Database.ExecuteSqlRawAsync(statement);}catch{ /* Existing column: safe and expected on subsequent starts. */ }}
 }
}
