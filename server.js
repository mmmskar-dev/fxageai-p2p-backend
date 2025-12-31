import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

/* ---------- BINANCE ---------- */
async function fetchBinance(fiat, tradeType) {
  const res = await fetch("https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      page: 1,
      rows: 10,
      payTypes: [],
      asset: "USDT",
      tradeType,
      fiat,
      publisherType: null
    })
  });
  const json = await res.json();
  return json.data || [];
}

/* ---------- OKX ---------- */
async function fetchOKX(fiat, side) {
  const url = `https://www.okx.com/v3/c2c/tradingOrders/books?t=${Date.now()}&quoteCurrency=${fiat}&baseCurrency=USDT&side=${side}&paymentMethod=all`;
  const res = await fetch(url);
  const json = await res.json();
  return json.data || [];
}

/* ---------- API ---------- */
app.get("/p2p", async (req, res) => {
  try {
    const { fiat } = req.query;

    const binanceBuy = await fetchBinance(fiat, "BUY");
    const binanceSell = await fetchBinance(fiat, "SELL");

    const okxBuy = await fetchOKX(fiat, "buy");
    const okxSell = await fetchOKX(fiat, "sell");

    res.json({
      fiat,
      timestamp: Date.now(),
      binance: { buy: binanceBuy, sell: binanceSell },
      okx: { buy: okxBuy, sell: okxSell }
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch P2P data" });
  }
});

app.listen(PORT, () => {
  console.log("P2P backend running on port", PORT);
});
