import os
import json
import sqlite3
from collections import Counter
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from uuid import uuid4


LOCAL_DB = Path(__file__).with_name("demo.sqlite3")
MANILA = timezone(timedelta(hours=8))
PRODUCTS = [
    ("Coffee sachets", "Drinks", "sachet", 1000, 650, 18, 24),
    ("Instant noodles", "Pantry", "pack", 1500, 1100, 42, 15),
    ("Bottled water", "Drinks", "bottle", 1200, 800, 24, 16),
    ("Sardines", "Canned goods", "can", 2600, 2100, 33, 10),
    ("Laundry detergent", "Household", "sachet", 950, 720, 54, 12),
    ("Chocolate biscuits", "Snacks", "pack", 1200, 900, 29, 12),
    ("Shampoo", "Personal care", "sachet", 800, 500, 15, 12),
    ("Cooking oil", "Pantry", "pouch", 3200, 2600, 24, 8),
]

TABLES = (
    """CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, unit TEXT NOT NULL,
    price INTEGER NOT NULL CHECK (price >= 0), cost INTEGER NOT NULL CHECK (cost >= 0),
    stock INTEGER NOT NULL CHECK (stock >= 0), threshold INTEGER NOT NULL CHECK (threshold >= 0))""",
    "CREATE UNIQUE INDEX IF NOT EXISTS unique_product_name ON products (LOWER(name))",
    """CREATE TABLE IF NOT EXISTS sales (
    id TEXT PRIMARY KEY, day TEXT NOT NULL, method TEXT NOT NULL, customer TEXT NOT NULL,
    total INTEGER NOT NULL CHECK (total > 0), created_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS sale_items (
    sale_id TEXT NOT NULL REFERENCES sales(id), product_id TEXT NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL CHECK (quantity > 0), price INTEGER NOT NULL, cost INTEGER NOT NULL,
    PRIMARY KEY (sale_id, product_id))""",
    """CREATE TABLE IF NOT EXISTS movements (
    id TEXT PRIMARY KEY, day TEXT NOT NULL, product_id TEXT NOT NULL REFERENCES products(id),
    change INTEGER NOT NULL, reason TEXT NOT NULL, note TEXT NOT NULL,
    sale_id TEXT REFERENCES sales(id), stock_after INTEGER NOT NULL CHECK (stock_after >= 0),
    created_at TEXT NOT NULL, CHECK (change <> 0 OR reason IN ('count', 'opening')))""",
    """CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY, day TEXT NOT NULL, category TEXT NOT NULL, description TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0), created_at TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY, day TEXT NOT NULL, customer TEXT NOT NULL,
    amount INTEGER NOT NULL CHECK (amount > 0), created_at TEXT NOT NULL)""",
    "CREATE TABLE IF NOT EXISTS demo_seed (id INTEGER PRIMARY KEY)",
    """CREATE TABLE IF NOT EXISTS product_photos (
    product_id TEXT PRIMARY KEY REFERENCES products(id), photo TEXT NOT NULL)""",
    """CREATE TABLE IF NOT EXISTS sale_corrections (
    id TEXT PRIMARY KEY, sale_id TEXT NOT NULL REFERENCES sales(id), revision INTEGER NOT NULL,
    previous_entry TEXT NOT NULL, note TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(sale_id, revision))""",
)


class StoreError(ValueError):
    pass


def today():
    return datetime.now(MANILA).date()


def new_id():
    return str(uuid4())


def now():
    return datetime.now(timezone.utc).isoformat()


class Database:
    def __init__(self, connection, postgres):
        self.connection = connection
        self.postgres = postgres

    def run(self, query, *params):
        if self.postgres:
            query = query.replace("?", "%s")
        return self.connection.execute(query, params)

    def all(self, query, *params):
        return [dict(row) for row in self.run(query, *params).fetchall()]

    def one(self, query, *params):
        row = self.run(query, *params).fetchone()
        return dict(row) if row is not None else None


@contextmanager
def database(write=False):
    url = os.environ.get("DATABASE_URL")
    if url:
        import psycopg
        from psycopg.rows import dict_row

        connection = psycopg.connect(url, row_factory=dict_row, connect_timeout=10)
    else:
        path = os.environ.get("SARI_AI_DB") or LOCAL_DB
        connection = sqlite3.connect(path, timeout=10)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("BEGIN IMMEDIATE" if write else "BEGIN")
    try:
        if url and not write:
            connection.execute("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY")
        yield Database(connection, bool(url))
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize():
    if os.environ.get("RENDER") == "true" and not os.environ.get("DATABASE_URL"):
        raise RuntimeError("DATABASE_URL is required on Render.")
    with database(write=True) as db:
        if db.postgres:
            db.run("SELECT pg_advisory_xact_lock(913427)")
        for statement in TABLES:
            db.run(statement)
        if db.one("SELECT id FROM demo_seed WHERE id = 1"):
            return
        day = today()
        for index, product in enumerate(PRODUCTS):
            product_id = f"product-{index + 1}"
            db.run("INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?)", product_id, *product)
            demand = [12, 9, 8, 5, 4, 7, 3, 2][index]
            historical = []
            daily_sales_pattern = [0, 3, -2, 2, 1, -2, 4, 1, 3, -1, 2, 2, -2, 2, 0, 1, -1, 3, 2, 0, 1]
            for offset in range(28):
                qty = max(1, demand + daily_sales_pattern[(offset + index * 2) % 21] + (2 if offset < 5 else 0))
                historical.append((str(day - timedelta(days=offset)), qty))
            remaining = product[5] + sum(qty for _, qty in historical)
            move(db, str(day - timedelta(days=28)), product_id, remaining, "opening", "Demo opening count", remaining)
            for date, qty in reversed(historical):
                sale_id = new_id()
                method = "credit" if index == 3 and date == str(day) else "cash"
                customer = "Customer A" if method == "credit" else ""
                db.run("INSERT INTO sales VALUES (?, ?, ?, ?, ?, ?)",
                       sale_id, date, method, customer, qty * product[3], now())
                db.run("INSERT INTO sale_items VALUES (?, ?, ?, ?, ?)", sale_id, product_id, qty, product[3], product[4])
                remaining -= qty
                move(db, date, product_id, -qty, "sale", "", remaining, sale_id)
        for offset, category, description, amount in [
            (0, "Transport", "Market trip fare", 4500),
            (1, "Supplies", "Paper bags and tape", 8500),
            (3, "Utilities", "Share of electricity bill", 21000),
            (5, "Transport", "Market trip fare", 4500),
            (8, "Supplies", "Extra paper bags", 6500),
            (12, "Utilities", "Share of electricity bill", 18500),
        ]:
            db.run("INSERT INTO expenses VALUES (?, ?, ?, ?, ?, ?)", new_id(), str(day - timedelta(days=offset)),
                   category, description, amount, now())
        db.run("INSERT INTO demo_seed VALUES (1)")


def snapshot():
    with database() as db:
        return {
            "today": str(today()),
            "products": db.all("SELECT products.*, photo FROM products LEFT JOIN product_photos ON products.id = product_id ORDER BY name, id"),
            "sales": db.all("""SELECT sales.*, (SELECT COUNT(*) FROM sale_corrections WHERE sale_id = sales.id) AS revision
                          FROM sales ORDER BY day DESC, created_at DESC, id"""),
            "items": db.all("SELECT * FROM sale_items"),
            "movements": db.all("SELECT * FROM movements ORDER BY day DESC, created_at DESC, id"),
            "expenses": db.all("SELECT * FROM expenses ORDER BY day DESC, created_at DESC, id"),
            "payments": db.all("SELECT * FROM payments ORDER BY day DESC, created_at DESC, id"),
        }


def move(db, day, product_id, change, reason, note, stock_after, sale_id=None):
    db.run("INSERT INTO movements VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
           new_id(), day, product_id, change, reason, note, sale_id, stock_after, now())


def product_for(db, product_id):
    lock = " FOR UPDATE" if db.postgres else ""
    product = db.one("SELECT * FROM products WHERE id = ?" + lock, product_id)
    if not product:
        raise StoreError("Choose an existing product.")
    return product


def change_stock(db, day, product, change, reason, note="", sale_id=None):
    remaining = product["stock"] + change
    if remaining < 0:
        raise StoreError(f"Only {product['stock']} {product['unit']}(s) of {product['name']} are available.")
    if remaining > 1_000_000:
        raise StoreError("Stock cannot exceed 1,000,000 units per product.")
    if change:
        db.run("UPDATE products SET stock = ? WHERE id = ?", remaining, product["id"])
    if change or reason == "count":
        move(db, day, product["id"], change, reason, note, remaining, sale_id)
    return {"product_id": product["id"], "name": product["name"], "unit": product["unit"],
            "change": change, "on_hand": remaining}


def add_product(day, name, category, unit, price, cost, stock, threshold, note, photo=""):
    product_id = new_id()
    with database(write=True) as db:
        inserted = db.run("INSERT INTO products VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING",
                          product_id, name, category, unit, price, cost, stock, threshold)
        if inserted.rowcount != 1:
            raise StoreError("A product with this name already exists.")
        move(db, day, product_id, stock, "opening", note or "Manual opening count", stock)
        if photo:
            db.run("INSERT INTO product_photos VALUES (?, ?)", product_id, photo)
    return {"id": product_id, "name": name}


def update_product(product_id, cost, photo):
    with database(write=True) as db:
        product = product_for(db, product_id)
        db.run("UPDATE products SET cost = ? WHERE id = ?", cost, product_id)
        if photo:
            db.run("""INSERT INTO product_photos VALUES (?, ?)
                   ON CONFLICT (product_id) DO UPDATE SET photo = excluded.photo""", product_id, photo)
    return {"id": product_id, "name": product["name"]}


def add_movements(day, reason, entries):
    if len({entry["product_id"] for entry in entries}) != len(entries):
        raise StoreError("Use one line per product in each stock update.")
    with database(write=True) as db:
        stock = []
        for entry in sorted(entries, key=lambda item: item["product_id"]):
            product = product_for(db, entry["product_id"])
            change = entry["quantity"]
            if reason == "count":
                change -= product["stock"]
            elif reason == "waste":
                change = -change
            stock.append(change_stock(db, day, product, change, reason, entry["note"]))
    return {"stock": stock}


def add_sale(day, method, customer, entries):
    sale_id = new_id()
    quantities = Counter()
    for entry in entries:
        quantities[entry["product_id"]] += entry["quantity"]
    with database(write=True) as db:
        products = [product_for(db, product_id) for product_id in sorted(quantities)]
        stock = []
        total = sum(product["price"] * quantities[product["id"]] for product in products)
        if total < 1 or total > 2_000_000_000:
            raise StoreError("The sale total must be between ₱0.01 and ₱20,000,000.")
        db.run("INSERT INTO sales VALUES (?, ?, ?, ?, ?, ?)", sale_id, day, method, customer, total, now())
        for product in products:
            quantity = quantities[product["id"]]
            stock.append(change_stock(db, day, product, -quantity, "sale", sale_id=sale_id))
            db.run("INSERT INTO sale_items VALUES (?, ?, ?, ?, ?)", sale_id, product["id"],
                   quantity, product["price"], product["cost"])
    return {"id": sale_id, "method": method, "customer": customer, "total": total, "stock": stock}


def correct_sale(sale_id, revision, entries, note):
    quantities = Counter()
    for entry in entries:
        quantities[entry["product_id"]] += entry["quantity"]
    with database(write=True) as db:
        lock = " FOR UPDATE" if db.postgres else ""
        sale = db.one("SELECT * FROM sales WHERE id = ?" + lock, sale_id)
        if not sale:
            raise StoreError("Choose an existing sale.")
        current_revision = db.one("SELECT COUNT(*) AS revision FROM sale_corrections WHERE sale_id = ?", sale_id)["revision"]
        if revision != current_revision:
            raise StoreError("This sale has changed. Open its latest details before correcting it.")
        original = {item["product_id"]: item for item in db.all("SELECT * FROM sale_items WHERE sale_id = ?", sale_id)}
        if quantities == Counter({key: item["quantity"] for key, item in original.items()}):
            raise StoreError("Change a quantity or product before saving a correction.")
        if sale["method"] == "credit" and db.postgres:
            db.run("SELECT pg_advisory_xact_lock(913428)")
        products = {key: product_for(db, key) for key in sorted(set(original) | set(quantities))}
        prices = {key: original.get(key, products[key])["price"] for key in quantities}
        total = sum(prices[key] * quantity for key, quantity in quantities.items())
        if not 1 <= total <= 2_000_000_000:
            raise StoreError("The corrected sale total is invalid.")
        if sale["method"] == "credit":
            balance = outstanding_credit(db, sale["customer"])
            if balance + total - sale["total"] < 0:
                raise StoreError("The corrected amount would be less than repayments already recorded.")
        stock = []
        for key, product in products.items():
            change = original.get(key, {}).get("quantity", 0) - quantities[key]
            if not change:
                continue
            if db.one("""SELECT id FROM movements WHERE product_id = ? AND reason = 'count'
                       AND (day > ? OR created_at > ?) LIMIT 1""", key, sale["day"], sale["created_at"]):
                raise StoreError("A later physical count exists. Review that stock history before correcting the sale.")
            stock.append(change_stock(db, str(today()), product, change, "correction", note, sale_id))
        db.run("DELETE FROM sale_items WHERE sale_id = ?", sale_id)
        for key, quantity in quantities.items():
            db.run("INSERT INTO sale_items VALUES (?, ?, ?, ?, ?)", sale_id, key, quantity,
                   prices[key], original.get(key, products[key])["cost"])
        db.run("UPDATE sales SET total = ? WHERE id = ?", total, sale_id)
        db.run("INSERT INTO sale_corrections VALUES (?, ?, ?, ?, ?, ?)", new_id(), sale_id, revision + 1,
               json.dumps({"total": sale["total"], "items": list(original.values())}), note, now())
    return {"id": sale_id, "method": sale["method"], "customer": sale["customer"], "total": total, "stock": stock}


def add_expense(day, category, description, amount):
    expense_id = new_id()
    with database(write=True) as db:
        db.run("INSERT INTO expenses VALUES (?, ?, ?, ?, ?, ?)", expense_id, day, category, description, amount, now())
    return {"id": expense_id, "total": amount}


def outstanding_credit(db, customer):
    sales = db.one("SELECT SUM(total) AS total FROM sales WHERE method = 'credit' AND customer = ?", customer)
    paid = db.one("SELECT SUM(amount) AS total FROM payments WHERE customer = ?", customer)
    return (sales["total"] or 0) - (paid["total"] or 0)


def add_payment(day, customer, amount):
    with database(write=True) as db:
        if db.postgres:
            db.run("SELECT pg_advisory_xact_lock(913428)")
        balance = outstanding_credit(db, customer)
        if amount > balance:
            raise StoreError("Payment exceeds the customer's outstanding balance.")
        payment_id = new_id()
        db.run("INSERT INTO payments VALUES (?, ?, ?, ?, ?)", payment_id, day, customer, amount, now())
    return {"id": payment_id, "customer": customer, "total": amount, "balance": balance - amount}
