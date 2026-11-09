import WebSocket from "ws";
import { assets, WS_URL } from "./config";
import { decimals, latestPrices } from "./store";
import { redis } from "./redis";

let ws: WebSocket | null = null;
let requestId = 1;

function connectWS() {

  ws = new WebSocket(WS_URL);

  ws.on("open", () => {

    console.log("Connected to Backpack WS");

    assets.forEach((asset) => {

      const msg = {
        method: "SUBSCRIBE",
        params: [`bookTicker.${asset}`],
        id: requestId++
      };

      ws!.send(JSON.stringify(msg));

      console.log("Subscribed:", asset);

    });

  });

  ws.on("message", (msg) => {

    try {

      const parsed = JSON.parse(msg.toString());

      if (parsed?.data?.e !== "bookTicker") return;

      const symbol = parsed.data.s;

      const ask = parseFloat(parsed.data.a);
      const bid = parseFloat(parsed.data.b);

      if (isNaN(ask) || isNaN(bid)) return;

      const mid = (ask + bid) / 2;

      latestPrices[symbol] = {
        price: mid,
        decimal: decimals[symbol] ?? 0
      };
      console.log("Price update:", symbol, mid);

    } catch (err) {

      console.error("WS parse error:", err);    

    }

  });

  ws.on("error", (err) => {

    console.error("WebSocket error:", err);

  });

  ws.on("close", () => {

    console.log("WS closed. Reconnecting in 5s...");

    ws = null;

    setTimeout(connectWS, 5000);

  });

}

connectWS();