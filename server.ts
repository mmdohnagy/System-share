import express from "express";
import cors from "cors";
import { createServer as createViteServer } from "vite";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import * as XLSX from "xlsx";
import * as fs from "fs";

console.log("SERVER.TS STARTING INITIALIZATION...");
console.log("Current directory:", process.cwd());

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('railway') ? { rejectUnauthorized: false } : false
});

const JWT_SECRET = process.env.JWT_SECRET || "super-secret-key";

// Compatibility wrapper for PostgreSQL (Async)
const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
  exec: (sql: string) => pool.query(sql),
  get: async (text: string, params?: any[]) => {
    const res = await pool.query(text, params);
    return res.rows[0];
  },
  all: async (text: string, params?: any[]) => {
    const res = await pool.query(text, params);
    return res.rows;
  },
  // Transaction helper
  transaction: async (fn: (client: any) => Promise<any>) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
};

const getBrandRestriction = async (user: any) => {
  // Check junction table for multiple brands (for Marketing Team, Call Center or Restaurants)
  const userBrandsResult = await db.query(`
    SELECT b.name 
    FROM user_brands ub 
    JOIN brands b ON ub.brand_id = b.id 
    WHERE ub.user_id = $1
  `, [user.id]);
  const userBrands = userBrandsResult.rows;

  if (userBrands.length > 0) {
    return { type: 'include', brands: userBrands.map(b => b.name) };
  }

  if (user.brand_id) {
    const brandResult = await db.query("SELECT name FROM brands WHERE id = $1", [user.brand_id]);
    const brand = brandResult.rows[0];
    if (brand) {
      return { type: 'include', brands: [brand.name] };
    }
  }
  return null;
};

function getCurrentKuwaitTime() {
  return new Date().toISOString();
}

// Audit Log Function
async function logAction(userId: number, action: string, targetTable: string, targetId: number | null, oldValue: any, newValue: any) {
  try {
    await db.query(
      "INSERT INTO audit_logs (user_id, action, target_table, target_id, old_value, new_value) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        userId,
        action,
        targetTable,
        targetId,
        oldValue ? JSON.stringify(oldValue) : null,
        newValue ? JSON.stringify(newValue) : null,
      ]
    );
  } catch (error) {
    console.error("Failed to log action:", error);
  }
}

// Seed Data Function
async function seedData() {
  const roles = [
    "Technical Back Office",
    "Manager",
    "Super Visor",
    "Restaurants",
    "Call Center",
    "Marketing Team",
    "Coding Team"
  ];

  for (const role of roles) {
    await db.query("INSERT INTO roles (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", [role]);
  }

  // Create default admin if no users exist
  const userCount = await db.get("SELECT COUNT(*) FROM users");
  let adminUserId = 0;
  if (Number(userCount.count) === 0) {
    const adminRole = await db.get("SELECT id FROM roles WHERE name = $1", ["Technical Back Office"]);
    const passwordHash = await bcrypt.hash("admin123", 10);
    const result = await db.query(
      "INSERT INTO users (username, password_hash, role_id) VALUES ($1, $2, $3) RETURNING id",
      ["admin", passwordHash, adminRole.id]
    );
    adminUserId = result.rows[0].id;
    console.log("Default admin user created: admin / admin123");
  } else {
    const admin = await db.get("SELECT id FROM users WHERE username = $1", ["admin"]);
    adminUserId = admin.id;
  }

  // Ensure Brand BBT exists
  await db.query("INSERT INTO brands (name) VALUES ($1) ON CONFLICT (name) DO NOTHING", ["BBT"]);
  const bbtBrand = await db.get("SELECT id FROM brands WHERE name = $1", ["BBT"]);

  // Ensure essential dynamic fields exist
  const fields = [
    { name_en: "Product Name (EN)", name_ar: "اسم المنتج (انجليزي)", type: "text", order: 1 },
    { name_en: "Category Name (EN)", name_ar: "اسم الفئة (انجليزي)", type: "text", order: 2 }
  ];

  for (const f of fields) {
    await db.query(
      "INSERT INTO dynamic_fields (name_en, name_ar, type, field_order) VALUES ($1, $2, $3, $4) ON CONFLICT (name_en) DO NOTHING",
      [f.name_en, f.name_ar, f.type, f.order]
    );
  }

  const nameField = await db.get("SELECT id FROM dynamic_fields WHERE name_en = $1", ["Product Name (EN)"]);

  // Check if products already exist for BBT to avoid duplicates
  const bbtProductCount = await db.get("SELECT COUNT(*) FROM products WHERE brand_id = $1", [bbtBrand.id]);
  
  if (Number(bbtProductCount.count) === 0) {
    const productsList = [
      "7up", "Aquafina Water", "3.5KD Deal", "BBQ Sauce", "BBT Mayo", "BBT Ranch Sauce", "BBT Sauce", 
      "Buttercup", "Cheese Dip", "CLASSIC ROLLS BEEF", "CLASSIC ROLLS BEEF Meal", "Cheeseburger Duo Combo", 
      "Chicken Fillaaa", "Chicken Fillaaa Meal", "Chicken Nugget Meal", "Chicken Nuggets", "Chili Lime", 
      "Chilli Lime Old Skool", "Chilli Lime Supreme", "Chilli Lime Old Skool Meal", "Chilli Lime Supreme Meal", 
      "Chilli Lime Tenders Fillaaa (New)", "Classic Old Skool", "Classic Supreme", "Classic Old Skool Meal", 
      "Classic Supreme Meal", "Coleslaw", "Crispy Fries", "Curly Fries", "Extra 1pc Tenders", "Extra 1pc Toast", 
      "Extra Cheese", "Extra Coleslaw", "Extra Sauce", "Fillaaa Sauce", "FILAAA PARTY", "French Fries", "Fries", 
      "Honey Mustard", "Kinza Cola", "Kinza Diet Cola", "Kinza Diet Lemon", "Kinza Lemon", "Kinza Orange", 
      "Lipton Ice Tea - Lemon Zero", "Lipton Ice Tea - Peach Zero", "Lipton Ice Tea - Red Fruits Zero", 
      "Lipton Ice Tea - Tropical Zero", "Little Cheeseburger", "Little Chicken Burger", "Little Chicken Burger Duo Combo", 
      "Little Wrap Fillaaa Meal", "Little Wrap Fillaaa Duo Combo", "Little Wrap Fillaaaa", "Messy Fries", "Miranda", 
      "Mirinda", "Mountain Dew", "Nesqiuk", "Nuggets", "Nuggets Duo Combo", "Oreo Madness", "Peanut Butter", "Pepsi", 
      "Pepsi Zero", "Quarter Pounder Burger", "Quarter Pounder Meal", "Schnitzel x Burger", "Schnitzel X Meal", "Salt", 
      "SMOKEY ROLLS BEEF", "SMOKEY ROLLS BEEF Meal", "Shani", "Southwest Burger", "Southwest Meal", 
      "Salt n Vinegar Tenders Fillaaa", "\"Not So Ranch\" Sauce", "Strawberry", "Sweet Chili", "Suuuper Beef", 
      "Suuuper Beef Combo", "Suuuper Chicken", "Suuuper Chicken Combo", "Tang", "Tenders Fillaaa", "Toast", 
      "Triple X", "Triple X Box", "TRIPLE X Meal", "Water", "Westcoast Burger", "Westcoast Meal", "Kidkit Little chicken", 
      "Kidkit Little Cheese Burger", "Kidkit Chicken Nuggets", "XL Fillaaa Sauce"
    ];

    console.log(`Seeding ${productsList.length} products for BBT...`);
    for (const productName of productsList) {
      const pResult = await db.query(
        "INSERT INTO products (brand_id, created_by, status) VALUES ($1, $2, $3) RETURNING id",
        [bbtBrand.id, adminUserId, 'Completed']
      );
      const productId = pResult.rows[0].id;
      await db.query(
        "INSERT INTO product_field_values (product_id, field_id, value) VALUES ($1, $2, $3)",
        [productId, nameField.id, productName]
      );
    }
    console.log("BBT Products seeded successfully.");
  }
}

// Initialize Database Function
async function initDb() {
  if (!process.env.DATABASE_URL) {
    console.warn("WARNING: DATABASE_URL is not set. Database operations will fail.");
    return;
  }
  if (process.env.DATABASE_URL.includes('postgres.railway.internal')) {
    console.error("CRITICAL ERROR: You are using an INTERNAL Railway URL. Please update DATABASE_URL in Settings to use the PUBLIC URL (DATABASE_PUBLIC_URL).");
    throw new Error("Internal Railway URL detected. Connection will fail from outside Railway.");
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS brands (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS branches (
      id SERIAL PRIMARY KEY,
      brand_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role_id INTEGER NOT NULL,
      brand_id INTEGER,
      branch_id INTEGER,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (role_id) REFERENCES roles(id),
      FOREIGN KEY (brand_id) REFERENCES brands(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );

    CREATE TABLE IF NOT EXISTS user_brands (
      user_id INTEGER NOT NULL,
      brand_id INTEGER NOT NULL,
      PRIMARY KEY (user_id, brand_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (brand_id) REFERENCES brands(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS late_order_requests (
      id SERIAL PRIMARY KEY,
      call_center_user_id INTEGER NOT NULL,
      brand_id INTEGER NOT NULL,
      branch_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      order_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      call_center_message TEXT,
      case_type TEXT DEFAULT 'Late Order',
      dedication_time TIMESTAMP,
      status TEXT DEFAULT 'Pending', -- Pending, Approved, Rejected
      restaurant_message TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      restaurant_viewed_at TIMESTAMP,
      manager_viewed_at TIMESTAMP,
      restaurant_response_at TIMESTAMP,
      manager_responded_at TIMESTAMP,
      technical_type TEXT,
      FOREIGN KEY (call_center_user_id) REFERENCES users(id),
      FOREIGN KEY (brand_id) REFERENCES brands(id),
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );
  `);

  // Ensure technical_type column exists in late_order_requests
  try {
    await db.exec("ALTER TABLE late_order_requests ADD COLUMN technical_type TEXT");
  } catch (e) {}

  await db.exec(`
    CREATE TABLE IF NOT EXISTS call_center_form_fields (
      id SERIAL PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      type TEXT NOT NULL, -- 'text', 'selection', 'number', 'textarea'
      is_required INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS call_center_field_options (
      id SERIAL PRIMARY KEY,
      field_id INTEGER NOT NULL,
      value_en TEXT NOT NULL,
      value_ar TEXT NOT NULL,
      display_order INTEGER DEFAULT 0,
      FOREIGN KEY (field_id) REFERENCES call_center_form_fields(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS late_order_field_values (
      request_id INTEGER NOT NULL,
      field_id INTEGER NOT NULL,
      value TEXT,
      PRIMARY KEY (request_id, field_id),
      FOREIGN KEY (request_id) REFERENCES late_order_requests(id) ON DELETE CASCADE,
      FOREIGN KEY (field_id) REFERENCES call_center_form_fields(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS technical_case_types (
      id SERIAL PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS call_center_platforms (
      id SERIAL PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS call_center_case_types (
      id SERIAL PRIMARY KEY,
      name_en TEXT NOT NULL,
      name_ar TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  await db.exec(`
  CREATE TABLE IF NOT EXISTS dynamic_fields (
    id SERIAL PRIMARY KEY,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    type TEXT NOT NULL, -- text, number, dropdown, multiselect, checkbox
    is_mandatory INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    field_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS field_options (
    id SERIAL PRIMARY KEY,
    field_id INTEGER NOT NULL,
    value_en TEXT NOT NULL,
    value_ar TEXT NOT NULL,
    price DECIMAL DEFAULT 0,
    FOREIGN KEY (field_id) REFERENCES dynamic_fields(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS products (
    id SERIAL PRIMARY KEY,
    brand_id INTEGER NOT NULL,
    created_by INTEGER NOT NULL,
    status TEXT DEFAULT 'Draft', -- Draft, Pending Coding, Completed
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (brand_id) REFERENCES brands(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS product_field_values (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    field_id INTEGER NOT NULL,
    value TEXT, -- JSON string for complex types
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (field_id) REFERENCES dynamic_fields(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS modifier_groups (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    selection_type TEXT CHECK(selection_type IN ('single', 'multiple')) DEFAULT 'single',
    is_required INTEGER DEFAULT 0,
    min_selection INTEGER DEFAULT 0,
    max_selection INTEGER DEFAULT 1,
    code TEXT,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS modifier_options (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL,
    name_en TEXT NOT NULL,
    name_ar TEXT NOT NULL,
    price_adjustment DECIMAL DEFAULT 0,
    code TEXT,
    FOREIGN KEY (group_id) REFERENCES modifier_groups(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS category_codes (
    id SERIAL PRIMARY KEY,
    category_name TEXT UNIQUE NOT NULL,
    code TEXT NOT NULL,
    updated_by INTEGER NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS product_codes (
    id SERIAL PRIMARY KEY,
    product_id INTEGER UNIQUE NOT NULL,
    code TEXT NOT NULL,
    updated_by INTEGER NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS product_channels (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL,
    channel_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    target_table TEXT NOT NULL,
    target_id INTEGER,
    old_value TEXT,
    new_value TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS busy_period_records (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    brand TEXT NOT NULL,
    branch TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    total_duration TEXT NOT NULL,
    total_duration_minutes INTEGER DEFAULT 0,
    reason_category TEXT NOT NULL,
    responsible_party TEXT NOT NULL,
    comment TEXT,
    internal_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS busy_branch_reasons (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS busy_branch_responsible (
    id SERIAL PRIMARY KEY,
    name TEXT UNIQUE NOT NULL
  );

  CREATE TABLE IF NOT EXISTS hidden_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    brand_id INTEGER NOT NULL,
    branch_id INTEGER, -- NULL means All Branches
    product_id INTEGER NOT NULL,
    agent_name TEXT NOT NULL,
    reason TEXT NOT NULL,
    action_to_unhide TEXT,
    comment TEXT,
    requested_at TIMESTAMP,
    responsible_party TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (brand_id) REFERENCES brands(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS hide_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    brand_id INTEGER NOT NULL,
    branch_id INTEGER, -- NULL means All Branches
    product_id INTEGER NOT NULL,
    action TEXT NOT NULL, -- 'HIDE' or 'UNHIDE'
    agent_name TEXT,
    reason TEXT,
    action_to_unhide TEXT,
    comment TEXT,
    requested_at TIMESTAMP,
    responsible_party TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (brand_id) REFERENCES brands(id),
    FOREIGN KEY (branch_id) REFERENCES branches(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS pending_requests (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL, -- 'hide_unhide', 'busy_branch'
    data TEXT NOT NULL, -- JSON string
    status TEXT DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_by INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (processed_by) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_products_brand ON products(brand_id);
  CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by);
  CREATE INDEX IF NOT EXISTS idx_product_field_values_product ON product_field_values(product_id);
  CREATE INDEX IF NOT EXISTS idx_product_field_values_field ON product_field_values(field_id);
  CREATE INDEX IF NOT EXISTS idx_modifier_groups_product ON modifier_groups(product_id);
  CREATE INDEX IF NOT EXISTS idx_modifier_options_group ON modifier_options(group_id);
  CREATE INDEX IF NOT EXISTS idx_product_channels_product ON product_channels(product_id);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_busy_period_records_created ON busy_period_records(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_hidden_items_created ON hidden_items(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_hide_history_timestamp ON hide_history(timestamp DESC);
  CREATE INDEX IF NOT EXISTS idx_branches_brand ON branches(brand_id);
`);

// Migration: Add is_offline to products if it doesn't exist
try {
  await db.exec("ALTER TABLE products ADD COLUMN is_offline INTEGER DEFAULT 0");
  console.log("Added is_offline column to products");
} catch (e) {
  // Column already exists
}

  // Migration: Add total_duration_minutes to busy_period_records if it doesn't exist
  try {
    await db.exec("ALTER TABLE busy_period_records ADD COLUMN total_duration_minutes INTEGER DEFAULT 0");
    console.log("Added total_duration_minutes column to busy_period_records");
  } catch (e) {
    // Column already exists
  }

  // Migration: Add missing columns to hide_history if they don't exist
  const hideHistoryColumns = [
    { name: 'agent_name', type: 'TEXT' },
    { name: 'reason', type: 'TEXT' },
    { name: 'action_to_unhide', type: 'TEXT' },
    { name: 'comment', type: 'TEXT' },
    { name: 'requested_at', type: 'TIMESTAMP' },
    { name: 'responsible_party', type: 'TEXT' }
  ];

  for (const col of hideHistoryColumns) {
    try {
      await db.exec(`ALTER TABLE hide_history ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added ${col.name} column to hide_history`);
    } catch (e) {
      // Column already exists or other error
    }
  }

  // Migration: Add updated_at and updated_by to hidden_items
  try {
    await db.exec("ALTER TABLE hidden_items ADD COLUMN updated_at TIMESTAMP");
    await db.exec("ALTER TABLE hidden_items ADD COLUMN updated_by INTEGER");
    console.log("Added updated_at and updated_by columns to hidden_items");
  } catch (e) {
    // Columns already exist
  }

  // Migration: Add Ingredients field if it doesn't exist
  const ingredientsField = await db.get("SELECT id FROM dynamic_fields WHERE name_en = $1", ['Ingredients']);
  if (!ingredientsField) {
    await db.query("INSERT INTO dynamic_fields (name_en, name_ar, type, is_mandatory) VALUES ($1, $2, $3, $4)", ['Ingredients', 'المكونات', 'text', 0]);
    console.log("Added Ingredients dynamic field");
  }

  const roles = ["Marketing Team", "Coding Team", "Technical Team", "Call Center", "Technical Back Office", "Manager", "Restaurants", "Super Visor"];
  for (const roleName of roles) {
    const exists = await db.get("SELECT id FROM roles WHERE name = $1", [roleName]);
    if (!exists) {
      await db.query("INSERT INTO roles (name) VALUES ($1)", [roleName]);
    }
  }

  // Seed Super Visor User
  const superVisorRole = await db.get("SELECT id FROM roles WHERE name = $1", ["Super Visor"]) as { id: number };
  if (superVisorRole) {
    const username = 'Super Visor';
    const userExists = await db.get("SELECT id FROM users WHERE username = $1", [username]);
    if (!userExists) {
      const hashedPassword = bcrypt.hashSync("supervisor123", 10);
      await db.query("INSERT INTO users (username, password_hash, role_id) VALUES ($1, $2, $3)", [username, hashedPassword, superVisorRole.id]);
      console.log(`Created user ${username} with role Super Visor`);
    }
  }

  // Remove unwanted marketing roles and reassign users
  const marketingTeamRole = await db.get("SELECT id FROM roles WHERE name = $1", ["Marketing Team"]) as { id: number };
  if (marketingTeamRole) {
    const unwantedRoles = ["Marketing Yellow", "Marketing ERMG", "Marketing Swish"];
    for (const roleName of unwantedRoles) {
      const role = await db.get("SELECT id FROM roles WHERE name = $1", [roleName]) as { id: number } | undefined;
      if (role) {
        // Reassign users to Marketing Team
        await db.query("UPDATE users SET role_id = $1 WHERE role_id = $2", [marketingTeamRole.id, role.id]);
        // Delete the role
        await db.query("DELETE FROM roles WHERE id = $1", [role.id]);
        console.log(`Removed role ${roleName} and reassigned users to Marketing Team`);
      }
    }

    // Also remove the specific users if they exist
    const unwantedUsers = ["marketing_yellow", "marketing_ermg", "marketing_swish", "Market", "Markett"];
    for (const username of unwantedUsers) {
      await db.query("DELETE FROM users WHERE username = $1", [username]);
    }
  }

  const managerRole = await db.get("SELECT id FROM roles WHERE name = $1", ["Manager"]) as { id: number };
  const adminUser = await db.get("SELECT id FROM users WHERE username = $1", ["admin"]) as { id: number } | undefined;

  if (!adminUser && managerRole) {
    const hashedPassword = bcrypt.hashSync("admin123", 10);
    await db.query("INSERT INTO users (username, password_hash, role_id) VALUES ($1, $2, $3)", ["admin", hashedPassword, managerRole.id]);
    console.log("Admin user created with Manager role");
  } else if (adminUser && managerRole) {
    // Ensure admin has Manager role
    await db.query("UPDATE users SET role_id = $1 WHERE username = $2", [managerRole.id, "admin"]);
    console.log("Admin user role verified/updated to Manager");
  }

  // Seed Brands if empty
  const brandCountResult = await db.get("SELECT COUNT(*) as count FROM brands") as { count: string | number };
  const brandCount = parseInt(brandCountResult.count.toString());
  const brands = ["shakir", "bbt", "Slice", "pattie", "Just c", "chili", "Mishmash", "Table", "Yellow Pizza", "FM"];

  if (brandCount === 0) {
    for (const brand of brands) {
      await db.query("INSERT INTO brands (name) VALUES ($1)", [brand]);
    }
  } else {
    // Migration: Rename yelo to Yellow Pizza if it exists
    await db.query("UPDATE brands SET name = 'Yellow Pizza' WHERE name = 'yelo'");
    await db.query("UPDATE brands SET name = 'Yellow Pizza' WHERE name = 'Yello Pizza'");
    await db.query("UPDATE brands SET name = 'Yellow Pizza' WHERE name = 'Yelo Pizza'");
    // Migration: Rename Forevermore to FM
    await db.query("UPDATE brands SET name = 'FM' WHERE name = 'Forevermore'");
  }

  const yellowBrand = await db.get("SELECT id FROM brands WHERE name = 'Yellow Pizza'") as { id: number };
  if (yellowBrand) {
    const yellowProductCountResult = await db.get("SELECT COUNT(*) as count FROM products WHERE brand_id = $1", [yellowBrand.id]) as { count: string | number };
    const yellowProductCount = parseInt(yellowProductCountResult.count.toString());
    if (yellowProductCount === 0) {
      const managerUser = await db.get("SELECT id FROM users WHERE username = 'admin'") as { id: number };
      if (managerUser) {
        const productResult = await db.query("INSERT INTO products (brand_id, created_by) VALUES ($1, $2) RETURNING id", [yellowBrand.id, managerUser.id]);
        const productId = productResult.rows[0].id;
        await db.query("INSERT INTO product_field_values (product_id, field_id, value) VALUES ($1, $2, $3)", [productId, 2, "Sample Yellow Pizza"]);
        console.log("Seeded sample product for Yellow Pizza");
      }
    }
  }

  // Seed Marketing User
  if (marketingTeamRole) {
    const username = 'marketing_team';
    const userExists = await db.get("SELECT id FROM users WHERE username = $1", [username]);
    if (!userExists) {
      const hashedPassword = bcrypt.hashSync("marketing123", 10);
      const result = await db.query("INSERT INTO users (username, password_hash, role_id) VALUES ($1, $2, $3) RETURNING id", [username, hashedPassword, marketingTeamRole.id]);
      const userId = result.rows[0].id;
      
      // Assign some brands to marketing team by default
      const brandsToAssign = ["Yellow Pizza", "Mishmash", "Table"];
      for (const brandName of brandsToAssign) {
        const brand = await db.get("SELECT id FROM brands WHERE name = $1", [brandName]) as { id: number };
        if (brand) {
          await db.query("INSERT INTO user_brands (user_id, brand_id) VALUES ($1, $2)", [userId, brand.id]);
        }
      }
      console.log(`Created user ${username} with role Marketing Team and assigned brands`);
    }
  }

  // Seed Branches if empty
  const branchesMap: Record<string, string[]> = {
    "shakir": ["Rai", "Qurain", "Salmiya", "City", "Jahra", "Ardiya", "Egaila", "Hawally", "Sabah Al Ahmed"],
    "bbt": ["Shamiya", "Hilltop", "West Mishref", "Yard (Vibes)", "Salmiya", "Adriya", "Jahra", "Adailiya", "Shuhada", "Mangaf"],
    "Slice": ["Mishref", "City", "Yard Mall", "Adailiya", "Jabriya", "Ardiya", "Jahra"],
    "pattie": ["Adailiya", "Mishref", "Ardiya", "Jahra", "Salmiya", "Yard", "Hawally"],
    "Just c": ["Qortuba", "Yard"],
    "chili": ["Qortuba", "Yard", "Hawally"],
    "Mishmash": ["Ardiya", "Kaifan", "Mahboula", "Jabriya", "S-Salem", "S-Abdallah", "Salmiya", "Khaitan", "Mangaf", "W-Abdullah", "Salwa", "Qadsiya", "Qurain", "Khairan"],
    "Table": ["Al-Rai", "Adriya", "Kuwait City", "Salmiya", "Hawally", "Jahra", "Egaila", "Aswaq Al-Qurain", "Sabah Al Ahmed"],
    "Yellow Pizza": [
      "Adailiya", "Khairan", "Jaber Al-Ahmad", "Sabah Al-Salem", "Vibes", "Qortuba", 
      "Dahiya Abdullah", "Fahaheel", "Jleeb Al-Shuyo", "Egaila", "Salmiya", "Jabriya", 
      "Ishbiliya (New)", "Sabah Al Ahmad", "Ardiya", "Midan Hawally", "Yard Mall", 
      "Jahra", "Salwa", "Zahra"
    ],
    "FM": ["Main Branch"]
  };

  for (const [brandName, branches] of Object.entries(branchesMap)) {
    const brand = await db.get("SELECT id FROM brands WHERE name = $1", [brandName]) as { id: number };
    if (brand) {
      for (const branchName of branches) {
        const exists = await db.get("SELECT id FROM branches WHERE brand_id = $1 AND name = $2", [brand.id, branchName]);
        if (!exists) {
          await db.query("INSERT INTO branches (brand_id, name) VALUES ($1, $2)", [brand.id, branchName]);
        }
      }
    }
  }

  // Seed Dynamic Fields
  const fields = [
    { name_en: "Category Name (EN)", name_ar: "اسم الفئة (EN)", type: "text", is_mandatory: 1 },
    { name_en: "Product Name (EN)", name_ar: "اسم المنتج (EN)", type: "text", is_mandatory: 1 },
    { name_en: "Description (EN)", name_ar: "الوصف (EN)", type: "text", is_mandatory: 1 },
    { name_en: "Price", name_ar: "السعر", type: "number", is_mandatory: 1 },
    { name_en: "Category Name (AR)", name_ar: "اسم الفئة (AR)", type: "text", is_mandatory: 1 },
    { name_en: "Product Name (AR)", name_ar: "اسم المنتج (AR)", type: "text", is_mandatory: 1 },
    { name_en: "Description (AR)", name_ar: "الوصف (AR)", type: "text", is_mandatory: 1 },
    { name_en: "Ingredients", name_ar: "المكونات", type: "text", is_mandatory: 0 },
    { name_en: "Sticker", name_ar: "ملصق", type: "text", is_mandatory: 0 },
    { name_en: "Deal Category", name_ar: "فئة العرض", type: "text", is_mandatory: 0 }
  ];

  for (const f of fields) {
    const exists = await db.get("SELECT id FROM dynamic_fields WHERE name_en = $1", [f.name_en]);
    if (!exists) {
      await db.query("INSERT INTO dynamic_fields (name_en, name_ar, type, is_mandatory) VALUES ($1, $2, $3, $4)", [f.name_en, f.name_ar, f.type, f.is_mandatory]);
    }
  }

  // Seed Busy Branch Config if empty
  const reasonCountResult = await db.get("SELECT COUNT(*) as count FROM busy_branch_reasons") as { count: string | number };
  const reasonCount = parseInt(reasonCountResult.count.toString());
  if (reasonCount === 0) {
    const reasons = ["High Volume", "System Down", "Staff Shortage", "Equipment Failure", "Other"];
    for (const r of reasons) {
      await db.query("INSERT INTO busy_branch_reasons (name) VALUES ($1)", [r]);
    }
  }

  const respCountResult = await db.get("SELECT COUNT(*) as count FROM busy_branch_responsible") as { count: string | number };
  const respCount = parseInt(respCountResult.count.toString());
  const newResponsible = ["Store", "Warhorse", "Bakery", "CPU", "Logistics"];

  if (respCount === 0) {
    for (const r of newResponsible) {
      await db.query("INSERT INTO busy_branch_responsible (name) VALUES ($1)", [r]);
    }
  } else {
    const currentResp = await db.all("SELECT name FROM busy_branch_responsible") as { name: string }[];
    const hasOldDefaults = currentResp.some(r => r.name === "Operations" || r.name === "IT Support");
    
    if (hasOldDefaults) {
      await db.query("DELETE FROM busy_branch_responsible");
      for (const r of newResponsible) {
        await db.query("INSERT INTO busy_branch_responsible (name) VALUES ($1)", [r]);
      }
    }
  }

// Helper functions for product seeding
const getCategory = (itemName: string) => {
  const lower = itemName.toLowerCase();
  if (lower.includes("pizza")) return { en: "Pizza", ar: "بيتزا" };
  if (lower.includes("burger") || lower.includes("slider") || lower.includes("pattie")) return { en: "Burgers", ar: "برجر" };
  if (lower.includes("drink") || lower.includes("cola") || lower.includes("pepsi") || lower.includes("water") || lower.includes("juice") || lower.includes("latte") || lower.includes("shake")) return { en: "Drinks", ar: "مشروبات" };
  if (lower.includes("fries") || lower.includes("wedges") || lower.includes("nuggets") || lower.includes("wings") || lower.includes("bites") || lower.includes("bread")) return { en: "Sides & Appetizers", ar: "مقبلات وجوانب" };
  if (lower.includes("salad") || lower.includes("fattoush") || lower.includes("tabboulah") || lower.includes("rocca")) return { en: "Salads", ar: "سلطات" };
  if (lower.includes("wrap") || lower.includes("sandwich") || lower.includes("roll") || lower.includes("arayes")) return { en: "Sandwiches & Wraps", ar: "ساندوتشات ولفائف" };
  if (lower.includes("rice bowl") || lower.includes("bowl") || lower.includes("platter") || lower.includes("meal") || lower.includes("box")) return { en: "Meals & Bowls", ar: "وجبات وأطباق" };
  if (lower.includes("dessert") || lower.includes("cookie") || lower.includes("pancake") || lower.includes("oats") || lower.includes("parfait")) return { en: "Desserts", ar: "حلويات" };
  if (lower.includes("sauce") || lower.includes("mayo") || lower.includes("ranch") || lower.includes("dip")) return { en: "Sauces", ar: "صوصات" };
  return { en: "Main Course", ar: "طبق رئيسي" };
};

const getDescription = (itemName: string) => {
  return {
    en: `Freshly prepared ${itemName} with high-quality ingredients.`,
    ar: `${itemName} طازج محضر من أجود المكونات.`
  };
};

const getPrice = () => (Math.random() * 4 + 1.5).toFixed(3);

// Seed Forevermore products for Hide Item demo
const productSeedingData: Record<string, string[]> = {
  "shakir": [
    "1 Beef Arayes Sandwich", "1 Beef Kaizer Shawarma", "1 Beef Kebab Sandwich", "1 Beef Kebab Wrap", "1 Bun", "3.5KD Deal",
    "1 Chicken Arayes Sandwich", "1 Chicken Kaizer Shawarma", "1 Lebanese Chicken Shawarma", "1 Lebanese Meat Shawarma",
    "1 Mixed Grill Platter (4 People)", "1 Regular Beef Shawarma", "1 Regular Chicken Shawarma", "1 Regular Meat Shawarma",
    "1 Shish Tawouq Wrap", "1 Spicy Beef Kaizer Shawarma", "1 Spicy Beef Shawarma", "1 Spicy Chicken Kaizer Shawarma",
    "1 Spicy Chicken Shawarma", "1 Spicy Meat Shawarma", "1 Tawouq Sandwich", "2 Beef & 2 Chicken", "2 Fattoush", "2 Hummus",
    "2 Mixed Grill Platter (4 People)", "2 Shakir Salad", "3 Fattoush", "3 Hummus", "3 Pcs Of Beef", "3 Pcs Of Chicken",
    "3 Pcs Of Spicy Beef", "3 Pcs Of Spicy Chicken", "3 Shakir Salad", "4 Pcs Of Beef", "4 Pcs Of Chicken", "4 Regular Fries",
    "7up", "7up Zero Sugar", "8 Regular Fries", "Arayes & Wraps Combo", "Aquafina Water", "Banana & Fruits Mix",
    "Beef Kaizer Combo", "Beef Kebab Platter", "Beef Kebab Sandwich", "Beef Kebab Wrap", "Beef Tikka Platter",
    "Broasted Garlic Sauce", "Bun", "Cheese Sticks", "Chicken Arayes Sandwich", "Chicken Kaizer Combo", "Chicken Kebab Platter",
    "Coconut & Pineapple Mix", "Coleslaw", "Crispy Wrap Regular", "Crispy Wrap Spicy", "Crispy Box ( 4 Pieces) Regular",
    "Crispy Box ( 4 Pieces) Spicy", "Crispy Box ( 6 Pieces) Regular", "Crispy Box ( 6 Pieces) Spicy", "Crispy Wrap Combo Regular",
    "Crispy Wrap Combo Spicy", "Diwaniya Pack (6-8)", "Diwaniya Pack 2 (10-12)", "Fattoush", "Fried Sliced Potato",
    "Fruits & Icecream Mix", "Garlic Sauce", "Grilled Sandwiches Combo", "Grilled wings", "Hummus", "Hummus With Beef Shawarma",
    "Kabab Combo", "kinza cola", "kinza diet cola", "kinza diet lemon", "kinza lemon", "kinza orange", "Laban",
    "Lebanese Beef Shawarma", "Lebanese Box", "Lebanese Chicken Shawarma", "Lipton Ice Tea - Lemon Zero",
    "Lipton Ice Tea - Peach Zero", "Lipton Ice Tea - Red Fruits Zero", "Lipton Ice Tea - Tropical Zero", "Meat Arayes Sandwich",
    "Mirinda", "MIX Combo", "Mixed Grill Platter", "Mixed Grill Platter (4 People)", "Mountain Dew", "Muhammara", "Muttabal",
    "Musahab Wrap", "Mini Katayef", "Musahab Rice Bowl", "Grilled Chicken Platter", "Musahab Wrap Combo",
    "Peach, Fruits & Ice Cream Mix", "Pepsi", "Pepsi Diet", "Plain Beef", "Plain Chicken", "Plain Meat", "Regular Chicken Shawarma",
    "Regular Fries", "Regular Meat Shawarma", "Shakir Banana", "Shakir Broasted Meal", "Shakir Broasted Meal Spicy",
    "Shakir Grills Sauce", "Shakir Hummus", "Shakir Lemonade", "Shakir Mango", "Shakir Mini Meat Shawarma", "Shakir Peach",
    "Shakir Salad", "Shakir Shawarma Chicken Platter", "Shakir Shawarma Meat Platter", "Shakir Spicy Garlic", "Shakir Watermelon",
    "Shakirs Large Platter", "Shakirs Medium Platter", "Shani", "Shawarma Shakir Box", "2 Shawarma Combo", "3 Shawarma Combo",
    "Shawarma Combo", "Shish Tawouq Platter", "Shish Tawouq Sandwich", "Shish Tawouq Wrap", "Spicy Chicken Shawarma",
    "Spicy Fried Sliced Potatoes", "Spicy Garlic Broasted Sauce", "Spicy Meat Shawarma", "Spicy Mix", "Spicy Tahina",
    "Super Beef Shawarma", "Super Chicken Shawarma", "Samoun Chicken Shawarma", "3 Samoun Chicken Shawarma", "Tahina Garlic Sauce",
    "Tahina Sauce", "Tawouq Combo", "Tawouq & Arayes Combo", "Vimto", "Pepsi 1.25L", "Diet Pepsi 1.25L", "Miranda 1.25L",
    "7UP 1.25L", "7UP Diet 1.25L", "8 shawerma combo", "12pc Broasted Box", "12pc Family Meal"
  ],
  "Yellow Pizza": [
    "2 pcs Pepperoni Garlic Bread", "2 pcs Pesto Garlic Bread", "2pcs Garlic Bread", "3 Pc Cheesy Garlic Bread",
    "3 Pc Pepporoni Garlic Bread", "3 Pc Pesto Garlic Bread", "3x3x3 - Good for 3", "4 for 4", "3.5KD Deal",
    "4 pcs BBQ Wings", "4 pcs Buffalo Wings", "5 for 5 ( NY Pizza )", "5 for 5 ( Square Pizza)", "7-Up Zero Sugar", "7-Up",
    "All for One - Good for 1", "Apricot Jam", "Aquafina Water", "Bacon Ranch", "Bacon", "Baked Wedges", "BBQ Chicken Wings",
    "BBQ Ranch", "Black Olives", "Buffalo Chicken (Thin - Pan - NY)", "Buffalo Chicken Wings", "Buffalo Chicken",
    "Buffalo Mac & Cheese", "Buffalo Ranch", "Cheese", "Cheesy Garlic Bread", "Chicken", "Chili Flakes", "Classic Crispy Chicken",
    "Classic Pepperoni Pizza (Thin - Pan - NY)", "Classic Pepperoni", "Cheesy Crust", "Cheesy Jalapeno Crust", "Cookie",
    "Cool Ranch", "Chicken Alfredo Pizza", "Alfredo Pasta", "Diet Pepsi", "Duo Combo", "Everything (Thin - Pan - NY)",
    "Supreme (Everything)", "Fresh Mushroom", "Garlic Bread", "Green Capsicum", "Green Pepper", "Group 1 - Good for 2",
    "Group 2 - Good for 2-3", "Group 3 - Good for 3-4", "Group 4 - Good for 3", "Group 6 - Good for 3-4", "Group 7 - Good for 2",
    "Honey Mustard Ranch", "Jalapeno", "Kinza Citrus", "Kinza Cola", "Kinza Diet Cola", "Kinza Diet Lemon", "Kinza Lemon",
    "Kinza Orange", "Ketchup", "Large Half and Half", "Large NY Buffalo Chicken", "Large NY Classic Crispy Chicken",
    "Large NY Classic Pepperoni", "Large NY Everything", "Large NY Margherita", "Large NY MeatLover", "Large NY Pesto",
    "Large NY Soho", "Large NY Spicy Crispy Chicken", "Large NY Tornado Crispy Chicken", "Large NY Veggie", "Large NY Yelo Pepperoni",
    "Loaded Wedges", "Long Pizza & Wedges", "Long Pizza & Drink", "Long Pizza & Garlic Bread", "Mac & Cheese", "Margharita",
    "Margherita Pizza (Thin - Pan - NY)", "Margherita", "Meat Balls", "Meat Lovers (Thin - Pan - NY)", "Meat Lovers",
    "Medium Half and Half", "Medium NY Buffalo Chicken", "Medium NY Margherita", "Medium NY Pepperoni", "Mineral Water",
    "Mirinda", "Mountain Dew", "Mushroom", "New York Large (Classic)", "New York Large", "New York Medium (Classic)",
    "New York Medium", "NY Buffalo Chicken", "NY Classic Crispy Chicken", "NY Classic Pepperoni", "NY Everything", "NY Eveything",
    "NY Margherita", "NY MeatLover", "NY Medium Buffalo Chicken", "NY Medium Classic Crispy Chicken", "NY Medium Classic Pepperoni",
    "NY Medium Everything", "NY Medium Margherita", "NY Medium Meat Lovers", "NY Medium Pepperoni", "NY Medium Spicy Crispy Chicken",
    "NY Medium Tornado Crispy Chicken", "NY Medium Veggie", "NY Medium Yelo Pepperoni", "NY Pepperoni", "NY Pesto", "NY Soho",
    "NY Spicy Crispy Chicken", "NY Tornado Crispy Chicken", "NY Veggie", "NY Yelo Pepperoni", "NY Yelo Peppperoni",
    "Mushroom Truffle", "Olives", "One for All", "Onion", "Pan Buffalo Chicken", "Pan Classic Crispy Chicken", "Pan Everything",
    "Pan Margherita", "Pan MeatLover", "Pan Medium", "Pan Pepperoni", "Pan Pesto", "Pan Soho", "Pan Spicy Crispy Chicken",
    "Pan Tornado Crispy Chicken", "Pan Veggie", "Pepperoni Garlic Bread", "Pepperoni", "Pepsi Diet", "Pepsi Zero", "Pepsi",
    "Pesto Garlic Bread", "Pesto Pizza (Thin - Pan - NY)", "Pesto Ranch Sauce", "Pesto Ranch", "Pesto", "Potato Wedges",
    "Red Capsicum", "Ranch Supreme", "Seen Jeem Long Pizza", "Shani", "Shredded Mozzarella Cheese", "Skinny Ranch", "Soft Drinks",
    "Soho Pizza (Thin - Pan - NY)", "Soho", "HOT WHEELS™ Kids Meal Chicken Chunks", "HOT WHEELS™ Kids Meal Pepperoni",
    "HOT WHEELS™ Kids Meal Margarita", "Small Pan Margarita", "Small NY Margarita", "Small Pan Pepperoni", "Small NY Pepperoni",
    "KDD Apple juice", "KDD Orange Juice", "Solo 1 - Good for 1", "Solo 2 - Good for 1-2", "Solo 4 - Good for 1", "Spicy Crispy Chicken",
    "Spicy Ranch", "Spicy Chipotle Bacon Pizza", "Peri Peri Ranch Chicken Pizza", "Spicy Honey Pepperoni Pizza", "Summer Saver Box",
    "Sweet Honey Bacon", "Thin Crust Buffalo Chicken", "Thin Crust Classic Crispy Chicken", "Thin Crust Everything",
    "Thin Crust Margharita", "Thin Crust Meat Lover", "Thin Crust Medium (New)", "Thin Crust Medium Buffalo Chicken",
    "Thin Crust Medium Everything", "Thin Crust Medium Margharita", "Thin Crust Medium Pepperoni", "Thin Crust Medium Pesto",
    "Thin Crust Medium Soho", "Thin Crust Medium Veggie", "Thin Crust Pepperoni", "Thin Crust Pesto", "Thin Crust Soho",
    "Thin Crust Spicy Crispy Chicken", "Thin Crust Tornado Crispy Chicken", "Thin Crust Veggie", "Tomato", "Tornado Crispy Chicken",
    "Truffle Ranch", "Veggie Pizza (Thin - Pan - NY)", "Veggie", "Yelo Pepperoni Pizza (NY)", "Yelo Pepperoni"
  ],
  "chili": [
    "Qortuba Burger", "Yard Slider", "Hawally Special", "Chili Fries", "Spicy Wings", "Classic Chili", "Cheese Chili",
    "Jalapeno Poppers", "Onion Rings", "Soft Drink", "Water"
  ],
  "bbt": [
    "7up", "Aquafina Water", "3.5KD Deal", "BBQ Sauce", "BBT Mayo", "BBT Ranch Sauce", "BBT Sauce", "Buttercup", "Cheese Dip",
    "CLASSIC ROLLS BEEF", "CLASSIC ROLLS BEEF Meal", "Cheeseburger Duo Combo", "Chicken Fillaaa", "Chicken Fillaaa Meal",
    "Chicken Nugget Meal", "Chicken Nuggets", "Chili Lime", "Chilli Lime Old Skool", "Chilli Lime Supreme", "Chilli Lime Old Skool Meal",
    "Chilli Lime Supreme Meal", "Chilli Lime Tenders Fillaaa (New)", "Classic Old Skool", "Classic Supreme", "Classic Old Skool Meal",
    "Classic Supreme Meal", "Coleslaw", "Crispy Fries", "Curly Fries", "Extra 1pc Tenders", "Extra 1pc Toast", "Extra Cheese",
    "Extra Coleslaw", "Extra Sauce", "Fillaaa Sauce", "FILAAA PARTY", "French Fries", "Fries", "Honey Mustard", "Kinza Cola",
    "Kinza Diet Cola", "Kinza Diet Lemon", "Kinza Lemon", "Kinza Orange", "Lipton Ice Tea - Lemon Zero", "Lipton Ice Tea - Peach Zero",
    "Lipton Ice Tea - Red Fruits Zero", "Lipton Ice Tea - Tropical Zero", "Little Cheeseburger", "Little Chicken Burger",
    "Little Chicken Burger Duo Combo", "Little Wrap Fillaaa Meal", "Little Wrap Fillaaa Duo Combo", "Little Wrap Fillaaaa",
    "Messy Fries", "Miranda", "Mirinda", "Mountain Dew", "Nesqiuk", "Nuggets", "Nuggets Duo Combo", "Oreo Madness", "Peanut Butter",
    "Pepsi", "Pepsi Zero", "Quarter Pounder Burger", "Quarter Pounder Meal", "Schnitzel x Burger", "Schnitzel X Meal", "Salt",
    "SMOKEY ROLLS BEEF", "SMOKEY ROLLS BEEF Meal", "Shani", "Southwest Burger", "Southwest Meal", "Salt n Vinegar Tenders Fillaaa",
    "\"Not So Ranch\" Sauce", "Strawberry", "Sweet Chili", "Suuuper Beef", "Suuuper Beef Combo", "Suuuper Chicken", "Suuuper Chicken Combo",
    "Tang", "Tenders Fillaaa", "Toast", "Triple X", "Triple X Box", "TRIPLE X Meal", "Water", "Westcoast Burger", "Westcoast Meal",
    "Kidkit Little chicken", "Kidkit Little Cheese Burger", "Kidkit Chicken Nuggets", "XL Fillaaa Sauce"
  ],
  "Slice": [
    "2 7up", "2 7up Zero Sugar", "2 Aquafina Water", "2 Kinza Citrus", "2 Kinza Cola", "2 Kinza Diet Cola", "2 Kinza Diet Lemon",
    "2 Kinza Lemon", "2 Kinza Orange", "2 Mirinda", "2 Pepsi", "2 Pepsi Diet", "2 Shani", "4 7up", "4 7up Zero Sugar",
    "4 Aquafina Water", "4 Fries", "4 Kinza Citrus", "4 Kinza Cola", "4 Kinza Diet Cola", "4 Kinza Diet Lemon", "4 Kinza Lemon",
    "4 Kinza Orange", "4 Mirinda", "4 Pepsi", "4 Pepsi Diet", "4 Shani", "7up", "7up Zero Sugar", "8 Fries", "Aquafina Water",
    "BBQ Sauce", "Beef", "Beef & Chicken", "Caesar Sauce", "Caramel Feuille", "Ceasar Sauce", "Cheese Bites", "Chicken",
    "Classic Fries", "Combo Box 12 Pcs", "Combo Box 24 Pcs", "Create Your Own Doner", "Create Your Own Meal Doner",
    "Create Your Own Meal Slicer", "Create Your Own Rice Bowl", "Create Your Own Salad", "Create Your Own Slicer", "Crispy Onion",
    "Crispy Onions", "Extra Beef", "Extra Chicken", "Garlic Mayo", "Hot Sauce", "KDD Apple & Rasberry (0% Sugar & Calories)",
    "KDD Cocktail (0% Sugar & Calories)", "KDD Lemon & Mint Mojito (0% Sugar & Calories)", "KDD Mango & Peach (0% Sugar & Calories)",
    "Kids Meal", "Kinza Citrus", "Kinza Cocktail", "Kinza Cola", "Kinza Diet Cola", "Kinza Diet Lemon", "Kinza Lemon", "Kinza Lift Up",
    "Kinza Orange", "Lettuce", "Lipton Ice Tea - Lemon Zero", "Lipton Ice Tea - Peach Zero", "Lipton Ice Tea - Red Fruits Zero",
    "Lipton Ice Tea - Tropical Zero", "Mirinda", "Mountain Dew", "No Sauce", "No Vegetables", "Onion", "Parmesan Caesar",
    "Parmesan Caesar Doner", "Parmesan Caesar Slicer", "Parmesan Ceasar Doner", "Pepsi", "Pepsi Diet", "Pickles", "Pita", "Pita Doner",
    "Pita Slicer", "Purple Cabbage", "Roasted Doner", "Roasted Sauce", "Roasted Signature Doner", "Roasted Slicer", "Saj", "Saj Doner",
    "Saj Slicer", "Sauces", "Seasoned Fries", "Shani", "Signature Fries", "Signature Sauces", "Slice Combo", "Special Sauce",
    "Spicy Doner", "Spicy Ranch", "Spicy Signature Doner", "Spicy Signature Sauce", "Spicy Slicer", "Tahina Sauce", "Tomatos",
    "Unseasoned Fries", "Vodavoda Water", "White Ranch", "Without Crispy Onion", "Without Seasoning", "Without Spicy Ranch",
    "Without White Ranch", "Yoghurt Sauce"
  ],
  "pattie": [
    "(5Pcs) 4pcs Happy Nuggets Pattie", "(5Pcs) Aquafina Water", "(5Pcs) Capri Sun Apple", "(5Pcs) Capri Sun Orange",
    "(5Pcs) Classic Pattie", "(5Pcs) Crispy Chicken Pattie", "(5Pcs) Mirinda", "(5Pcs) Pattie Pattie", "(5Pcs) Pepsi",
    "(5Pcs) Pepsi Zero", "10 Pcs Nuggets", "12 Slider Combo", "12 Sliders", "2 Fries", "3.5KD Deal", "2 Pcs Of Beef Crunch",
    "2 Pcs Of Cheesestake Pattie", "2 Pcs Of Chicken Bites", "2 Pcs Of Classic Pattie", "2 Pcs Of Crispy Chicken Pattie",
    "2 Pcs Of Honey Mustard", "2 Pcs Of Onion Rings", "2 Pcs Of Pattie Pattie", "2 Pcs Of Pattie Pattie Mayo",
    "2 Pcs Of Pattie Pattie Sauce", "2 Pcs Of Ranch", "2 Pcs Of Spicy Chicken Pattie", "2 Pcs Of Sweet Bacon Pattie",
    "2 Pcs Of Sweet Chili", "2 Pcs Of Truffle Mushroom Pattie", "24 Slider Combo", "24 Sliders", "3 Pcs Of Cheesestake Pattie",
    "3 Pcs Of Classic Pattie", "3 Pcs Of Crispy Chicken", "3 Pcs Of Pattie Pattie", "3 Pcs Of Spicy Chicken", "3 Pcs Of Sweet Bacon",
    "3 Pcs Of Sweet Bacon Pattie", "3 Pcs Of Truffle Mushroom", "3 Pcs Of Truffle Mushroom Pattie", "5 Pcs Nuggets",
    "6 Pcs Of Cheesestake Pattie", "6 Pcs Of Classic Pattie", "6 Pcs Of Crispy Chicken", "6 Pcs Of Pattie Pattie", "6 Pcs Of Spicy Chicken",
    "6 Pcs Of Sweet Bacon", "6 Pcs Of Truffle Mushroom", "6 Pcs Of Truffle Mushroom Pattie", "6 Slider Combo", "7up", "Aquafina Water",
    "Beef Crunch", "Capri-sun juice apple", "Capri-sun juice orange", "Cheesesteak Pattie Slider", "Chicken Bites", "Chicken Nuggets",
    "Chicken Slider Combo", "Classic Pattie", "Classic Pattie Slider", "Crispy Chicken", "Crispy chicken nuggets (4 pcs)",
    "Crispy Chicken Pattie Slider", "Family Fries", "Fries", "Happie Nuggets Pattie", "Happie Pattie Party Pack", "Happie Slider Pattie",
    "Honey Mustard", "Jalapeno Cheese Nuggets", "Kinza cola", "Kinza diet cola", "Kinza diet lemon", "Kinza lemon",
    "Lipton Ice Tea - Lemon Zero", "Lipton Ice Tea - Peach Zero", "Lipton Ice Tea - Red Fruits Zero", "Lipton Ice Tea - Tropical Zero",
    "Nashville Chicken Slider", "Nashville Chicken Bites", "Nashville Loaded Fries", "Curly Fries", "Cookies", "Marinara", "Mirinda",
    "Mountain Dew", "Onion Rings", "Pattie Fries", "Pattie Pattie", "Pattie Pattie Mayo", "Pattie Pattie Sauce", "Pattie Pattie Slider",
    "Pepsi", "Pepsi Diet", "Pepsi Zero", "Ranch", "Shani", "Solo Feast", "Solo Meal", "Spiced Corn", "Spicy Chicken Pattie Slider",
    "Sweet Bacon Slider", "Sweet Chili", "The Original", "The Trio", "Truffle Mushroom Pattie Slider", "Water",
    "Crispy Chicken Pattie Slider PLUS+", "Spicy Chicken Pattie Slider PLUS+", "Nashville Chicken slider PLUS+",
    "Cheesesteak Pattie Slider PLUS+", "Classic Pattie Slider PLUS+", "Sweet Bacon Slider PLUS+", "Truffle Mushroom Pattie Slider PLUS+",
    "Pattie Pattie slider PLUS+"
  ],
  "Just c": [
    "Avocado", "Bacon", "BBQ Box", "BBQ Burger", "BBQ Sauce", "BBQ Slider", "Beef patty ( 100 gm )", "Beef patty ( 140 gm )",
    "Big C Burger", "C - Fries", "C- Sauce", "Cheddar Cheese", "Classic Burger", "Classic Chicken Burger", "Classic Chicken Slider",
    "Classic Meal Combo", "Classic Slider", "Crispy Cheese", "DOUBLE DECKER SESAME BUN", "Epsa Iced Tea - Lemon", "Epsa Iced Tea - Peach",
    "Epsa Iced Tea - Pink Lemonade", "Honey Mustard Sauce", "Jarritos Guava", "Jarritos Lime", "Jarritos Mandarin", "Jarritos Mexican Cola",
    "Just C Meal", "Lipton Ice Tea - Lemon Zero", "Lipton Ice Tea - Peach Zero", "Lipton Ice Tea - Red Fruits Zero",
    "Lipton Ice Tea - Tropical Zero", "Mapple Sauce", "Mirinda", "Mountain Dew", "Mushroom Burger", "Mushroom Slider", "Pepsi",
    "Pepsi Diet", "POTATO BUN", "Provolone Cheese", "SESAME BUN", "Shani", "SLIDER POTATO", "SLIDER SESAME", "Special Chicken Slider",
    "Spical Chicken ( Moderately Spicy )", "Truffle Aioli Sauce", "Truffle Burger", "Truffle Slider", "Vodavoda Water", "Ziggy Fries",
    "Ziggy Fries With Cheese"
  ],
  "Mishmash": [
    "Beef Philly Steak Samoon", "3.5KD Deal", "Tenders 5pc Combo", "Double Puri", "Chicken Bites Wrap", "Chicken Caesar wrap",
    "Musahab wrap", "Chicken Philly Steak Samoon", "Kabab Samoon", "Mushroom Steak Samoon", "Shabah Samoon", "Tawook Samoon",
    "Chicken Tenders", "Telyani Samoon", "BBQ Burger", "Cheeseburger", "Creamy Mushroom Burger", "Cheesy Puri", "Classic Puri",
    "Spicy Puri", "Chicken Puri feast", "Classic Chicken Fillet", "Chick-Spicy Fillet", "Buffalo Chicken Fillet", "Grilled Chicken Burger",
    "Beef Philly Steak Sandwich", "Chicken Philly Steak Sandwich", "Mishmash Quesadilla", "Grilled Chicken Quesadilla",
    "Toasted Grill’d Chicken", "Toasted Cheeseburger", "Toasted BBQ Burger", "Toasted Mushroom Burger", "Beef Kabab (Regular)",
    "Beef Kabab (Healthy)", "Khishkhash Beef Kabab (Regular)", "Khishkhash Beef Kabab (Healthy)", "Shish Tawouk (Regular)",
    "Shish Tawouk (Healthy)", "Tikka Tenderloin (Regular)", "Tikka Tenderloin (Healthy)", "Mix Grills (Regular)", "Mix Grills (Healthy)",
    "Classic Arayis", "Arayis with Cheese", "Chicken Grills (Regular)", "Chicken Grills (Healthy)", "Half Deboned Chicken (Regular)",
    "Half Deboned Chicken (Spicy)", "Half Deboned Chicken (Healthy Regular)", "Half Deboned Chicken (Healthy Spicy)",
    "Deboned Chicken (Whole) (Regular)", "Deboned Chicken (Whole) (Spicy)", "Deboned Chicken (Whole) (Healthy Regular)",
    "Deboned Chicken (Whole) (Healthy Spicy)", "Beef Steak Tenderloin Rice Bowl", "Chicken Rice Bowl", "Grilled Tenderloin Steak Bowl",
    "Grilled Chicken Steak Bowl", "Grilld Chic Bowl", "Grilld Tawouk Bowl", "Grilld Tikka Bowl", "Burghul Super Bowl",
    "Lettuce Super Bowl", "Beef Shawarma", "Chicken Shawarma", "Kabab Grilled Wrap", "Khishkhash Grilled Wrap", "Tawouk Grilled Wrap",
    "Original Fries", "Cheese Fries", "Mishmash Fries", "MxS Shrimp Wrap", "MxS Dynamite Shrimp", "Philly Steak Fries", "Chicken Bites",
    "Buffalo Bites", "Chicken Wings (Grilled)", "Chicken Wings (Bufflo)", "Chicken Wings (BBQ)", "Jalapeno Bites", "Onion Rings",
    "Chicken Caesar Salad", "Peanut Butter Coleslaw", "Hummus", "Mutabbal", "Tabboulah", "Plain Rice", "Plain Burghul", "Mishmash Bread",
    "Hoagie Rolls", "Pumpkin Burger Bun", "Appetizer Feast", "Chicken Grilld Feast", "Mishmash Feast", "Chicken Feast",
    "Chicken Burger Feast", "Beef Burger Feast", "Medium Grills Feast", "Large Grills Feast", "Philly Steak Feast", "Shawarma Feas",
    "Char-Grilled Wraps Feast", "Buffalo Sauce", "Caeser Sauce", "Cheese Sauce", "Chick-Spicy Sauce", "Garlic Sauce",
    "Honey Mustard Sauce", "Ketchup", "Ketchup And Mayonnaise", "Khishkhash Sauce", "Pepper Sauce", "Ranch Sauce", "Real Mayonnaise",
    "Slimmed Sour Cream", "Special BBQ Sauce", "Spicy Ranch Sauce", "Tahini Sauce", "Vinaigrette Sauce", "Coca Cola", "Coca Cola Light",
    "Coca Cola Zero", "Sprite", "Sprite Zero", "Alsi Cola", "Alsi Cola Zero", "Mineral Water", "Fresh Lemon With Mint Juice",
    "Fresh Orange Juice", "Vimto", "Belgian Chocolate Cookie", "Angus Beef Burger BBQ Plate", "Chicken Breast BBQ Plate",
    "Chopped Tenderloin Steak BBQ Plate", "Chopped Chicken Steak BBQ Plate", "Tikka Tenderloin BBQ Plate", "Shish Tawouk BBQ Plate",
    "Beef Kabab BBQ Plate", "Meat Arayis BBQ Plate", "BBQ Arayis with Cheese", "Vegetables Plate BBQ", "Char-Grills BBQ Box",
    "Beef Burger BBQ Box", "Chicken Burger BBQ Box", "Tenderloin Steak BBQ Box", "Chicken Steak BBQ Box", "Chicken Bites Wrap"
  ],
  "Table": [
    "Eggplant Fattah", "Grilled Wings", "Roasted Potato Fingers", "Tabel™ Batata Harra", "Tabel™ Grape Leaves", "Hummus", "3.5KD Deal",
    "Tabel™ Hummus", "Kabab Coconut Curry Bowl", "Tawook Coconut Curry Bowl", "Tawook Bowl combo", "Deboned Chicken Family Box",
    "Beef Hummus", "Farm Salad", "Chef Salad", "Creamy Tawook Hamsa", "Halloumi Tomato Hamsa", "Tikka Mushroom Hamsa",
    "Tikka Tomato Hamsa", "Fattoush", "Tabboulah", "Mutabbal", "Muhammarah", "Yogurt Salad", "Organic Brown Rice", "Tabel™ Bread",
    "Roasted Pumpkin Soup", "Tabel™ Tahini- 150 Ml", "Tabel™ Spicy Tahini- 150 Ml", "Brown Rice Wholesome Bowl",
    "Quinoa & Brown Rice Wholesome Bowl", "Quinoa Wholesome Bowl", "Veggies Wholesome Bowl", "Herbs Tawouk & Chimichurri Pesto Rice Bowl",
    "Herbs Tawouk & Karaz Rice Bowl", "Herbs Tawouk & Khishkhash Rice Bowl", "Herbs Tawouk & Mushroom Rice Bowl",
    "Herbs Tawouk & Tahini Rice Bowl", "Herbs Tawouk Rice Bowl without sauce", "Kabab & Chimichurri Pesto Rice Bowl",
    "Kabab & Karaz Rice Bowl", "Kabab & Khishkhash Rice Bowl", "Kabab & Mushroom Rice Bowl", "Kabab & Tahini Rice Bowl",
    "Kabab Rice Bowl without sauce", "Tawouk & Chimichurri Pesto Rice Bowl", "Tawouk & Karaz Rice Bowl", "Tawouk & Khishkhash Rice Bowl",
    "Tawouk & Mushroom Rice Bowl", "Tawouk & Tahini Rice Bowl", "Tawouk Rice Bowl without sauce", "Tenderloin & Chimichurri Pesto Rice Bowl",
    "Tenderloin & Karaz Rice Bowl", "Tenderloin & Khishkhash Rice Bowl", "Tenderloin & Mushroom Rice Bowl", "Tenderloin & Tahini Rice Bowl",
    "Tenderloin Rice Bowl without sauce", "Herbs Tawook Coconut Curry Bowl", "Tenderloin Coconut Curry Bowl", "Chimichurri Pesto \"Mangoo3\"",
    "Karaz \"Mangoo3\"", "Khishkhash \"Mangoo3\"", "Mushroom \"Mangoo3\"", "Tahini \"Mangoo3\"", "Half Grilled Chicken (Regular)",
    "Grilled Half Grilled Chicken (Spicy)", "Whole Grilled Chicken (Regular)", "Whole Grilled Chicken (Spicy)", "Herbs Tawouk",
    "Shish Tawouk", "Kabab", "Khishkhash Kabab", "Tenderloin Tikka", "Mixed Grills", "Beef Arayis", "Beef Arayis With Cheese",
    "Mix Arayis", "\"Mangoo3\" Goodness Box", "Appetizer Goodness Box", "Brown Rice Goodness Box", "Chargrilled Wraps Goodness Box",
    "Shawarma Goodness Box", "Fam Goodness Box", "Gathering Goodness Box", "Beef Shawarma", "Chicken Shawarma", "Grilled Halloumi wrap",
    "Herbs Tawouk Wrap", "Tabel Tawouk Wrap", "Khishkhash Kabab Wrap", "Mutabbal Kabab Wrap", "Chimichurri Pesto", "Garlic Chimmichuri",
    "Garlic Sauce", "Khishkhash Sauce", "Mushroom Sauce", "Tabel™ Karaz Sauce", "Tabel™ Sauce", "Tabel™ Spicy Sauce", "Tabel™ Tahini",
    "Tabel™ Spicy Tahini", "Alsi Cola", "Alsi Cola Zero", "Carbonated Water", "Lemon Falvor Carbonated Water",
    "Strawberry Flavor Carbonated Water", "Mineral Water", "Mint Lemonade", "Orange Juice", "Creamy Choconafa",
    "Creamy Choconafa Goodness Box"
  ],
  "FM": [
    "Guacamole Egg Tacos", "3.5KD Deal", "Turkish Egg Tacos", "Bacon & Egg Muffin", "FM Egg Muffin", "FM Breakfast",
    "Breakfast Cheese Platter", "Spanish Omlette", "Egg Avocado Platter", "Vanilla Pancake", "Crispy airBaked™ Chicken Katsu",
    "Grilled Lemon Chicken", "Chicken Fajita Pasta", "Steak With Mushroom Sauce", "Truffle Chicken Pasta", "Spaghetti Bolognese",
    "Zucchini Beef Lasagna", "Chicken Machboos", "Peri Peri Chicken", "Mongolian Beef", "Shrimp Spaghetti", "Dijon Chicken Pasta",
    "Maqlouba", "Short Ribs Tacos", "Shish Tawook with Batata Harra", "Short Ribs & Mash", "Kung Pao Chicken", "Butter Chicken",
    "Black Pepper Beef", "Murabyan", "Chicken Pink Pasta", "Zucchini Chicken Lasagna", "Burgers", "proPatty™ Fhopper",
    "proPatty™ Big FM", "airBaked™ Chicken Foyale", "airBaked™ Fwister", "airBaked™ FM Chicken", "proPatty™ FM Burger with Fries",
    "proPatty™ Double Cheese Burger with Fries", "airBaked™ Chicken Burger with Fries", "proPatty™ FM Burger with Sweet Potato Fries",
    "proPatty™ Double Cheese Burger with Sweet Potato Fries", "airBaked™ Chicken Burger with Sweet Potato Fries", "proPatty™ FM Burger",
    "proPatty™ Double Cheese Burger", "Mushroom proPatty™ Burger", "airBaked™ Chicken Burger", "airBaked™ Chicken Supreme Burger",
    "Spicy slaw airBaked™ Chicken Burger", "Spicy airBaked™ Supreme Burger", "Burrata Sandwich", "Halloumi Sandwich", "Club Sandwich",
    "Turkey Pesto Sandwich", "Chicken Shawarma Wrap", "Beef Shawarma Wrap", "Grilled Chicken Quesadillas", "Philly Cheesesteak",
    "Beef Burrito", "Chicken Burrito", "Chicken Philly Sandwich", "Mozzarella Pesto Sandwich", "Mushroom Egg Wrap",
    "Lil airBaked™ Chicken Burger", "Lil proPatty™ Cheese Burger", "Mini Spaghetti Bolognese", "Mini airBaked™ Chicken Wrap",
    "Mini airBaked™ Chicken Nuggets", "Couscous Beetroot Tabbouleh", "Mini Fattoush", "Mini Asian Chicken Salad", "Mini Italian Salad",
    "Mini Chicken Caesar Salad", "Quinoa Salad", "Crisp Garden Salad", "Rocca Feta Salad", "Mexican Salad", "Chicken Caesar Salad",
    "Asian Salad", "Fattoush", "Asian Chicken Bowl", "Steak Rice Bowl", "Chicken Shawarma Bowl", "Mushroom Steak Bowl",
    "Beef Shawarma Bowl", "Beef Shawarma Side", "Chicken Fajita Side", "Chicken Shawarma", "Jasmine Rice", "Mini airBaked™ Chicken Nuggets",
    "airBaked™ Fries", "airBaked™ Potato Wedges", "Messy airBaked™ Fries", "airBaked™ Sweet Potato Fries", "Batata Harra",
    "airBaked™ Nashville Hot Chicken Bites", "airBaked™ Buffalo Shrimp Bites", "Lentil Soup", "Mushroom Soup", "Jareesh",
    "Mini Grilled Corn", "Hummus", "Lotus Oats", "Mango Yogurt", "Beetroot Pot", "Edamame", "Veggies Crudités", "Chocolate Oats",
    "Triple Berry Oats", "Berry Parfait", "Pro Chips Sea Salt & Vinegar", "Pro Puffs Spicy Pizza", "Pro Puffs Cheese", "Pro Puffs Spicy",
    "Pro Puffs Chili Lemon", "Pro Chips Sweet Chili", "Spicy Mexican Mayo", "Tahina", "Guacamole", "Light Smoke House", "Light Ranch",
    "Light Honey Mustard", "Big FM Sauce", "Fwister Sauce", "Light Mayo Sauce", "Ketchup", "Tropical Fruits", "Classic Fruit Salad",
    "Exotic Fruit Salad", "Seasonal Fruit Salad", "Fresh Pomegranate", "Red Grapes", "Roasted Coconut Truffle", "Pistachio Chocolate Bite",
    "Pecan Turtle", "Peanut Bites", "Snickers Bar", "Peanut Butter Protein Bar", "Hazelnut Protein Bar", "Salted Caramel Protein Bar",
    "Pecan cheesecake", "Mini Peanut Butter Bite", "Salted Pecan Bites", "Mango Zest", "Orange Citrus", "Watermelon Lemonade",
    "Pomade", "Sparkling Water", "Pepsi Diet", "Pepsi Zero Sugar", "7up Zero Sugar", "Voda Voda water 330 ml", "Kinza Diet Cola",
    "Kinza Zero Lemon", "Vanilla Protein shake", "Chocolate Protein Shake", "Matcha Protein Shake", "Spanish Latte", "Cold Brew",
    "Classic Latte", "Vanilla Protein Latte", "Zing Shot", "Energy Shot", "Immunity Shot", "Heart Beet Shot", "MATAFI airBaked™ Supreme",
    "MATAFI airBaked™ Chicken", "MATAFI Loaded airBaked™ Fries", "MATAFI airBaked™ Chicken Wrap", "Super Dandash Salad",
    "airBaked™ Giant Nugget Original", "airBaked™ Giant Nugget Sandwich", "airBaked™ Giant Nugget Keto", "Super Grilled Chicken",
    "Super airBaked™ Chicken", "Super Beef Shawarma", "Super Chicken Shawarma", "Super Grilled Shrimp", "Super Herb Salmon",
    "Super Sous-Vide Steak", "Sweet & Sour Chicken Bowl", "Salmon & Dill Rice", "Pepperoni Pizza", "Chicken Ranch Pizza",
    "Classic Margherita Pizza", "Halal Girls proSauce™", "Beetroot proSauce™", "MATES Hazelnut Protein Bar",
    "MATES Peanut Butter Protein Bar", "Snickers HiProtein Bar", "Snickers White HiProtein Bar", "Chipotle proSauce™",
    "Avo-Lime proSauce™", "Golden Mustard proSauce™"
  ]
};

  const fieldNames = [
    "Category Name (EN)", "Product Name (EN)", "Description (EN)", "Price",
    "Category Name (AR)", "Product Name (AR)", "Description (AR)", "Ingredients"
  ];
  const fieldIdMap: Record<string, number> = {};
  for (const name of fieldNames) {
    const field = await db.get("SELECT id FROM dynamic_fields WHERE name_en = $1", [name]) as { id: number } | undefined;
    if (field) fieldIdMap[name] = field.id;
  }

  for (const [brandName, items] of Object.entries(productSeedingData)) {
    const brand = await db.get("SELECT id FROM brands WHERE name = $1", [brandName]) as { id: number };
    if (brand) {
      for (const itemName of items) {
        const productNameFieldId = fieldIdMap["Product Name (EN)"];
        if (!productNameFieldId) continue;

        const exists = await db.get(`
          SELECT p.id 
          FROM products p 
          JOIN product_field_values fv ON p.id = fv.product_id 
          WHERE p.brand_id = $1 AND fv.field_id = $2 AND fv.value = $3
        `, [brand.id, productNameFieldId, itemName]) as { id: number } | undefined;
        
        let productId: number;
        
        if (!exists) {
          const result = await db.query("INSERT INTO products (brand_id, created_by) VALUES ($1, $2) RETURNING id", [brand.id, 1]); // Admin user
          productId = result.rows[0].id;
        } else {
          productId = exists.id;
        }
        
        const category = getCategory(itemName);
        const description = getDescription(itemName);
        const price = getPrice();
        const ingredients = `Sample ingredients for ${itemName}: Flour, Water, Salt, and Secret Spices.`;

        const values = [
          { name: "Category Name (EN)", val: category.en },
          { name: "Product Name (EN)", val: itemName },
          { name: "Description (EN)", val: description.en },
          { name: "Price", val: price },
          { name: "Category Name (AR)", val: category.ar },
          { name: "Product Name (AR)", val: itemName }, // Using EN name as fallback for AR
          { name: "Description (AR)", val: description.ar },
          { name: "Ingredients", val: ingredients }
        ];

        for (const v of values) {
          const fieldId = fieldIdMap[v.name];
          if (fieldId) {
            // Check if value already exists for this field
            const valueExists = await db.get("SELECT 1 FROM product_field_values WHERE product_id = $1 AND field_id = $2", [productId, fieldId]);
            if (!valueExists) {
              await db.query("INSERT INTO product_field_values (product_id, field_id, value) VALUES ($1, $2, $3)", [productId, fieldId, v.val]);
            }
          }
        }

        // Add sample modifiers if none exist
        const modifierExists = await db.get("SELECT 1 FROM modifier_groups WHERE product_id = $1", [productId]);
        if (!modifierExists) {
          if (category.en === "Pizza") {
            const groupResult = await db.query("INSERT INTO modifier_groups (product_id, name_en, name_ar, selection_type, is_required, min_selection, max_selection) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id", [productId, "Crust Type", "نوع العجينة", "single", 1, 1, 1]);
            const groupId = groupResult.rows[0].id;
            await db.query("INSERT INTO modifier_options (group_id, name_en, name_ar, price_adjustment) VALUES ($1, $2, $3, $4)", [groupId, "Thin Crust", "عجينة رقيقة", 0]);
            await db.query("INSERT INTO modifier_options (group_id, name_en, name_ar, price_adjustment) VALUES ($1, $2, $3, $4)", [groupId, "Pan Pizza", "بان بيتزا", 0.5]);
            await db.query("INSERT INTO modifier_options (group_id, name_en, name_ar, price_adjustment) VALUES ($1, $2, $3, $4)", [groupId, "Cheesy Crust", "عجينة محشوة بالجبن", 1.0]);
          } else if (category.en === "Burgers") {
            const groupResult = await db.query("INSERT INTO modifier_groups (product_id, name_en, name_ar, selection_type, is_required, min_selection, max_selection) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id", [productId, "Extra Toppings", "إضافات", "multiple", 0, 0, 3]);
            const groupId = groupResult.rows[0].id;
            await db.query("INSERT INTO modifier_options (group_id, name_en, name_ar, price_adjustment) VALUES ($1, $2, $3, $4)", [groupId, "Extra Cheese", "جبنة إضافية", 0.250]);
            await db.query("INSERT INTO modifier_options (group_id, name_en, name_ar, price_adjustment) VALUES ($1, $2, $3, $4)", [groupId, "Beef Bacon", "لحم بقري مقدد", 0.500]);
            await db.query("INSERT INTO modifier_options (group_id, name_en, name_ar, price_adjustment) VALUES ($1, $2, $3, $4)", [groupId, "Jalapenos", "هالبينو", 0.150]);
          } else if (category.en === "Drinks") {
            const groupResult = await db.query("INSERT INTO modifier_groups (product_id, name_en, name_ar, selection_type, is_required, min_selection, max_selection) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id", [productId, "Size", "الحجم", "single", 1, 1, 1]);
            const groupId = groupResult.rows[0].id;
            await db.query("INSERT INTO modifier_options (group_id, name_en, name_ar, price_adjustment) VALUES ($1, $2, $3, $4)", [groupId, "Small", "صغير", 0]);
            await db.query("INSERT INTO modifier_options (group_id, name_en, name_ar, price_adjustment) VALUES ($1, $2, $3, $4)", [groupId, "Medium", "وسط", 0.250]);
            await db.query("INSERT INTO modifier_options (group_id, name_en, name_ar, price_adjustment) VALUES ($1, $2, $3, $4)", [groupId, "Large", "كبير", 0.500]);
          }
        }
      }
    }
  }

  // Seed Call Center Platforms
  const platformCountResult = await db.get("SELECT COUNT(*) as count FROM call_center_platforms") as { count: string | number };
  const platformCount = parseInt(platformCountResult.count.toString());
  if (platformCount === 0) {
    const platforms = [
      { en: "Deliveroo", ar: "دليفرو" },
      { en: "Talabat", ar: "طلبات" },
      { en: "Jahez", ar: "جاهز" },
      { en: "Hungerstation", ar: "هنجرستيشن" },
      { en: "Careem", ar: "كريم" },
      { en: "Call Center", ar: "كول سنتر" },
      { en: "Direct Call", ar: "اتصال مباشر" },
      { en: "Web Site", ar: "الموقع الإلكتروني" },
      { en: "V-thru", ar: "في-ثرو" },
      { en: "Keeta", ar: "كيتا" }
    ];
    for (const p of platforms) {
      await db.query("INSERT INTO call_center_platforms (name_en, name_ar) VALUES ($1, $2)", [p.en, p.ar]);
    }
  }

  // Seed Call Center Case Types
  const caseTypeCountResult = await db.get("SELECT COUNT(*) as count FROM call_center_case_types") as { count: string | number };
  const caseTypeCount = parseInt(caseTypeCountResult.count.toString());
  if (caseTypeCount === 0) {
    const caseTypes = [
      { en: "Late Order", ar: "طلب متأخر" },
      { en: "Wrong Item", ar: "صنف خطأ" },
      { en: "Missing Item", ar: "صنف ناقص" },
      { en: "Quality Issue", ar: "مشكلة جودة" },
      { en: "Driver Issue", ar: "مشكلة سائق" },
      { en: "Dedication", ar: "إهداء" },
      { en: "Technical", ar: "تقني" },
      { en: "Inquiry", ar: "استفسار" },
      { en: "Suggestion", ar: "اقتراح" }
    ];
    for (const c of caseTypes) {
      await db.query("INSERT INTO call_center_case_types (name_en, name_ar) VALUES ($1, $2)", [c.en, c.ar]);
    }
  }

  // Seed Technical Case Types
  const techTypeCountResult = await db.get("SELECT COUNT(*) as count FROM technical_case_types") as { count: string | number };
  const techTypeCount = parseInt(techTypeCountResult.count.toString());
  if (techTypeCount === 0) {
    const techTypes = [
      { en: "System Down", ar: "النظام معطل" },
      { en: "Printer Issue", ar: "مشكلة طابعة" },
      { en: "Network Issue", ar: "مشكلة شبكة" },
      { en: "Tablet Issue", ar: "مشكلة تابلت" },
      { en: "Other", ar: "أخرى" }
    ];
    for (const t of techTypes) {
      await db.query("INSERT INTO technical_case_types (name_en, name_ar) VALUES ($1, $2)", [t.en, t.ar]);
    }
  }
}

async function startServer() {
  console.log("Starting server...");
  
  const app = express();
  app.use(cors());
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  app.use(express.json());

  // Request logger
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // Initialize Database in background to avoid blocking server startup
  (async () => {
    try {
      console.log("Connecting to PostgreSQL...");
      await initDb();
      console.log("Database schema initialized successfully on PostgreSQL.");
      await seedData(); 
      console.log("Database initialization complete.");
    } catch (dbErr) {
      console.error("CRITICAL ERROR: Failed to initialize database.");
      console.error("Check your DATABASE_URL environment variable.");
      console.error("Error details:", dbErr);
    }
  })();

  console.log("NODE_ENV:", process.env.NODE_ENV);

  // Health check
  app.get("/api/health", async (req, res) => {
    try {
      const userCount = await db.get("SELECT COUNT(*) as count FROM users");
      res.json({ 
        status: "ok", 
        timestamp: new Date().toISOString(),
        db: { userCount }
      });
    } catch (err) {
      res.status(500).json({ status: "error", message: String(err) });
    }
  });

  // Simple debug route
  app.get("/debug", (req, res) => {
    res.send("<h1>Server is running!</h1><p>If you see this, the server is listening on port 3000.</p>");
  });

  // WebSocket broadcast helper
  const broadcast = (data: any) => {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  const getProductNameFieldId = async () => {
    const field = await db.get("SELECT id FROM dynamic_fields WHERE name_en = 'Product Name (EN)'") as { id: number } | undefined;
    return field?.id || 3;
  };

  // Middleware: Auth
  const authenticate = async (req: any, res: any, next: any) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      // Fetch fresh user data to ensure role_id is correct after DB resets
      const freshUser = await db.get("SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.id = $1", [decoded.id]) as any;
      if (!freshUser) return res.status(401).json({ error: "User no longer exists" });
      req.user = freshUser;
      next();
    } catch (e) {
      res.status(401).json({ error: "Invalid token" });
    }
  };

  // Middleware: Role check
  const authorize = (roles: string[]) => (req: any, res: any, next: any) => {
    if (!req.user) return res.status(401).json({ error: "Unauthorized" });
    if (!roles.includes(req.user.role_name)) {
      console.warn(`Access denied for user ${req.user.username}. Role ${req.user.role_name} not in ${roles.join(", ")}`);
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };

  // Pending Requests API
  app.get("/api/pending-requests", authenticate, authorize(["Technical Back Office", "Manager", "Super Visor", "Restaurants"]), async (req, res) => {
    let query = `
      SELECT pr.*, u.username, p.username as processor_name
      FROM pending_requests pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN users p ON pr.processed_by = p.id
    `;
    let params: any[] = [];

    if ((req as any).user.role_name === 'Restaurants') {
      query += " WHERE pr.user_id = $1";
      params.push((req as any).user.id);
    }

    query += " ORDER BY pr.created_at DESC";
    
    const requests = await db.all(query, params);
    
    const parsedRequests = await Promise.all(requests.map(async (r: any) => {
      const data = JSON.parse(r.data);
      
      if (r.type === 'hide_unhide') {
        // Resolve Brand Name
        if (data.brand_id) {
          const brand = await db.get("SELECT name FROM brands WHERE id = $1", [data.brand_id]) as { name: string };
          data.brand_name = brand?.name || 'Unknown';
        }
        
        // Resolve Branch Name
        if (data.branch_id) {
          const branch = await db.get("SELECT name FROM branches WHERE id = $1", [data.branch_id]) as { name: string };
          data.branch_name = branch?.name || 'Unknown';
        } else {
          data.branch_name = 'All Branches';
        }
        
        // Resolve Product Names
        if (data.product_ids && data.product_ids.length > 0) {
          const productNameFieldId = await getProductNameFieldId();
          const placeholders = data.product_ids.map((_: any, i: number) => `$${i + 2}`).join(',');
          const products = await db.all(`
            SELECT fv.product_id, fv.value as name
            FROM product_field_values fv
            WHERE fv.field_id = $1 AND fv.product_id IN (${placeholders})
          `, [productNameFieldId, ...data.product_ids]) as { product_id: number, name: string }[];
          data.resolved_products = products;
        }
      }
      
      return {
        ...r,
        data
      };
    }));
    
    res.json(parsedRequests);
  });

  app.post("/api/pending-requests", authenticate, async (req, res) => {
    const { type, data } = req.body;
    const result = await db.query(`
      INSERT INTO pending_requests (user_id, type, data)
      VALUES ($1, $2, $3) RETURNING id
    `, [(req as any).user.id, type, JSON.stringify(data)]);
    
    broadcast({ type: "PENDING_REQUEST_CREATED" });
    res.json({ id: result.rows[0].id });
  });

  app.post("/api/pending-requests/:id/approve", authenticate, authorize(["Technical Back Office", "Manager", "Super Visor"]), async (req, res) => {
    const { id } = req.params;
    const request = await db.get("SELECT * FROM pending_requests WHERE id = $1", [id]) as any;
    
    if (!request || request.status !== 'Pending') {
      return res.status(400).json({ error: "Invalid request" });
    }
    
    const data = JSON.parse(request.data);
    
    try {
      if (request.type === 'hide_unhide') {
        if (data.branch_id === null) {
          const branches = await db.all("SELECT id FROM branches WHERE brand_id = $1", [data.brand_id]) as { id: number }[];
          for (const productId of data.product_ids) {
            for (const branch of branches) {
              await db.query(`
                INSERT INTO hidden_items (
                  user_id, brand_id, branch_id, product_id, agent_name, reason, 
                  action_to_unhide, comment, requested_at, responsible_party
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              `, [request.user_id, data.brand_id, branch.id, productId, data.agent_name, data.reason, data.action_to_unhide, data.comment, data.requested_at, data.responsible_party]);
              
              await db.query(`
                INSERT INTO hide_history (
                  user_id, brand_id, branch_id, product_id, action,
                  agent_name, reason, action_to_unhide, comment, requested_at, responsible_party
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              `, [request.user_id, data.brand_id, branch.id, productId, 'HIDE', data.agent_name, data.reason, data.action_to_unhide, data.comment, data.requested_at, data.responsible_party]);
            }
          }
        } else {
          for (const productId of data.product_ids) {
            await db.query(`
              INSERT INTO hidden_items (
                user_id, brand_id, branch_id, product_id, agent_name, reason, 
                action_to_unhide, comment, requested_at, responsible_party
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            `, [request.user_id, data.brand_id, data.branch_id, productId, data.agent_name, data.reason, data.action_to_unhide, data.comment, data.requested_at, data.responsible_party]);
            
            await db.query(`
              INSERT INTO hide_history (
                user_id, brand_id, branch_id, product_id, action,
                agent_name, reason, action_to_unhide, comment, requested_at, responsible_party
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [request.user_id, data.brand_id, data.branch_id, productId, 'HIDE', data.agent_name, data.reason, data.action_to_unhide, data.comment, data.requested_at, data.responsible_party]);
          }
        }
        broadcast({ type: "HIDDEN_ITEMS_UPDATED" });
      } else if (request.type === 'busy_branch') {
        await db.query(`
          INSERT INTO busy_period_records (
            user_id, date, brand, branch, start_time, end_time, 
            total_duration, total_duration_minutes, reason_category, responsible_party, 
            comment, internal_notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [
          request.user_id, data.date, data.brand, data.branch, data.start_time, data.end_time,
          data.total_duration, data.total_duration_minutes || 0, data.reason_category, data.responsible_party,
          data.comment, data.internal_notes
        ]);
        broadcast({ type: "BUSY_PERIOD_CREATED" });
      }
      
      await db.query("UPDATE pending_requests SET status = 'Approved', processed_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [(req as any).user.id, id]);
        
      broadcast({ type: "PENDING_REQUEST_UPDATED" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error approving request:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.post("/api/pending-requests/:id/reject", authenticate, authorize(["Technical Back Office", "Manager", "Super Visor"]), async (req, res) => {
    const { id } = req.params;
    await db.query("UPDATE pending_requests SET status = 'Rejected', processed_by = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [(req as any).user.id, id]);
      
    broadcast({ type: "PENDING_REQUEST_UPDATED" });
    res.json({ success: true });
  });

  // Late Order Requests
  try {
    await db.exec("ALTER TABLE late_order_requests ADD COLUMN call_center_message TEXT");
  } catch (e) {}
  try {
    await db.exec("ALTER TABLE late_order_requests ADD COLUMN case_type TEXT DEFAULT 'Late Order'");
  } catch (e) {}
  try {
    await db.exec("ALTER TABLE late_order_requests ADD COLUMN dedication_time TIMESTAMP");
  } catch (e) {}
  try {
    await db.exec("ALTER TABLE late_order_requests ADD COLUMN alert_sent INTEGER DEFAULT 0");
  } catch (e) {}
  try {
    await db.exec("ALTER TABLE late_order_requests ADD COLUMN restaurant_response_at TIMESTAMP");
  } catch (e) {}
  try {
    await db.exec("ALTER TABLE late_order_requests ADD COLUMN manager_viewed_at TIMESTAMP");
  } catch (e) {}
  try {
    await db.exec("ALTER TABLE late_order_requests ADD COLUMN manager_responded_at TIMESTAMP");
  } catch (e) {}
  try {
    await db.exec("ALTER TABLE late_order_requests ADD COLUMN restaurant_viewed_at TIMESTAMP");
  } catch (e) {}

  // Late Order Alert Checker
  setInterval(async () => {
    const now = new Date();
    try {
      // Basic check for internal Railway URL to avoid spamming errors
      if (process.env.DATABASE_URL?.includes('postgres.railway.internal')) {
        console.warn("CRITICAL: You are using an INTERNAL Railway URL. Please update DATABASE_URL in Settings to use the PUBLIC URL (DATABASE_PUBLIC_URL).");
        return;
      }

      const pendingAlerts = await db.all(`
        SELECT lo.*, b.name as brand_name, br.name as branch_name
        FROM late_order_requests lo
        JOIN brands b ON lo.brand_id = b.id
        JOIN branches br ON lo.branch_id = br.id
        WHERE lo.case_type = 'Dedication' 
        AND lo.alert_sent = 0
      `) as any[];

      for (const alert of pendingAlerts) {
        if (!alert.dedication_time) continue;
        
        const dTime = new Date(alert.dedication_time);
        if (dTime <= now) {
          broadcast({
            type: "DEDICATION_ALERT",
            data: {
              id: alert.id,
              order_id: alert.order_id,
              customer_name: alert.customer_name,
              brand_name: alert.brand_name,
              branch_name: alert.branch_name,
              branch_id: alert.branch_id,
              call_center_user_id: alert.call_center_user_id,
              brand_id: alert.brand_id
            }
          });

          await db.query("UPDATE late_order_requests SET alert_sent = 1 WHERE id = $1", [alert.id]);
        }
      }
    } catch (err) {
      console.error("Error in Late Order Alert Checker:", err);
    }
  }, 10000); // Check every 10 seconds for better precision

  app.post("/api/late-orders", authenticate, authorize(["Call Center", "Restaurants", "Technical Back Office"]), async (req, res) => {
    const { brand_id, branch_id, customer_name, customer_phone, order_id, platform, call_center_message, case_type, technical_type, dedication_time, dynamic_values, complaint_source } = req.body;
    
    // Validation for Dedication
    let isoDedicationTime = dedication_time;
    if (case_type === 'Dedication' && dedication_time) {
      const dTime = new Date(dedication_time);
      isoDedicationTime = dTime.toISOString();
      const now = new Date();
      const diff = dTime.getTime() - now.getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      
      if (diff < 0) {
        return res.status(400).json({ error: "Dedication time must be in the future" });
      }
      if (diff > twentyFourHours) {
        return res.status(400).json({ error: "Dedication time must be within 24 hours" });
      }
    }

    const result = await db.query(`
      INSERT INTO late_order_requests (call_center_user_id, brand_id, branch_id, customer_name, customer_phone, order_id, platform, call_center_message, case_type, technical_type, dedication_time, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id
    `, [(req as any).user.id, brand_id, branch_id, customer_name, customer_phone, order_id, platform, call_center_message, case_type || 'Late Order', technical_type, isoDedicationTime, getCurrentKuwaitTime()]);
    
    const requestId = result.rows[0].id;

    if (dynamic_values && typeof dynamic_values === 'object') {
      for (const [fieldId, value] of Object.entries(dynamic_values)) {
        if (value !== undefined && value !== null) {
          await db.query("INSERT INTO late_order_field_values (request_id, field_id, value) VALUES ($1, $2, $3)", [requestId, fieldId, value.toString()]);
        }
      }
    }

    broadcast({ type: "LATE_ORDER_CREATED" });
    res.json({ id: requestId });
  });

  app.get("/api/late-orders", authenticate, async (req, res) => {
    const user = (req as any).user;
    const restriction = await getBrandRestriction(user);
    
    let query = `
      SELECT lo.*, u.username as call_center_name, r.name as creator_role, b.name as brand_name, br.name as branch_name
      FROM late_order_requests lo
      JOIN users u ON lo.call_center_user_id = u.id
      JOIN roles r ON u.role_id = r.id
      JOIN brands b ON lo.brand_id = b.id
      JOIN branches br ON lo.branch_id = br.id
    `;
    const params: any[] = [];

    if (user.role_name === 'Call Center') {
      if (restriction) {
        const placeholders = restriction.brands.map((_: any, i: number) => `$${i + 1}`).join(',');
        query += ` WHERE (b.name ${restriction.type === 'include' ? 'IN' : 'NOT IN'} (${placeholders}))`;
        params.push(...restriction.brands);
      } else {
        query += " WHERE (lo.call_center_user_id = $1 OR r.name = 'Restaurants')";
        params.push(user.id);
      }
      query += " AND lo.case_type != 'Technical'";
    } else if (user.role_name === 'Restaurants') {
      const conditions = [];
      if (user.branch_id) {
        conditions.push("lo.branch_id = $1");
        params.push(user.branch_id);
      } else if (restriction) {
        const placeholders = restriction.brands.map((_: any, i: number) => `$${i + 1}`).join(',');
        conditions.push(`b.name ${restriction.type === 'include' ? 'IN' : 'NOT IN'} (${placeholders})`);
        params.push(...restriction.brands);
      } else {
        conditions.push("1 = 0");
      }
      if (conditions.length > 0) {
        query += " WHERE " + conditions.join(" AND ");
      }
      query += " AND lo.case_type != 'Technical'";
    } else if (user.role_name === 'Technical Back Office') {
      query += " WHERE lo.case_type = 'Technical'";
      if (restriction) {
        const placeholders = restriction.brands.map((_: any, i: number) => `$${i + 1}`).join(',');
        query += ` AND b.name ${restriction.type === 'include' ? 'IN' : 'NOT IN'} (${placeholders})`;
        params.push(...restriction.brands);
      }
    } else if (user.role_name === 'Manager' || user.role_name === 'Marketing Team' || user.role_name === 'Super Visor') {
      if (restriction) {
        const placeholders = restriction.brands.map((_: any, i: number) => `$${i + 1}`).join(',');
        query += ` WHERE b.name ${restriction.type === 'include' ? 'IN' : 'NOT IN'} (${placeholders})`;
        params.push(...restriction.brands);
      }
    }

    query += " ORDER BY lo.created_at DESC";
    const requests = await db.all(query, params) as any[];

    if (requests.length > 0) {
      const requestIds = requests.map(r => r.id);
      const placeholders = requestIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      const fieldValues = await db.all(`
        SELECT fv.*, f.name_en, f.name_ar, f.type
        FROM late_order_field_values fv
        JOIN call_center_form_fields f ON fv.field_id = f.id
        WHERE fv.request_id IN (${placeholders})
      `, requestIds) as any[];

      requests.forEach(r => {
        r.dynamic_values = fieldValues.filter(fv => fv.request_id === r.id);
      });
    }

    res.json(requests);
  });

  app.put("/api/late-orders/:id", authenticate, authorize(["Restaurants", "Manager", "Super Visor", "Call Center", "Technical Back Office"]), async (req, res) => {
    const { id } = req.params;
    const { status, restaurant_message } = req.body;
    const user = (req as any).user;
    
    let query = "UPDATE late_order_requests SET status = $1, restaurant_message = $2, updated_at = CURRENT_TIMESTAMP";
    const params: any[] = [status, restaurant_message];

    if (user.role_name === 'Restaurants') {
      query += ", restaurant_response_at = CURRENT_TIMESTAMP";
    } else if (user.role_name === 'Manager' || user.role_name === 'Super Visor' || user.role_name === 'Technical Back Office') {
      query += ", manager_responded_at = CURRENT_TIMESTAMP";
    } else if (user.role_name === 'Call Center') {
      query += ", manager_responded_at = CURRENT_TIMESTAMP"; // Reuse manager_responded_at for simplicity or add a new column
    }

    query += " WHERE id = $" + (params.length + 1);
    params.push(id);

    await db.query(query, params);
    
    broadcast({ type: "LATE_ORDER_UPDATED", id });
    res.json({ success: true });
  });

  // Call Center Form Configuration
  app.get("/api/call-center/config", authenticate, async (req, res) => {
    const fields = await db.all("SELECT * FROM call_center_form_fields WHERE is_active = 1 ORDER BY display_order");
    const options = await db.all("SELECT * FROM call_center_field_options ORDER BY display_order");
    const technicalTypes = await db.all("SELECT * FROM technical_case_types WHERE is_active = 1");
    const platforms = await db.all("SELECT * FROM call_center_platforms WHERE is_active = 1");
    const caseTypes = await db.all("SELECT * FROM call_center_case_types WHERE is_active = 1");
    const brands = await db.all("SELECT id, name FROM brands");

    res.json({
      fields,
      options,
      technicalTypes,
      platforms,
      caseTypes,
      brands
    });
  });

  app.post("/api/call-center/platforms", authenticate, authorize(["Manager"]), async (req, res) => {
    const { name_en, name_ar } = req.body;
    const result = await db.query("INSERT INTO call_center_platforms (name_en, name_ar) VALUES ($1, $2) RETURNING id", [name_en, name_ar]);
    res.json({ id: result.rows[0].id });
  });

  app.delete("/api/call-center/platforms/:id", authenticate, authorize(["Manager"]), async (req, res) => {
    await db.query("DELETE FROM call_center_platforms WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  });

  app.post("/api/call-center/case-types", authenticate, authorize(["Manager"]), async (req, res) => {
    const { name_en, name_ar } = req.body;
    const result = await db.query("INSERT INTO call_center_case_types (name_en, name_ar) VALUES ($1, $2) RETURNING id", [name_en, name_ar]);
    res.json({ id: result.rows[0].id });
  });

  app.delete("/api/call-center/case-types/:id", authenticate, authorize(["Manager"]), async (req, res) => {
    await db.query("DELETE FROM call_center_case_types WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  });

  app.get("/api/call-center/fields", authenticate, async (req, res) => {
    try {
      const fields = await db.all("SELECT * FROM call_center_form_fields ORDER BY display_order ASC");
      const options = await db.all("SELECT * FROM call_center_field_options ORDER BY display_order ASC");
      const technicalTypes = await db.all("SELECT * FROM technical_case_types WHERE is_active = 1 ORDER BY created_at DESC");
      res.json({ fields, options, technicalTypes });
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch call center fields" });
    }
  });

  app.post("/api/call-center/technical-types", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    const { name_en, name_ar } = req.body;
    try {
      const result = await db.query("INSERT INTO technical_case_types (name_en, name_ar) VALUES ($1, $2) RETURNING id", [name_en, name_ar]);
      res.json({ id: result.rows[0].id });
    } catch (error) {
      res.status(500).json({ error: "Failed to add technical type" });
    }
  });

  app.delete("/api/call-center/technical-types/:id", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    try {
      await db.query("DELETE FROM technical_case_types WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete technical type" });
    }
  });

  app.post("/api/call-center/fields", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    const { name_en, name_ar, type, is_required, display_order } = req.body;
    try {
      const result = await db.query(`
        INSERT INTO call_center_form_fields (name_en, name_ar, type, is_required, display_order)
        VALUES ($1, $2, $3, $4, $5) RETURNING id
      `, [name_en, name_ar, type, is_required || 0, display_order || 0]);
      res.json({ id: result.rows[0].id });
    } catch (error) {
      res.status(500).json({ error: "Failed to create field" });
    }
  });

  app.put("/api/call-center/fields/:id", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    const { name_en, name_ar, type, is_required, display_order, is_active } = req.body;
    try {
      await db.query(`
        UPDATE call_center_form_fields
        SET name_en = $1, name_ar = $2, type = $3, is_required = $4, display_order = $5, is_active = $6
        WHERE id = $7
      `, [name_en, name_ar, type, is_required, display_order, is_active, req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to update field" });
    }
  });

  app.delete("/api/call-center/fields/:id", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    try {
      await db.query("DELETE FROM call_center_form_fields WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete field" });
    }
  });

  app.post("/api/call-center/fields/:id/options", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    const { value_en, value_ar, display_order } = req.body;
    try {
      const result = await db.query(`
        INSERT INTO call_center_field_options (field_id, value_en, value_ar, display_order)
        VALUES ($1, $2, $3, $4) RETURNING id
      `, [req.params.id, value_en, value_ar, display_order || 0]);
      res.json({ id: result.rows[0].id });
    } catch (error) {
      res.status(500).json({ error: "Failed to add option" });
    }
  });

  app.delete("/api/call-center/fields/options/:id", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    try {
      await db.query("DELETE FROM call_center_field_options WHERE id = $1", [req.params.id]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete option" });
    }
  });

  app.post("/api/late-orders/:id/view", authenticate, authorize(["Restaurants", "Manager", "Super Visor"]), async (req, res) => {
    const { id } = req.params;
    const user = (req as any).user;
    
    if (user.role_name === 'Restaurants') {
      await db.query("UPDATE late_order_requests SET restaurant_viewed_at = CURRENT_TIMESTAMP WHERE id = $1 AND restaurant_viewed_at IS NULL", [id]);
    } else if (user.role_name === 'Manager') {
      await db.query("UPDATE late_order_requests SET manager_viewed_at = CURRENT_TIMESTAMP WHERE id = $1 AND manager_viewed_at IS NULL", [id]);
    }
    
    broadcast({ type: "LATE_ORDER_UPDATED", id });
    res.json({ success: true });
  });

  // Auth Routes
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    console.log(`[LOGIN] Attempt for user: ${username}`);
    try {
      const user = await db.get("SELECT u.*, r.name as role_name FROM users u JOIN roles r ON u.role_id = r.id WHERE u.username = $1 AND u.is_active = 1", [username]) as any;
      
      if (!user) {
        console.log(`[LOGIN] User not found: ${username}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      console.log(`[LOGIN] User found, comparing password for: ${username}`);
      const isMatch = await bcrypt.compare(password, user.password_hash);
      
      if (!isMatch) {
        console.log(`[LOGIN] Password mismatch for: ${username}`);
        return res.status(401).json({ error: "Invalid credentials" });
      }

      console.log(`[LOGIN] Success for: ${username}`);
      const userBrands = await db.all("SELECT brand_id FROM user_brands WHERE user_id = $1", [user.id]) as any[];
      const brandIds = userBrands.map(ub => ub.brand_id);
      
      const userData = { 
        id: user.id, 
        username: user.username, 
        role_id: user.role_id, 
        role_name: user.role_name,
        brand_id: user.brand_id,
        brand_ids: brandIds
      };
      
      const token = jwt.sign(userData, JWT_SECRET);
      res.json({ token, user: userData });
    } catch (error) {
      console.error(`[LOGIN] Error during login for ${username}:`, error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Brands Routes
  app.get("/api/brands", authenticate, async (req, res) => {
    const { all } = req.query;
    const restriction = all === 'true' ? null : await getBrandRestriction((req as any).user);
    let brands;
    if (restriction) {
      const placeholders = restriction.brands.map((_: any, i: number) => `$${i + 1}`).join(',');
      if (restriction.type === 'include') {
        brands = await db.all(`SELECT * FROM brands WHERE name IN (${placeholders}) ORDER BY name ASC`, restriction.brands);
      } else {
        brands = await db.all(`SELECT * FROM brands WHERE name NOT IN (${placeholders}) ORDER BY name ASC`, restriction.brands);
      }
    } else {
      brands = await db.all("SELECT * FROM brands ORDER BY name ASC");
    }
    res.json(brands);
  });

  app.post("/api/brands", authenticate, authorize(["Technical Back Office", "Manager"]), async (req, res) => {
    const { name } = req.body;
    try {
      const result = await db.query("INSERT INTO brands (name) VALUES ($1) RETURNING id", [name]);
      const brandId = Number(result.rows[0].id);
      await logAction((req as any).user.id, "CREATE", "brands", brandId, null, { name });
      res.json({ id: brandId, name });
    } catch (e) {
      res.status(400).json({ error: "Brand already exists" });
    }
  });

  app.delete("/api/brands/:id", authenticate, authorize(["Technical Back Office", "Manager"]), async (req, res) => {
    await db.query("DELETE FROM brands WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  });

  // Dynamic Fields Routes
  app.get("/api/fields", authenticate, async (req, res) => {
    const fields = await db.all("SELECT * FROM dynamic_fields ORDER BY field_order ASC");
    const options = await db.all("SELECT * FROM field_options");
    res.json({ fields, options });
  });

  app.post("/api/fields", authenticate, authorize(["Manager"]), async (req, res) => {
    const { name_en, name_ar, type, is_mandatory } = req.body;
    const result = await db.query("INSERT INTO dynamic_fields (name_en, name_ar, type, is_mandatory) VALUES ($1, $2, $3, $4) RETURNING id", [name_en, name_ar, type, is_mandatory ? 1 : 0]);
    res.json({ id: result.rows[0].id });
  });

  app.put("/api/fields/:id", authenticate, authorize(["Manager"]), async (req, res) => {
    const { name_en, name_ar, type, is_mandatory } = req.body;
    await db.query("UPDATE dynamic_fields SET name_en = $1, name_ar = $2, type = $3, is_mandatory = $4 WHERE id = $5", [name_en, name_ar, type, is_mandatory ? 1 : 0, req.params.id]);
    res.json({ success: true });
  });

  app.delete("/api/fields/options/:id", authenticate, authorize(["Manager"]), async (req, res) => {
    await db.query("DELETE FROM field_options WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  });

  app.delete("/api/fields/:id", authenticate, authorize(["Manager"]), async (req, res) => {
    const fieldId = req.params.id;
    try {
      const result = await db.query("DELETE FROM dynamic_fields WHERE id = $1", [fieldId]);
      
      if (result.rowCount === 0) {
        return res.status(404).json({ error: "Field not found" });
      }

      broadcast({ type: 'FIELDS_UPDATED' });
      res.json({ success: true });
    } catch (error: any) {
      console.error("Delete field error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/fields/:id/options", authenticate, authorize(["Manager"]), async (req, res) => {
    const { value_en, value_ar, price } = req.body;
    const fieldId = req.params.id;
    const result = await db.query("INSERT INTO field_options (field_id, value_en, value_ar, price) VALUES ($1, $2, $3, $4) RETURNING id", [fieldId, value_en, value_ar, price || 0]);
    res.json({ id: result.rows[0].id });
  });

  // Products Routes
  app.get("/api/products", authenticate, async (req, res) => {
    const { brand_id, all } = req.query;
    const restriction = all === 'true' ? null : await getBrandRestriction((req as any).user);
    
    let query = `
      SELECT p.*, b.name as brand_name, pc.code as product_code, u.username as creator_name
      FROM products p
      LEFT JOIN brands b ON p.brand_id = b.id
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN product_codes pc ON p.id = pc.product_id
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (brand_id) {
      conditions.push("p.brand_id = $1");
      params.push(brand_id);
    }

    const allProductsDebug = await db.all("SELECT p.id, b.name as brand_name FROM products p LEFT JOIN brands b ON p.brand_id = b.id");
    console.log("DEBUG: All Products in DB:", allProductsDebug);

    if (restriction) {
      const placeholders = restriction.brands.map((_: any, i: number) => `$${params.length + i + 1}`).join(',');
      if (restriction.type === 'include') {
        conditions.push(`b.name IN (${placeholders})`);
      } else {
        conditions.push(`b.name NOT IN (${placeholders})`);
      }
      params.push(...restriction.brands);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY p.created_at DESC";
    
    const products = await db.all(query, params) as any[];
    const productIds = products.map(p => p.id);
    
    if (productIds.length === 0) {
      return res.json({ products: [], fieldValues: [] });
    }

    const productNameFieldId = await getProductNameFieldId();
    
    const placeholders = productIds.map((_: any, i: number) => `$${i + 1}`).join(',');
    
    const fieldValues = await db.all(`SELECT * FROM product_field_values WHERE product_id IN (${placeholders})`, productIds);
    const modifierGroups = await db.all(`SELECT * FROM modifier_groups WHERE product_id IN (${placeholders})`, productIds);
    const groupIds = modifierGroups.map((mg: any) => mg.id);
    
    let modifierOptions: any[] = [];
    if (groupIds.length > 0) {
      const groupPlaceholders = groupIds.map((_: any, i: number) => `$${i + 1}`).join(',');
      modifierOptions = await db.all(`SELECT * FROM modifier_options WHERE group_id IN (${groupPlaceholders})`, groupIds);
    }

    const productChannels = await db.all(`SELECT * FROM product_channels WHERE product_id IN (${placeholders})`, productIds);
    
    // Efficiently map related data to products
    const filteredProducts = products.map((p: any) => {
      const pModifiers = modifierGroups
        .filter((mg: any) => mg.product_id === p.id)
        .map((mg: any) => ({
          ...mg,
          options: modifierOptions.filter((mo: any) => mo.group_id === mg.id)
        }));

      const pChannels = productChannels.filter((pc: any) => pc.product_id === p.id).map((pc: any) => pc.channel_name);

      const result = { ...p, modifierGroups: pModifiers, channels: pChannels };
      
      if ((req as any).user.role_name.startsWith("Marketing")) {
        delete result.product_code;
      }
      
      return result;
    });

    res.json({ products: filteredProducts, fieldValues });
  });

  app.post("/api/products/:id/toggle-offline", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    const { id } = req.params;
    const product = await db.get("SELECT is_offline FROM products WHERE id = $1", [id]) as any;
    if (!product) return res.status(404).json({ error: "Product not found" });

    const newStatus = product.is_offline ? 0 : 1;
    await db.query("UPDATE products SET is_offline = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [newStatus, id]);
    
    await logAction((req as any).user.id, "UPDATE", "products", Number(id), null, { is_offline: newStatus });
    
    // Broadcast update
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: 'PRODUCT_UPDATED', id }));
      }
    });

    res.json({ success: true, is_offline: newStatus });
  });

  app.post("/api/products", authenticate, authorize(["Marketing Team", "Technical Team", "Technical Back Office", "Manager", "Super Visor"]), async (req, res) => {
    const { brand_id, fieldValues, modifierGroups, channels } = req.body;
    
    // Brand Restriction Check
    const restriction = await getBrandRestriction((req as any).user);
    if (restriction) {
      const brand = await db.get("SELECT name FROM brands WHERE id = $1", [brand_id]) as { name: string };
      if (restriction.type === 'include') {
        if (!restriction.brands.includes(brand.name)) {
          return res.status(403).json({ error: "You are not authorized to add products for this brand" });
        }
      } else {
        if (restriction.brands.includes(brand.name)) {
          return res.status(403).json({ error: "You are not authorized to add products for this brand" });
        }
      }
    }

    try {
      const productId = await db.transaction(async (client) => {
        const productResult = await client.query("INSERT INTO products (brand_id, created_by) VALUES ($1, $2) RETURNING id", [brand_id, (req as any).user.id]);
        const productId = productResult.rows[0].id;
        
        // Save dynamic field values
        for (const [fieldId, value] of Object.entries(fieldValues)) {
          await client.query("INSERT INTO product_field_values (product_id, field_id, value) VALUES ($1, $2, $3)", [productId, fieldId, typeof value === 'object' ? JSON.stringify(value) : String(value)]);
        }

        // Save modifier groups
        if (modifierGroups && Array.isArray(modifierGroups)) {
          for (const group of modifierGroups) {
            const groupResult = await client.query(
              "INSERT INTO modifier_groups (product_id, name_en, name_ar, selection_type, is_required, min_selection, max_selection, code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
              [
                productId,
                group.name_en,
                group.name_ar,
                group.selection_type || 'single',
                group.is_required ? 1 : 0,
                group.min_selection || 0,
                group.max_selection || 1,
                group.code || null
              ]
            );
            const groupId = groupResult.rows[0].id;

            if (group.options && Array.isArray(group.options)) {
              for (const option of group.options) {
                await client.query("INSERT INTO modifier_options (group_id, name_en, name_ar, price_adjustment, code) VALUES ($1, $2, $3, $4, $5)", [groupId, option.name_en, option.name_ar, option.price_adjustment || 0, option.code || null]);
              }
            }
          }
        }

        // Save channels
        if (channels && Array.isArray(channels)) {
          for (const channel of channels) {
            await client.query("INSERT INTO product_channels (product_id, channel_name) VALUES ($1, $2)", [productId, channel]);
          }
        }
        
        return productId;
      });

      const brand = await db.get("SELECT name FROM brands WHERE id = $1", [brand_id]) as { name: string };
      const productNameFieldId = await getProductNameFieldId();
      const productName = fieldValues[productNameFieldId.toString()] || "Unknown Product";
      await logAction((req as any).user.id, "CREATE", "products", Number(productId), null, { 
        product_name: productName, 
        brand_name: brand?.name || 'Unknown Brand',
        brand_id, 
        fieldValues, 
        modifierGroups, 
        channels 
      });
      broadcast({ type: "PRODUCT_CREATED", productId });
      res.json({ id: productId });
    } catch (error) {
      console.error("Create product error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.put("/api/products/:id", authenticate, authorize(["Marketing Team", "Technical Team", "Technical Back Office", "Manager", "Super Visor", "Restaurants"]), async (req, res) => {
    const { fieldValues, modifierGroups, channels } = req.body;
    const productId = req.params.id;

    // Brand Restriction Check
    const restriction = await getBrandRestriction((req as any).user);
    if (restriction) {
      const product = await db.get("SELECT brand_id FROM products WHERE id = $1", [productId]) as { brand_id: number };
      const brand = await db.get("SELECT name FROM brands WHERE id = $1", [product.brand_id]) as { name: string };
      if (restriction.type === 'include') {
        if (!restriction.brands.includes(brand.name)) {
          return res.status(403).json({ error: "You are not authorized to edit products for this brand" });
        }
      } else {
        if (restriction.brands.includes(brand.name)) {
          return res.status(403).json({ error: "You are not authorized to edit products for this brand" });
        }
      }
    }
    
    try {
      await db.transaction(async (client) => {
        if ((req as any).user.role_name === 'Restaurants') {
          // Restricted update for Restaurants: Only Ingredients
          const ingredientsField = await db.get("SELECT id FROM dynamic_fields WHERE name_en = 'Ingredients'") as { id: number } | undefined;
          if (ingredientsField && fieldValues && fieldValues[ingredientsField.id] !== undefined) {
            const exists = await db.get("SELECT id FROM product_field_values WHERE product_id = $1 AND field_id = $2", [productId, ingredientsField.id]) as { id: number } | undefined;
            if (exists) {
              await client.query("UPDATE product_field_values SET value = $1 WHERE id = $2", [String(fieldValues[ingredientsField.id]), exists.id]);
            } else {
              await client.query("INSERT INTO product_field_values (product_id, field_id, value) VALUES ($1, $2, $3)", [productId, ingredientsField.id, String(fieldValues[ingredientsField.id])]);
            }
          }
        } else {
          // Full update for other roles
          await client.query("DELETE FROM product_field_values WHERE product_id = $1", [productId]);
          for (const [fieldId, value] of Object.entries(fieldValues)) {
            await client.query("INSERT INTO product_field_values (product_id, field_id, value) VALUES ($1, $2, $3)", [productId, fieldId, typeof value === 'object' ? JSON.stringify(value) : String(value)]);
          }

          await client.query("DELETE FROM modifier_groups WHERE product_id = $1", [productId]);
          if (modifierGroups && Array.isArray(modifierGroups)) {
            for (const group of modifierGroups) {
              const groupResult = await client.query(
                "INSERT INTO modifier_groups (product_id, name_en, name_ar, selection_type, is_required, min_selection, max_selection, code) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id",
                [
                  productId,
                  group.name_en,
                  group.name_ar,
                  group.selection_type || 'single',
                  group.is_required ? 1 : 0,
                  group.min_selection || 0,
                  group.max_selection || 1,
                  group.code || null
                ]
              );
              const groupId = groupResult.rows[0].id;

              if (group.options && Array.isArray(group.options)) {
                for (const option of group.options) {
                  await client.query("INSERT INTO modifier_options (group_id, name_en, name_ar, price_adjustment, code) VALUES ($1, $2, $3, $4, $5)", [groupId, option.name_en, option.name_ar, option.price_adjustment || 0, option.code || null]);
                }
              }
            }
          }

          await client.query("DELETE FROM product_channels WHERE product_id = $1", [productId]);
          if (channels && Array.isArray(channels)) {
            for (const channel of channels) {
              await client.query("INSERT INTO product_channels (product_id, channel_name) VALUES ($1, $2)", [productId, channel]);
            }
          }
        }

        await client.query("UPDATE products SET updated_at = CURRENT_TIMESTAMP WHERE id = $1", [productId]);
      });

      const product = await db.get("SELECT brand_id FROM products WHERE id = $1", [productId]) as { brand_id: number };
      const brand = await db.get("SELECT name FROM brands WHERE id = $1", [product.brand_id]) as { name: string };
      const productNameFieldId = await getProductNameFieldId();
      const productName = fieldValues[productNameFieldId.toString()] || "Unknown Product";
      await logAction((req as any).user.id, "UPDATE", "products", Number(productId), null, { 
        product_name: productName, 
        brand_name: brand?.name || 'Unknown Brand',
        fieldValues, 
        modifierGroups, 
        channels 
      });
      broadcast({ type: "PRODUCT_UPDATED", productId });
      res.json({ success: true });
    } catch (error) {
      console.error("Update product error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  app.delete("/api/products/:id", authenticate, authorize(["Marketing Team", "Technical Team", "Technical Back Office", "Manager", "Super Visor"]), async (req, res) => {
    await db.query("DELETE FROM products WHERE id = $1", [req.params.id]);
    await db.query("DELETE FROM product_field_values WHERE product_id = $1", [req.params.id]);
    res.json({ success: true });
  });

  // Product Codes (Coding Team)
  app.post("/api/products/:id/code", authenticate, authorize(["Coding Team", "Technical Team", "Technical Back Office", "Manager", "Super Visor"]), async (req, res) => {
    const { productCode, modifierGroups } = req.body;
    const productId = req.params.id;
    
    try {
      await db.transaction(async (client) => {
        // 1. Product Code
        const existingProductCode = await db.get("SELECT id FROM product_codes WHERE product_id = $1", [productId]);
        if (existingProductCode) {
          await client.query("UPDATE product_codes SET code = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP WHERE product_id = $3", [productCode, (req as any).user.id, productId]);
        } else {
          await client.query("INSERT INTO product_codes (product_id, code, updated_by) VALUES ($1, $2, $3)", [productId, productCode, (req as any).user.id]);
        }

        // 2. Modifier Groups and Options Codes
        if (modifierGroups && Array.isArray(modifierGroups)) {
          for (const group of modifierGroups) {
            await client.query("UPDATE modifier_groups SET code = $1 WHERE id = $2", [group.code, group.id]);
            if (group.options && Array.isArray(group.options)) {
              for (const option of group.options) {
                await client.query("UPDATE modifier_options SET code = $1 WHERE id = $2", [option.code, option.id]);
              }
            }
          }
        }
      });
      
      broadcast({ type: "CODE_UPDATED", productId });
      await logAction((req as any).user.id, "UPDATE_CODES", "products", Number(productId), null, { productCode, modifierGroups });
      res.json({ success: true });
    } catch (error) {
      console.error("Update product code error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // User Management
  try {
    db.exec("ALTER TABLE users ADD COLUMN branch_id INTEGER REFERENCES branches(id)");
  } catch (e) {}

  // User Management
  app.get("/api/roles", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    const roles = await db.all("SELECT * FROM roles");
    res.json(roles);
  });

  app.get("/api/users", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    const users = await db.all(`
      SELECT u.id, u.username, u.role_id, u.brand_id, u.branch_id, u.is_active, r.name as role_name, b.name as brand_name, br.name as branch_name 
      FROM users u 
      JOIN roles r ON u.role_id = r.id
      LEFT JOIN brands b ON u.brand_id = b.id
      LEFT JOIN branches br ON u.branch_id = br.id
    `) as any[];

    const usersWithBrands = [];
    for (const user of users) {
      const brands = await db.all(`
        SELECT b.id, b.name 
        FROM user_brands ub 
        JOIN brands b ON ub.brand_id = b.id 
        WHERE ub.user_id = $1
      `, [user.id]) as { id: number, name: string }[];
      
      usersWithBrands.push({
        ...user,
        brand_ids: brands.map(b => b.id),
        brand_names: brands.map(b => b.name)
      });
    }

    res.json(usersWithBrands);
  });

  app.post("/api/users", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    const { username, password, role_id, brand_id, branch_id, brand_ids } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    try {
      const userId = await db.transaction(async (client) => {
        const result = await client.query("INSERT INTO users (username, password_hash, role_id, brand_id, branch_id) VALUES ($1, $2, $3, $4, $5) RETURNING id", [username, hashedPassword, role_id, brand_id || null, branch_id || null]);
        const newUserId = result.rows[0].id;

        if (brand_ids && Array.isArray(brand_ids)) {
          for (const bid of brand_ids) {
            await client.query("INSERT INTO user_brands (user_id, brand_id) VALUES ($1, $2)", [newUserId, bid]);
          }
        }
        return newUserId;
      });

      res.json({ id: userId });
    } catch (e) {
      console.error("Create user error:", e);
      res.status(400).json({ error: "Username already exists" });
    }
  });

  app.put("/api/users/:id", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    const { is_active, role_id, username, password, brand_id, branch_id, brand_ids } = req.body;
    const userId = req.params.id;
    
    try {
      await db.transaction(async (client) => {
        if (password) {
          const hashedPassword = bcrypt.hashSync(password, 10);
          await client.query("UPDATE users SET username = $1, password_hash = $2, is_active = $3, role_id = $4, brand_id = $5, branch_id = $6 WHERE id = $7", 
            [username, hashedPassword, is_active ? 1 : 0, role_id, brand_id || null, branch_id || null, userId]);
        } else {
          await client.query("UPDATE users SET username = $1, is_active = $2, role_id = $3, brand_id = $4, branch_id = $5 WHERE id = $6", 
            [username, is_active ? 1 : 0, role_id, brand_id || null, branch_id || null, userId]);
        }

        // Update multiple brands
        await client.query("DELETE FROM user_brands WHERE user_id = $1", [userId]);
        if (brand_ids && Array.isArray(brand_ids)) {
          for (const bid of brand_ids) {
            await client.query("INSERT INTO user_brands (user_id, brand_id) VALUES ($1, $2)", [userId, bid]);
          }
        }
      });

      res.json({ success: true });
    } catch (e) {
      console.error("Update user error:", e);
      res.status(400).json({ error: "Username already exists or update failed" });
    }
  });

  app.delete("/api/users/:id", authenticate, authorize(["Manager", "Super Visor"]), async (req, res) => {
    const userId = req.params.id;
    // Prevent deleting self
    if (Number(userId) === (req as any).user.id) {
      return res.status(400).json({ error: "Cannot delete yourself" });
    }
    await db.query("DELETE FROM users WHERE id = $1", [userId]);
    res.json({ success: true });
  });

  // Audit Logs
  app.get("/api/audit-logs", authenticate, authorize(["Manager", "Call Center", "Super Visor"]), async (req, res) => {
    const logs = await db.all(`
      SELECT a.*, u.username 
      FROM audit_logs a 
      LEFT JOIN users u ON a.user_id = u.id 
      ORDER BY timestamp DESC LIMIT 100
    `);
    res.json(logs);
  });

  // Busy Branch Records
  app.get("/api/busy-periods/export", authenticate, async (req, res) => {
    const restriction = await getBrandRestriction((req as any).user);
    let query = `
      SELECT b.*, u.username 
      FROM busy_period_records b 
      JOIN users u ON b.user_id = u.id 
    `;
    const params: any[] = [];

    if (restriction) {
      const placeholders = restriction.brands.map((_, i) => `$${i + 1}`).join(',');
      if (restriction.type === 'include') {
        query += ` WHERE b.brand IN (${placeholders})`;
      } else {
        query += ` WHERE b.brand NOT IN (${placeholders})`;
      }
      params.push(...restriction.brands);
    }

    query += " ORDER BY b.created_at DESC";
    const records = await db.all(query, params) as any[];

    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true, timeZone: 'Asia/Kuwait'
    });

    const data = records.map(r => ({
      'Brand': r.brand,
      'Branch': r.branch,
      'Date': r.date,
      'Start Time': r.start_time,
      'End Time': r.end_time,
      'Duration': r.total_duration,
      'Reason': r.reason_category,
      'Responsible': r.responsible_party,
      'Comment': r.comment || '',
      'Notes': r.internal_notes || '',
      'Recorded By': r.username,
      'Recorded Date & time': r.created_at ? formatter.format(new Date(r.created_at + (r.created_at.includes('Z') || r.created_at.includes('T') ? '' : 'Z'))) : ''
    }));

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Busy Periods");
    
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=busy_periods_export.xlsx');
    res.send(buffer);
  });

  app.get("/api/busy-periods", authenticate, async (req, res) => {
    const user = (req as any).user;
    const restriction = await getBrandRestriction(user);
    let query = `
      SELECT b.*, u.username 
      FROM busy_period_records b 
      JOIN users u ON b.user_id = u.id 
    `;
    const params: any[] = [];
    const conditions: string[] = [];
    
    if (user.role_name === 'Restaurants') {
      if (user.branch_id) {
        const branch = await db.get("SELECT name FROM branches WHERE id = $1", [user.branch_id]) as { name: string };
        if (branch) {
          conditions.push(`b.branch = $${params.length + 1}`);
          params.push(branch.name);
        } else {
          conditions.push("1 = 0");
        }
      } else if (restriction) {
        const placeholders = restriction.brands.map((_, i) => `$${params.length + i + 1}`).join(',');
        if (restriction.type === 'include') {
          conditions.push(`b.brand IN (${placeholders})`);
        } else {
          conditions.push(`b.brand NOT IN (${placeholders})`);
        }
        params.push(...restriction.brands);
      } else {
        conditions.push("1 = 0");
      }
    } else if (restriction) {
      const placeholders = restriction.brands.map((_, i) => `$${params.length + i + 1}`).join(',');
      if (restriction.type === 'include') {
        conditions.push(`b.brand IN (${placeholders})`);
      } else {
        conditions.push(`b.brand NOT IN (${placeholders})`);
      }
      params.push(...restriction.brands);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY b.created_at DESC LIMIT 500";
    const records = await db.all(query, params);
    res.json(records);
  });

  // Hidden Items Routes
  app.get("/api/hidden-items", authenticate, async (req, res) => {
    const user = (req as any).user;
    const restriction = await getBrandRestriction(user);
    const productNameFieldId = await getProductNameFieldId();

    let query = `
      SELECT h.*, u.username, b.name as brand_name, br.name as branch_name, 
             fv.value as product_name, uu.username as updated_by_username
      FROM hidden_items h
      JOIN users u ON h.user_id = u.id
      JOIN brands b ON h.brand_id = b.id
      LEFT JOIN branches br ON h.branch_id = br.id
      LEFT JOIN product_field_values fv ON h.product_id = fv.product_id AND fv.field_id = $1
      LEFT JOIN users uu ON h.updated_by = uu.id
    `;
    const params: any[] = [productNameFieldId];
    const conditions: string[] = [];

    if (user.role_name === 'Restaurants') {
      if (user.branch_id) {
        conditions.push(`h.branch_id = $${params.length + 1}`);
        params.push(user.branch_id);
      } else if (restriction) {
        const placeholders = restriction.brands.map((_, i) => `$${params.length + i + 1}`).join(',');
        if (restriction.type === 'include') {
          conditions.push(`b.name IN (${placeholders})`);
        } else {
          conditions.push(`b.name NOT IN (${placeholders})`);
        }
        params.push(...restriction.brands);
      } else {
        conditions.push("1 = 0");
      }
    } else if (restriction) {
      const placeholders = restriction.brands.map((_, i) => `$${params.length + i + 1}`).join(',');
      if (restriction.type === 'include') {
        conditions.push(`b.name IN (${placeholders})`);
      } else {
        conditions.push(`b.name NOT IN (${placeholders})`);
      }
      params.push(...restriction.brands);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " ORDER BY h.created_at DESC LIMIT 500";
    const records = await db.all(query, params);
    res.json(records);
  });

  app.put("/api/hidden-items/:id", authenticate, authorize(["Technical Back Office", "Manager", "Super Visor"]), async (req, res) => {
    const { id } = req.params;
    const { brand_id, branch_id, product_id, agent_name, reason, action_to_unhide, comment, requested_at, responsible_party } = req.body;
    const now = getCurrentKuwaitTime();
    const userId = (req as any).user.id;

    try {
      const oldItem = await db.get("SELECT * FROM hidden_items WHERE id = $1", [id]);
      if (!oldItem) {
        return res.status(404).json({ error: "Hidden item not found" });
      }

      const result = await db.query(`
        UPDATE hidden_items 
        SET brand_id = $1, branch_id = $2, product_id = $3, agent_name = $4, reason = $5, action_to_unhide = $6, comment = $7, requested_at = $8, responsible_party = $9, updated_at = $10, updated_by = $11
        WHERE id = $12
      `, [brand_id, branch_id, product_id, agent_name, reason, action_to_unhide, comment, requested_at, responsible_party, now, userId, id]);

      if (result.rowCount > 0) {
        // Log the edit action
        const productNameFieldId = await getProductNameFieldId();
        const productInfo = await db.get(`
          SELECT fv.value as product_name, b.name as brand_name
          FROM products p
          LEFT JOIN product_field_values fv ON p.id = fv.product_id AND fv.field_id = $1
          LEFT JOIN brands b ON p.brand_id = b.id
          WHERE p.id = $2
        `, [productNameFieldId, product_id]) as any;

        const branchInfo = branch_id ? await db.get("SELECT name FROM branches WHERE id = $1", [branch_id]) as any : { name: 'All Branches' };

        const logData = {
          ...req.body,
          product_name: productInfo?.product_name || 'Unknown Product',
          brand_name: productInfo?.brand_name || 'Unknown Brand',
          branch_name: branchInfo?.name || 'All Branches'
        };

        await db.query(`
          INSERT INTO audit_logs (user_id, action, target_table, target_id, old_value, new_value, timestamp)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [userId, 'EDIT_HIDDEN_ITEM', 'hidden_items', id, JSON.stringify(oldItem), JSON.stringify(logData), now]);

        broadcast({ type: "HIDDEN_ITEMS_UPDATED" });
        res.json({ success: true });
      } else {
        res.status(404).json({ error: "Hidden item not found" });
      }
    } catch (error) {
      console.error("Error updating hidden item:", error);
      res.status(500).json({ error: "Failed to update hidden item" });
    }
  });

  app.post("/api/hidden-items", authenticate, authorize(["Technical Back Office", "Manager", "Restaurants", "Super Visor"]), async (req, res) => {
    const { 
      brand_id, branch_id, product_ids, agent_name, reason, 
      action_to_unhide, comment, responsible_party 
    } = req.body;
    const requested_at = getCurrentKuwaitTime();

    if ((req as any).user.role_name === 'Restaurants') {
      const result = await db.query(`
        INSERT INTO pending_requests (user_id, type, data, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [(req as any).user.id, 'hide_unhide', JSON.stringify({ ...req.body, requested_at }), getCurrentKuwaitTime(), getCurrentKuwaitTime()]);
      
      broadcast({ type: "PENDING_REQUEST_CREATED" });
      return res.json({ id: result.rows[0].id, pending: true });
    }

    try {
      await db.transaction(async (client) => {
        const now = getCurrentKuwaitTime();
        const productNameFieldId = await getProductNameFieldId();
        const brand = await db.get("SELECT name FROM brands WHERE id = $1", [brand_id]) as { name: string };
        
        if (branch_id === null) {
          // Hide for all branches of the brand
          const branches = await db.all("SELECT id, name FROM branches WHERE brand_id = $1", [brand_id]) as { id: number, name: string }[];
          for (const productId of product_ids) {
            const product = await db.get(`
              SELECT fv.value as name 
              FROM product_field_values fv 
              WHERE fv.product_id = $1 AND fv.field_id = $2
            `, [productId, productNameFieldId]) as { name: string };

            for (const branch of branches) {
              await client.query(`
                INSERT INTO hidden_items (
                  user_id, brand_id, branch_id, product_id, agent_name, reason, 
                  action_to_unhide, comment, requested_at, responsible_party, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              `, [(req as any).user.id, brand_id, branch.id, productId, agent_name, reason, action_to_unhide, comment, requested_at, responsible_party, now]);
              
              await client.query(`
                INSERT INTO hide_history (
                  user_id, brand_id, branch_id, product_id, action,
                  agent_name, reason, action_to_unhide, comment, requested_at, responsible_party, timestamp
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
              `, [(req as any).user.id, brand_id, branch.id, productId, 'HIDE', agent_name, reason, action_to_unhide, comment, requested_at, responsible_party, now]);
              
              await logAction((req as any).user.id, "HIDE", "products", productId, null, { 
                product_name: product?.name || 'Unknown', 
                brand_name: brand?.name || 'Unknown',
                branch: branch.name,
                reason: reason,
                brand_id: brand_id,
                branch_id: branch.id
              });
            }
          }
        } else {
          // Hide for specific branch
          const branch = await db.get("SELECT name FROM branches WHERE id = $1", [branch_id]) as { name: string };
          for (const productId of product_ids) {
            const product = await db.get(`
              SELECT fv.value as name 
              FROM product_field_values fv 
              WHERE fv.product_id = $1 AND fv.field_id = $2
            `, [productId, productNameFieldId]) as { name: string };

            await client.query(`
              INSERT INTO hidden_items (
                user_id, brand_id, branch_id, product_id, agent_name, reason, 
                action_to_unhide, comment, requested_at, responsible_party, created_at
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [(req as any).user.id, brand_id, branch_id, productId, agent_name, reason, action_to_unhide, comment, requested_at, responsible_party, now]);
            
            await client.query(`
              INSERT INTO hide_history (
                user_id, brand_id, branch_id, product_id, action,
                agent_name, reason, action_to_unhide, comment, requested_at, responsible_party, timestamp
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
            `, [(req as any).user.id, brand_id, branch_id, productId, 'HIDE', agent_name, reason, action_to_unhide, comment, requested_at, responsible_party, now]);
            
            await logAction((req as any).user.id, "HIDE", "products", productId, null, { 
              product_name: product?.name || 'Unknown', 
              brand_name: brand?.name || 'Unknown',
              branch: branch?.name || 'Unknown',
              reason: reason,
              brand_id: brand_id,
              branch_id: branch_id
            });
          }
        }
      });

      broadcast({ type: "HIDDEN_ITEMS_UPDATED" });
      res.json({ success: true });
    } catch (error) {
      console.error("Error adding hidden items:", error);
      res.status(500).json({ error: "Failed to add hidden items" });
    }
  });

  app.get("/api/hidden-items/export", authenticate, async (req, res) => {
    const restriction = await getBrandRestriction((req as any).user);
    let query = `
      SELECT 
        hi.id,
        b.name as brand_name,
        br.name as branch_name,
        fv.value as product_name,
        hi.agent_name,
        hi.reason,
        hi.action_to_unhide,
        hi.comment,
        hi.requested_at,
        hi.responsible_party,
        hi.created_at,
        u.username
      FROM hidden_items hi
      JOIN brands b ON hi.brand_id = b.id
      LEFT JOIN branches br ON hi.branch_id = br.id
      JOIN products p ON hi.product_id = p.id
      JOIN product_field_values fv ON p.id = fv.product_id AND fv.field_id = $1
      JOIN users u ON hi.user_id = u.id
    `;
    const productNameFieldId = await getProductNameFieldId();
    const params: any[] = [productNameFieldId];

    if (restriction) {
      const placeholders = restriction.brands.map((_, i) => `$${i + 2}`).join(',');
      if (restriction.type === 'include') {
        query += ` WHERE b.name IN (${placeholders})`;
      } else {
        query += ` WHERE b.name NOT IN (${placeholders})`;
      }
      params.push(...restriction.brands);
    }

    query += " ORDER BY hi.created_at DESC";
    const records = await db.all(query, params);

    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true, timeZone: 'Asia/Kuwait'
    });

    const data = records.map((r: any) => ({
      'Brand': r.brand_name,
      'Branch': r.branch_name || 'All Branches',
      'Item': r.product_name,
      'Agent': r.agent_name,
      'Reason': r.reason,
      'Action to Unhide': r.action_to_unhide,
      'Comment': r.comment,
      'Requested At': r.requested_at ? formatter.format(new Date(r.requested_at)) : '',
      'Responsible Party': r.responsible_party,
      'Recorded By': r.username,
      'Recorded At': r.created_at ? formatter.format(new Date(r.created_at + (r.created_at.includes('Z') || r.created_at.includes('T') ? '' : 'Z'))) : ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Hidden Items");
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=hidden_items.xlsx');
    res.send(buffer);
  });

  app.get("/api/export-history", authenticate, authorize(["Technical Back Office", "Manager", "Call Center", "Super Visor"]), async (req, res) => {
    const { startDate, endDate, brandId, branchId } = req.query as any;

    const logs = await db.all(`
      SELECT l.*, u.username
      FROM audit_logs l
      JOIN users u ON l.user_id = u.id
      WHERE (l.action = 'HIDE' OR l.action = 'UNHIDE' OR l.action = 'EDIT_HIDDEN_ITEM')
      AND (l.target_table = 'products' OR l.target_table = 'hidden_items')
      ORDER BY l.timestamp ASC
    `) as any[];

    const sessions: any[] = [];
    const activeSessions: { [key: string]: any } = {};

    logs.forEach(log => {
      try {
        const data = JSON.parse(log.new_value || log.old_value || '{}');
        const productId = log.action === 'EDIT_HIDDEN_ITEM' ? data.product_id : log.target_id;
        const branch = data.branch_name || data.branch || data.branches || 'All Branches';
        const key = `${productId}-${branch}`;

        if (log.action === 'HIDE') {
          const session = {
            id: log.id,
            Brand: data.brand_name || 'Unknown Brand',
            Branch: branch,
            Item: data.product_name || 'Unknown Product',
            'Hide Time': log.timestamp,
            'Unhide Time': null,
            'Update Info': '',
            updateLogs: [] as any[],
            'Duration (Min)': null as number | null,
            Agent: data.agent_name || '',
            Reason: data.reason || '',
            'Action to Unhide': data.action_to_unhide || '',
            Comment: data.comment || '',
            'Requested At': data.requested_at || '',
            'Recorded By': log.username,
            brand_id: data.brand_id,
            branch_id: data.branch_id
          };
          sessions.push(session);
          activeSessions[key] = session;
        } else if (log.action === 'UNHIDE') {
          let session = activeSessions[key];
          
          if (!session && branch !== 'All Branches') {
            const allBranchesKey = `${productId}-All Branches`;
            session = activeSessions[allBranchesKey];
          }

          if (session) {
            if (!session['Unhide Time']) {
              session['Unhide Time'] = log.timestamp;
              session.Branch = branch;
              const hideTime = new Date(session['Hide Time'] + (session['Hide Time'].includes('Z') || session['Hide Time'].includes('T') ? '' : 'Z')).getTime();
              const unhideTime = new Date(log.timestamp + (log.timestamp.includes('Z') || log.timestamp.includes('T') ? '' : 'Z')).getTime();
              session['Duration (Min)'] = Math.round((unhideTime - hideTime) / (1000 * 60));
              
              if (session.Branch === branch) {
                delete activeSessions[key];
              }
            } else if (session['Unhide Time'] === log.timestamp) {
              if (session.Branch !== branch && !session.Branch.includes(branch)) {
                if (session.Branch !== 'All Branches') {
                  session.Branch = "Multiple Branches";
                }
              }
            } else {
              const newSession = {
                ...session,
                id: log.id,
                Branch: branch,
                'Unhide Time': log.timestamp,
                updateLogs: [...session.updateLogs],
              };
              const hideTime = new Date(newSession['Hide Time'] + (newSession['Hide Time'].includes('Z') || newSession['Hide Time'].includes('T') ? '' : 'Z')).getTime();
              const unhideTime = new Date(log.timestamp + (log.timestamp.includes('Z') || log.timestamp.includes('T') ? '' : 'Z')).getTime();
              newSession['Duration (Min)'] = Math.round((unhideTime - hideTime) / (1000 * 60));
              sessions.push(newSession);
            }
          } else {
            sessions.push({
              Brand: data.brand_name || 'Unknown Brand',
              Branch: branch,
              Item: data.product_name || 'Unknown Product',
              'Hide Time': null,
              'Unhide Time': log.timestamp,
              'Update Info': '',
              updateLogs: [],
              'Duration (Min)': null,
              Agent: data.agent_name || '',
              Reason: data.reason || '',
              'Action to Unhide': data.action_to_unhide || '',
              Comment: data.comment || '',
              'Requested At': data.requested_at || '',
              'Recorded By': log.username,
              brand_id: data.brand_id,
              branch_id: data.branch_id
            });
          }
        } else if (log.action === 'EDIT_HIDDEN_ITEM') {
          let session = activeSessions[key];
          if (!session && branch !== 'All Branches') {
            const allBranchesKey = `${productId}-All Branches`;
            session = activeSessions[allBranchesKey];
          }

          if (session) {
            session.updateLogs.push(log);
          } else {
            const lastSession = [...sessions].reverse().find(s => 
              s.Item === (data.product_name || 'Unknown Product') && 
              (s.Branch === branch || s.Branch === 'All Branches')
            );
            if (lastSession) {
              lastSession.updateLogs.push(log);
            }
          }
        }
      } catch (e) {
        console.error("Error parsing log data for export", e);
      }
    });

    let filteredSessions = [...sessions];

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      filteredSessions = filteredSessions = filteredSessions.filter(s => {
        const hideTime = s['Hide Time'] ? new Date(s['Hide Time'] + (s['Hide Time'].includes('Z') || s['Hide Time'].includes('T') ? '' : 'Z')) : null;
        const unhideTime = s['Unhide Time'] ? new Date(s['Unhide Time'] + (s['Unhide Time'].includes('Z') || s['Unhide Time'].includes('T') ? '' : 'Z')) : null;
        return (hideTime && hideTime >= start) || (unhideTime && unhideTime >= start);
      });
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filteredSessions = filteredSessions.filter(s => {
        const hideTime = s['Hide Time'] ? new Date(s['Hide Time'] + (s['Hide Time'].includes('Z') || s['Hide Time'].includes('T') ? '' : 'Z')) : null;
        const unhideTime = s['Unhide Time'] ? new Date(s['Unhide Time'] + (s['Unhide Time'].includes('Z') || s['Unhide Time'].includes('T') ? '' : 'Z')) : null;
        return (hideTime && hideTime <= end) || (unhideTime && unhideTime <= end);
      });
    }

    if (brandId) {
      const brand = await db.get("SELECT name FROM brands WHERE id = $1", [brandId]) as { name: string };
      filteredSessions = filteredSessions.filter(s => {
        if (s.brand_id) return String(s.brand_id) === String(brandId);
        // Fallback for older logs
        return brand && s.Brand === brand.name;
      });
    }

    if (branchId) {
      if (branchId === 'all') {
        filteredSessions = filteredSessions.filter(s => s.Branch === 'All Branches');
      } else {
        const branch = await db.get("SELECT name FROM branches WHERE id = $1", [branchId]) as { name: string };
        filteredSessions = filteredSessions.filter(s => {
          if (s.branch_id) return String(s.branch_id) === String(branchId);
          // Fallback for older logs
          return branch && s.Branch === branch.name;
        });
      }
    }

    const formatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: true, timeZone: 'Asia/Kuwait'
    });

    const formattedHistory = filteredSessions.reverse().map(s => {
      let updateInfo = '';
      if (s.updateLogs.length > 0) {
        const lastUpdate = s.updateLogs[s.updateLogs.length - 1];
        updateInfo = `Last update: ${formatter.format(new Date(lastUpdate.timestamp + (lastUpdate.timestamp.includes('Z') || lastUpdate.timestamp.includes('T') ? '' : 'Z')))} by ${lastUpdate.username}`;
        if (s.updateLogs.length > 1) {
          updateInfo += ` (${s.updateLogs.length} total edits)`;
        }
      }

      return {
        'Brand': s.Brand,
        'Branch': s.Branch,
        'Item': s.Item,
        'Hide Time': s['Hide Time'] ? formatter.format(new Date(s['Hide Time'] + (s['Hide Time'].includes('Z') || s['Hide Time'].includes('T') ? '' : 'Z'))) : 'N/A',
        'Unhide Time': s['Unhide Time'] ? formatter.format(new Date(s['Unhide Time'] + (s['Unhide Time'].includes('Z') || s['Unhide Time'].includes('T') ? '' : 'Z'))) : 'STILL HIDDEN',
        'Update Info': updateInfo || '-',
        'Duration (Min)': s['Duration (Min)'] !== null ? s['Duration (Min)'] : (s['Hide Time'] && !s['Unhide Time'] ? '-' : 'N/A'),
        'Agent': s.Agent,
        'Reason': s.Reason,
        'Action to Unhide': s['Action to Unhide'],
        'Comment': s.Comment,
        'Requested At': s['Requested At'] 
          ? (s['Requested At'].includes('/') || s['Requested At'].includes('-') 
              ? formatter.format(new Date(s['Requested At'] + (s['Requested At'].includes('Z') || s['Requested At'].includes('T') ? '' : 'Z')))
              : s['Requested At'])
          : '',
        'Recorded By': s['Recorded By']
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedHistory);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Operation History");
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=operation_history.xlsx');
    res.send(buffer);
  });

  app.delete("/api/hidden-items/:id", authenticate, authorize(["Technical Back Office", "Manager", "Super Visor"]), async (req, res) => {
    const item = await db.get(`
      SELECT hi.*, fv.value as product_name, br.name as branch_name, b.name as brand_name
      FROM hidden_items hi
      LEFT JOIN product_field_values fv ON hi.product_id = fv.product_id AND fv.field_id = $1
      LEFT JOIN branches br ON hi.branch_id = br.id
      LEFT JOIN brands b ON hi.brand_id = b.id
      WHERE hi.id = $2
    `, [await getProductNameFieldId(), req.params.id]) as any;

    if (item) {
      const unhide_at = getCurrentKuwaitTime();
      await logAction((req as any).user.id, "UNHIDE", "products", item.product_id, { 
        product_name: item.product_name || 'Unknown Product', 
        brand_name: item.brand_name || 'Unknown Brand',
        branch: item.branch_name || 'All Branches',
        brand_id: item.brand_id,
        branch_id: item.branch_id
      }, null);
      await db.query(`
        INSERT INTO hide_history (
          user_id, brand_id, branch_id, product_id, action,
          agent_name, reason, action_to_unhide, comment, requested_at, responsible_party, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        (req as any).user.id, item.brand_id, item.branch_id, item.product_id, 'UNHIDE',
        item.agent_name, item.reason, item.action_to_unhide, 
        item.comment, unhide_at, item.responsible_party, unhide_at
      ]);
    }

    await db.query("DELETE FROM hidden_items WHERE id = $1", [req.params.id]);
    broadcast({ type: "HIDDEN_ITEMS_UPDATED" });
    res.json({ success: true });
  });

  app.post("/api/hidden-items/bulk-unhide", authenticate, authorize(["Technical Back Office", "Manager", "Super Visor"]), async (req, res) => {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "Invalid IDs" });
    }

    await db.transaction(async (client) => {
      const unhide_at = getCurrentKuwaitTime();
      const productNameFieldId = await getProductNameFieldId();

      for (const id of ids) {
        const item = await client.query(`
          SELECT hi.*, fv.value as product_name, br.name as branch_name, b.name as brand_name
          FROM hidden_items hi
          LEFT JOIN product_field_values fv ON hi.product_id = fv.product_id AND fv.field_id = $1
          LEFT JOIN branches br ON hi.branch_id = br.id
          LEFT JOIN brands b ON hi.brand_id = b.id
          WHERE hi.id = $2
        `, [productNameFieldId, id]).then(res => res.rows[0]) as any;

        if (item) {
          await logAction((req as any).user.id, "UNHIDE", "products", item.product_id, { 
            product_name: item.product_name || 'Unknown Product', 
            brand_name: item.brand_name || 'Unknown Brand',
            branch: item.branch_name || 'All Branches',
            brand_id: item.brand_id,
            branch_id: item.branch_id
          }, null);

          await client.query(`
            INSERT INTO hide_history (
              user_id, brand_id, branch_id, product_id, action,
              agent_name, reason, action_to_unhide, comment, requested_at, responsible_party, timestamp
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `, [
            (req as any).user.id, item.brand_id, item.branch_id, item.product_id, 'UNHIDE',
            item.agent_name, item.reason, item.action_to_unhide, 
            item.comment, unhide_at, item.responsible_party, unhide_at
          ]);

          await client.query("DELETE FROM hidden_items WHERE id = $1", [id]);
        }
      }
    });

    broadcast({ type: "HIDDEN_ITEMS_UPDATED" });
    res.json({ success: true });
  });

  app.post("/api/busy-periods", authenticate, async (req, res) => {
    const { 
      date, brand, branch, reason_category, responsible_party, 
      comment, internal_notes 
    } = req.body;

    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Kuwait',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
    const start_time = formatter.format(now);
    const end_time = '';
    const total_duration = '';
    const total_duration_minutes = 0;

    if ((req as any).user.role_name === 'Restaurants') {
      const result = await db.query(`
        INSERT INTO pending_requests (user_id, type, data, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id
      `, [(req as any).user.id, 'busy_branch', JSON.stringify({ ...req.body, start_time, end_time, total_duration, total_duration_minutes }), getCurrentKuwaitTime(), getCurrentKuwaitTime()]);
      
      broadcast({ type: "PENDING_REQUEST_CREATED" });
      return res.json({ id: result.rows[0].id, pending: true });
    }
    
    const result = await db.query(`
      INSERT INTO busy_period_records (
        user_id, date, brand, branch, start_time, end_time, 
        total_duration, total_duration_minutes, reason_category, responsible_party, 
        comment, internal_notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING id
    `, [
      (req as any).user.id, date, brand, branch, start_time, end_time,
      total_duration, total_duration_minutes, reason_category, responsible_party,
      comment, internal_notes, getCurrentKuwaitTime()
    ]);
    
    await logAction((req as any).user.id, "BUSY", "busy_period_records", Number(result.rows[0].id), null, { 
      date, brand, branch, start_time, end_time, total_duration, reason_category 
    });
    
    broadcast({ type: "BUSY_PERIOD_CREATED" });
    res.json({ id: result.rows[0].id });
  });

  app.put("/api/busy-periods/:id", authenticate, async (req, res) => {
    const { id } = req.params;
    let { action, end_time, total_duration, total_duration_minutes } = req.body;
    
    const record = await db.get("SELECT * FROM busy_period_records WHERE id = $1", [id]) as any;
    if (!record) return res.status(404).json({ error: "Record not found" });

    if (action === 'OPEN' || !end_time) {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Kuwait',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
      end_time = formatter.format(now);
      
      // Calculate duration
      try {
        const startParts = record.start_time.split(':');
        const endParts = end_time.split(':');
        
        const startTotalMinutes = parseInt(startParts[0]) * 60 + parseInt(startParts[1]);
        const endTotalMinutes = parseInt(endParts[0]) * 60 + parseInt(endParts[1]);
        
        let diff = endTotalMinutes - startTotalMinutes;
        if (diff < 0) diff += 24 * 60; // handle overnight
        
        const hours = Math.floor(diff / 60);
        const minutes = diff % 60;
        total_duration = `${hours}h ${minutes}m`;
        total_duration_minutes = diff;
      } catch (e) {
        console.error("Error calculating duration", e);
        total_duration = '0h 0m';
        total_duration_minutes = 0;
      }
    }

    await db.query(`
      UPDATE busy_period_records 
      SET end_time = $1, total_duration = $2, total_duration_minutes = $3
      WHERE id = $4
    `, [end_time, total_duration, total_duration_minutes || 0, id]);
    
    await logAction((req as any).user.id, "BUSY_UPDATE", "busy_period_records", Number(id), null, { 
      brand: record.brand, branch: record.branch, end_time, total_duration, reason_category: record.reason_category 
    });
    
    broadcast({ type: "BUSY_PERIOD_UPDATED" });
    res.json({ success: true });
  });

  // Busy Branch Config Routes
  app.get("/api/branches", authenticate, async (req, res) => {
    const user = (req as any).user;
    const { brand_id, all } = req.query;
    const restriction = all === 'true' ? null : await getBrandRestriction(user);
    let query = "SELECT b.*, br.name as brand_name FROM branches b JOIN brands br ON b.brand_id = br.id";
    const params: any[] = [];
    const conditions: string[] = [];

    if (brand_id) {
      conditions.push("b.brand_id = $" + (params.length + 1));
      params.push(brand_id);
    }

    if (user.branch_id) {
      conditions.push("b.id = $" + (params.length + 1));
      params.push(user.branch_id);
    }

    if (restriction) {
      const placeholders = restriction.brands.map((_, i) => '$' + (params.length + i + 1)).join(',');
      if (restriction.type === 'include') {
        conditions.push(`br.name IN (${placeholders})`);
      } else {
        conditions.push(`br.name NOT IN (${placeholders})`);
      }
      params.push(...restriction.brands);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    const branches = await db.all(query, params);
    res.json(branches);
  });

  app.post("/api/branches", authenticate, authorize(["Technical Back Office", "Manager"]), async (req, res) => {
    const { brand_id, name } = req.body;
    await db.query("INSERT INTO branches (brand_id, name) VALUES ($1, $2)", [brand_id, name]);
    res.json({ success: true });
  });

  app.delete("/api/branches/:id", authenticate, authorize(["Technical Back Office", "Manager"]), async (req, res) => {
    await db.query("DELETE FROM branches WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  });

  app.get("/api/busy-reasons", authenticate, async (req, res) => {
    const reasons = await db.all("SELECT * FROM busy_branch_reasons");
    res.json(reasons);
  });

  app.post("/api/busy-reasons", authenticate, authorize(["Manager"]), async (req, res) => {
    await db.query("INSERT INTO busy_branch_reasons (name) VALUES ($1)", [req.body.name]);
    res.json({ success: true });
  });

  app.delete("/api/busy-reasons/:id", authenticate, authorize(["Manager"]), async (req, res) => {
    await db.query("DELETE FROM busy_branch_reasons WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  });

  app.get("/api/busy-responsible", authenticate, async (req, res) => {
    const resp = await db.all("SELECT * FROM busy_branch_responsible");
    res.json(resp);
  });

  app.post("/api/busy-responsible", authenticate, authorize(["Technical Back Office", "Manager"]), async (req, res) => {
    await db.query("INSERT INTO busy_branch_responsible (name) VALUES ($1)", [req.body.name]);
    res.json({ success: true });
  });

  app.delete("/api/busy-responsible/:id", authenticate, authorize(["Technical Back Office", "Manager"]), async (req, res) => {
    await db.query("DELETE FROM busy_branch_responsible WHERE id = $1", [req.params.id]);
    res.json({ success: true });
  });

  // Reports Routes
  app.get("/api/reports/brands", authenticate, async (req, res) => {
    const { brand_id } = req.query;
    let query = `
      SELECT 
        b.name as brand_name,
        (SELECT COUNT(*) FROM products WHERE brand_id = b.id) as total_products,
        (SELECT COUNT(DISTINCT product_id) FROM hidden_items WHERE brand_id = b.id) as hidden_products
      FROM brands b
    `;
    const params: any[] = [];
    if (brand_id) {
      query += " WHERE b.id = $1";
      params.push(brand_id);
    }
    query += " ORDER BY total_products DESC";
    
    const report = await db.all(query, params);
    res.json(report);
  });

  app.get("/api/reports/branch-hides", authenticate, async (req, res) => {
    const { branch_id, brand_id, date } = req.query;
    let query = `
      SELECT 
        br.name as branch_name,
        COUNT(CASE WHEN (hh.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date THEN 1 END) as today_count,
        COUNT(CASE WHEN (hh.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date - INTERVAL '7 days' THEN 1 END) as week_count,
        COUNT(CASE WHEN (hh.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date - INTERVAL '30 days' THEN 1 END) as month_count,
        COUNT(hh.id) as total_count
      FROM branches br
      LEFT JOIN hide_history hh ON br.id = hh.branch_id AND hh.action = 'HIDE'
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (branch_id) {
      conditions.push("br.id = $" + (params.length + 1));
      params.push(branch_id);
    }
    if (brand_id) {
      conditions.push("br.brand_id = $" + (params.length + 1));
      params.push(brand_id);
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " GROUP BY br.id, br.name ORDER BY total_count DESC";
    
    const report = await db.all(query, params);
    res.json(report);
  });

  app.get("/api/reports/branch-busy", authenticate, async (req, res) => {
    const { branch_id, brand_id, date, period } = req.query;
    let query = `
      SELECT 
        branch as branch_name,
        COUNT(*) as total_instances,
        SUM(total_duration_minutes) as total_minutes,
        AVG(total_duration_minutes) as avg_minutes
      FROM busy_period_records
    `;
    const params: any[] = [];
    const conditions: string[] = [];

    if (branch_id) {
      const branchResult = await db.get("SELECT name FROM branches WHERE id = $1", [branch_id]) as { name: string };
      if (branchResult) {
        conditions.push("branch = $" + (params.length + 1));
        params.push(branchResult.name);
      }
    }
    if (brand_id) {
      const brandResult = await db.get("SELECT name FROM brands WHERE id = $1", [brand_id]) as { name: string };
      if (brandResult) {
        conditions.push("brand = $" + (params.length + 1));
        params.push(brandResult.name);
      }
    }

    if (date) {
      conditions.push("date = $" + (params.length + 1));
      params.push(date);
    }

    if (period === 'today') {
      conditions.push("(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date");
    } else if (period === 'week') {
      conditions.push("(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date - INTERVAL '7 days'");
    } else if (period === 'month') {
      conditions.push("(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date - INTERVAL '30 days'");
    }

    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }

    query += " GROUP BY branch ORDER BY total_minutes DESC";
    
    const report = await db.all(query, params);
    res.json(report);
  });

  app.get("/api/reports/reasons", authenticate, async (req, res) => {
    const { period } = req.query;
    let query = `SELECT reason_category as name, COUNT(*) as value FROM busy_period_records`;
    const conditions = [];
    if (period === 'today') conditions.push("(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date");
    else if (period === 'week') conditions.push("(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date - INTERVAL '7 days'");
    else if (period === 'month') conditions.push("(created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date - INTERVAL '30 days'");
    
    if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
    query += " GROUP BY reason_category ORDER BY value DESC";
    res.json(await db.all(query));
  });

  app.get("/api/reports/timeline", authenticate, async (req, res) => {
    const query = `
      SELECT 
        (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date as date,
        COUNT(*) as incidents,
        SUM(total_duration_minutes) as duration
      FROM busy_period_records
      WHERE (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date - INTERVAL '30 days'
      GROUP BY (created_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date
      ORDER BY date ASC
    `;
    res.json(await db.all(query));
  });

  app.get("/api/reports/user-kpi", authenticate, async (req, res) => {
    const user = (req as any).user;
    let { user_id, period } = req.query;
    
    // If not manager, force user_id to current user
    if (user.role_name !== 'Manager') {
      user_id = user.id.toString();
    }
    
    let query = `
      SELECT 
        u.id as user_id,
        u.username,
        al.action,
        al.target_table,
        COUNT(*) as count
      FROM audit_logs al
      JOIN users u ON al.user_id = u.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];
    
    if (user_id && user_id !== 'all') {
      conditions.push("al.user_id = $" + (params.length + 1));
      params.push(user_id);
    }
    
    if (period === 'today') conditions.push("(al.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date");
    else if (period === 'week') conditions.push("(al.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date - INTERVAL '7 days'");
    else if (period === 'month') conditions.push("(al.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date - INTERVAL '30 days'");
    
    if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
    query += " GROUP BY u.id, u.username, al.action, al.target_table ORDER BY count DESC";
    
    const report = await db.all(query, params);
    res.json(report);
  });

  app.get("/api/reports/user-activity-details", authenticate, async (req, res) => {
    const user = (req as any).user;
    let { user_id, period } = req.query;

    // If not manager, force user_id to current user
    if (user.role_name !== 'Manager') {
      user_id = user.id.toString();
    }

    let query = `
      SELECT 
        al.id,
        u.username,
        al.action,
        al.target_table,
        al.target_id,
        al.old_value,
        al.new_value,
        al.timestamp
      FROM audit_logs al
      JOIN users u ON al.user_id = u.id
    `;
    const params: any[] = [];
    const conditions: string[] = [];
    
    if (user_id && user_id !== 'all') {
      conditions.push("al.user_id = $" + (params.length + 1));
      params.push(user_id);
    }
    
    if (period === 'today') conditions.push("(al.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date");
    else if (period === 'week') conditions.push("(al.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date - INTERVAL '7 days'");
    else if (period === 'month') conditions.push("(al.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Kuwait')::date >= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kuwait')::date - INTERVAL '30 days'");
    
    if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
    query += " ORDER BY al.timestamp DESC LIMIT 500";
    
    const logs = await db.all(query, params);
    res.json(logs);
  });

  app.get("/api/export", authenticate, async (req, res) => {
    const products = await db.all(`
      SELECT p.id, b.name as brand, pc.code as product_code, p.created_at
      FROM products p
      JOIN brands b ON p.brand_id = b.id
      LEFT JOIN product_codes pc ON p.id = pc.product_id
    `);
    
    const ws = XLSX.utils.json_to_sheet(products);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Products");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    
    res.setHeader("Content-Disposition", "attachment; filename=products.xlsx");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  });

  // Serve static files
  const isProduction = process.env.NODE_ENV === "production" || process.env.RAILWAY_ENVIRONMENT_NAME !== undefined;
  const distPath = path.join(process.cwd(), "dist");
  
  if (fs.existsSync(distPath)) {
    console.log("Production mode: Serving static files from", distPath);
    app.use(express.static(distPath));
    app.get("*", (req, res, next) => {
      if (req.url.startsWith("/api")) return next();
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    console.log("Development mode: Starting Vite middleware...");
    try {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } catch (e) {
      console.error("Vite middleware failed:", e);
    }
  }

  // Global Error Handler
  app.use((err: any, req: any, res: any, next: any) => {
    console.error("Global Error:", err);
    res.status(err.status || 500).json({ 
      error: err.message || "Internal Server Error",
      details: process.env.NODE_ENV === 'production' ? null : err.stack
    });
  });

  console.log("Attempting to start server on port", PORT);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

console.log("Calling startServer()...");
startServer().catch(err => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
