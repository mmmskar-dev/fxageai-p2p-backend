import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

/* ================= FX CACHE ================= */
let fxCache = {
  lastUpdate: 0,
  rates: { UGX: 0, TZS: 0 }
}; 

async function getFX() {
  const now = Date.now();

  // Update once per hour
  if (now - fxCache.lastUpdate < 60 * 60 * 1000) {
    return fxCache.rates;
  }

  // exchangerate.host is free, no key, mid-market
  const res = await fetch(
    "https://api.exchangerate.host/latest?base=USD&symbols=KES,UGX,TZS"
  );
  const json = await res.json();

  const usdKes = json.rates.KES;
  const usdUgx = json.rates.UGX;
  const usdTzs = json.rates.TZS;

  fxCache.rates = {
    UGX: usdKes / usdUgx, // UGX → KES
    TZS: usdKes / usdTzs  // TZS → KES
  };

  fxCache.lastUpdate = now;
  return fxCache.rates;
}

/* ================= BINANCE ================= */
async function fetchBinance(fiat, tradeType) {
  const res = await fetch(
    "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page: 1,
        rows: 10,
        asset: "USDT",
        fiat,
        tradeType,
        publisherType: null
      })
    }
  );
  const json = await res.json();
  return json.data || [];
}

/* ================= OKX ================= */
async function fetchOKX(fiat, side) {
  const url =
    `https://www.okx.com/v3/c2c/tradingOrders/books?` +
    `quoteCurrency=${fiat}&baseCurrency=USDT&side=${side}&paymentMethod=all`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "application/json"
    }
  });

  const json = await res.json();
  return json?.data || [];
}

/* ================= API ================= */
app.get("/p2p", async (req, res) => {
  try {
    const { fiat } = req.query;
    const fx = await getFX();

    const binanceBuy = await fetchBinance(fiat, "BUY");
    const binanceSell = await fetchBinance(fiat, "SELL");

    const okxBuy = await fetchOKX(fiat, "buy");
    const okxSell = await fetchOKX(fiat, "sell");

    res.json({
      fiat,
      fx,
      timestamp: Date.now(),
      binance: { buy: binanceBuy, sell: binanceSell },
      okx: { buy: okxBuy, sell: okxSell }
    });

  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Backend fetch failed" });
  }
});

app.listen(PORT, () =>
  console.log("FXageAI P2P backend running on port", PORT)
);
