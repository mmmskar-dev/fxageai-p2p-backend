import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

/* ================= CONFIG ================= */

const PORT = process.env.PORT || 3000;

// configurable spreads
const SPREADS = {
  UGX: 0.012, // 1.2%
  TZS: 0.010  // 1.0%
};

// hourly mid-market FX source (reliable & free)
const FX_URL = "https://open.er-api.com/v6/latest/KES";

/* ================= HELPERS ================= */

async function getFX() {
  const res = await fetch(FX_URL);
  const data = await res.json();

  return {
    UGX: data.rates.UGX, // UGX per 1 KES
    TZS: data.rates.TZS  // TZS per 1 KES
  };
}

function applySpread(price, spread, side) {
  if (side === "buy") return price * (1 + spread);
  return price * (1 - spread);
}

/* ================= BINANCE ================= */

async function fetchBinanceKES(side) {
  const payload = {
    fiat: "KES",
    page: 1,
    rows: 10,
    tradeType: side === "buy" ? "BUY" : "SELL",
    asset: "USDT",
    payTypes: []
  };

  const res = await fetch(
    "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  const json = await res.json();

  return json.data.map(ad => ({
    price: Number(ad.adv.price),
    min: ad.adv.minSingleTransAmount,
    max: ad.adv.maxSingleTransAmount
  }));
}

/* ================= OKX ================= */

async function fetchOKXKES(side) {
  const res = await fetch(
    `https://www.okx.com/v3/c2c/tradingOrders/books?t=${Date.now()}`,
    {
      headers: { "accept": "application/json" }
    }
  );

  const json = await res.json();
  const list = side === "buy" ? json.data.buy : json.data.sell;

  return list.slice(0, 10).map(ad => ({
    price: Number(ad.price),
    min: ad.quoteMinAmount,
    max: ad.quoteMaxAmount
  }));
}

/* ================= ROUTE ================= */

app.get("/p2p", async (req, res) => {
  try {
    const fx = await getFX();

    // LIVE KES
    const [bBuy, bSell, oBuy, oSell] = await Promise.all([
      fetchBinanceKES("buy"),
      fetchBinanceKES("sell"),
      fetchOKXKES("buy"),
      fetchOKXKES("sell")
    ]);

    // DERIVED UGX & TZS
    const derive = (list, rate, spread, side) =>
      list.map(row => ({
        price: Math.round(applySpread(row.price * rate, spread, side)),
        min: row.min,
        max: row.max
      }));

    res.json({
      timestamp: Date.now(),

      KES: {
        binance: { buy: bBuy, sell: bSell },
        okx: { buy: oBuy, sell: oSell }
      },

      UGX: {
        derivedFrom: "KES",
        binance: {
          buy: derive(bBuy, fx.UGX, SPREADS.UGX, "buy"),
          sell: derive(bSell, fx.UGX, SPREADS.UGX, "sell")
        }
      },

      TZS: {
        derivedFrom: "KES",
        binance: {
          buy: derive(bBuy, fx.TZS, SPREADS.TZS, "buy"),
          sell: derive(bSell, fx.TZS, SPREADS.TZS, "sell")
        }
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Data fetch failed" });
  }
});

/* ================= START ================= */

app.listen(PORT, () =>
  console.log(`P2P backend running on port ${PORT}`)
);
