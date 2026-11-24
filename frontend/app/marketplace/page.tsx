"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
type Product = {
  _id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  stock: number;
  imageUrl?: string;
};

export default function MarketplacePage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadProducts(term = "") {
    const query = term ? `?search=${encodeURIComponent(term)}` : "";
    const response = await fetch(`${api}/marketplace/products${query}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message ?? "Unable to load marketplace");
    setProducts(payload.data);
  }

  useEffect(() => {
    loadProducts().catch((caught) => setError(caught instanceof Error ? caught.message : "Unable to load marketplace"));
  }, []);

  async function searchProducts(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await loadProducts(search);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to search products");
    }
  }

  async function addToCart(productId: string) {
    const token = localStorage.getItem("cricpsr_access_token");
    if (!token) {
      setError("Log in before adding items to your cart.");
      return;
    }
    setError("");
    setMessage("");
    try {
      const response = await fetch(`${api}/marketplace/cart/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ productId, quantity: 1 })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Unable to add product");
      setMessage("Added to cart.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to add product");
    }
  }

  return (
    <main className="market">
      <nav><Link className="brand" href="/">CRICPSR</Link><div><Link href="/cart">Cart</Link><Link href="/orders">Orders</Link><Link href="/seller">Sell</Link></div></nav>
      <header><p className="eyebrow">CRICPSR STORE</p><h1>Cricket gear, from local brands</h1><p>Discover equipment from brands serving the cricket community.</p></header>
      <form className="search" onSubmit={searchProducts}>
        <input aria-label="Search products" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bats, kits, and more" />
        <button type="submit">Search</button>
      </form>
      {message && <p className="success">{message}</p>}
      {error && <p className="error">{error}</p>}
      <section className="grid">
        {products.map((product) => (
          <article key={product._id}>
            {product.imageUrl ? <img src={product.imageUrl} alt="" /> : <div className="placeholder">CRICKET GEAR</div>}
            <small>{product.category} · {product.stock} in stock</small>
            <h2>{product.name}</h2><p>{product.description}</p><strong>₹{product.price}</strong>
            <button onClick={() => addToCart(product._id)}>Add to cart</button>
          </article>
        ))}
        {!products.length && <p>No products found yet. Approved brands will appear here.</p>}
      </section>
      <style>{`
        .market { min-height:100vh; max-width:1180px; margin:auto; padding:0 24px 64px; }
        nav { height:72px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #17283c; }
        nav div { display:flex; gap:20px; } .brand { font-weight:900; letter-spacing:.12em; }
        header { padding:48px 0 20px; } header p:not(.eyebrow) { color:#aab8ca; }
        .eyebrow { color:#32d583; font-size:12px; letter-spacing:.14em; }
        .search { display:flex; gap:10px; margin:16px 0 28px; }
        input { flex:1; min-width:0; border:1px solid #314559; border-radius:8px; background:#07111f; color:#fff; padding:12px; }
        button { border:0; border-radius:8px; background:#2684ff; color:#fff; padding:12px 16px; font-weight:800; cursor:pointer; }
        .grid { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
        article { display:flex; flex-direction:column; gap:10px; background:#0d1b2d; border:1px solid #1a3048; border-radius:12px; padding:18px; }
        article img,.placeholder { width:100%; height:170px; object-fit:cover; border-radius:8px; }
        .placeholder { display:grid; place-items:center; background:#13263c; color:#73aaff; font-weight:900; letter-spacing:.1em; }
        article small,article p { color:#aab8ca; } article h2,article p { margin:0; } article button { margin-top:auto; }
        .success { color:#32d583; } .error { color:#ff8a8a; }
        @media(max-width:800px){ .grid { grid-template-columns:1fr; } }
      `}</style>
    </main>
  );
}
