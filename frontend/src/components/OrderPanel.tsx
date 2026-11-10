import { useState } from "react";
import type { FormEvent } from "react";
import { ASSETS, LIMITS } from "../config";
import type { AssetSymbol } from "../config";
import type { OpenTradeInput, Side } from "../lib/api";
import { useFeedStatus, useQuote } from "../lib/priceFeed";
import { liquidationPrice, positionSize } from "../lib/math";
import { formatAmount, formatPrice, formatUsd } from "../lib/format";
import type { Session } from "../hooks/useAccount";

const LEVERAGE_PRESETS = [1, 5, 10, 25, 50, 100];

const MARGIN_SHARES = [
  { label: "10%", share: 0.1 },
  { label: "25%", share: 0.25 },
  { label: "50%", share: 0.5 },
  { label: "Max", share: 1 },
];

/** Keep only digits and a single dot, with at most `decimals` decimal places. */
function cleanDecimal(value: string, decimals: number): string {
  const [whole = "", ...rest] = value.replace(/[^\d.]/g, "").split(".");
  if (rest.length === 0) return whole;
  return `${whole}.${rest.join("").slice(0, decimals)}`;
}

type Props = {
  asset: AssetSymbol;
  session: Session;
  balance: number | null;
  onSubmit: (input: OpenTradeInput) => Promise<boolean>;
  onSignIn: () => void;
};

/** The order ticket: direction, margin, leverage, slippage, and what you get. */
export function OrderPanel({ asset, session, balance, onSubmit, onSignIn }: Props) {
  const info = ASSETS[asset];
  const quote = useQuote(asset);
  const feed = useFeedStatus();

  const [side, setSide] = useState<Side>("long");
  const [marginText, setMarginText] = useState("");
  const [leverage, setLeverage] = useState(10);
  const [slippageText, setSlippageText] = useState("1");
  const [submitting, setSubmitting] = useState(false);

  const margin = Number(marginText);
  const slippage = Number(slippageText);
  const price = quote?.price;
  const signedIn = session.status === "user";
  const live = feed === "live" && price !== undefined;
  const hasMargin = marginText !== "" && margin > 0;

  let problem: string | null = null;

  if (signedIn && marginText !== "") {
    if (!(margin >= LIMITS.minMargin)) {
      problem = `Minimum margin is ${formatUsd(LIMITS.minMargin)}.`;
    } else if (balance !== null && margin > balance) {
      problem = "Margin is more than your available balance.";
    }
  }

  if (!problem && !(slippage >= LIMITS.minSlippagePct && slippage <= LIMITS.maxSlippagePct)) {
    problem = `Slippage must be between ${LIMITS.minSlippagePct}% and ${LIMITS.maxSlippagePct}%.`;
  }

  const size = hasMargin ? positionSize(margin, leverage) : undefined;
  const quantity = size !== undefined && price ? size / price : undefined;
  const liquidation = price ? liquidationPrice(side, price, leverage) : undefined;

  const sideLabel = `${side === "long" ? "Long" : "Short"} ${asset}`;

  let buttonLabel = sideLabel;
  let disabled = false;

  if (session.status === "loading") {
    buttonLabel = "Loading…";
    disabled = true;
  } else if (!signedIn) {
    buttonLabel = "Sign in to trade";
  } else if (submitting) {
    buttonLabel = "Placing order…";
    disabled = true;
  } else if (!live) {
    buttonLabel = "Waiting for prices…";
    disabled = true;
  } else if (!hasMargin) {
    buttonLabel = "Enter margin";
    disabled = true;
  } else if (problem) {
    disabled = true;
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();

    if (!signedIn) {
      onSignIn();
      return;
    }

    if (disabled || price === undefined) return;

    setSubmitting(true);

    const opened = await onSubmit({
      asset,
      side,
      margin,
      leverage,
      slippagePct: slippage,
      expectedPrice: price,
    });

    setSubmitting(false);
    if (opened) setMarginText("");
  };

  const fillShare = (share: number) => {
    if (balance === null) return;
    // Round down so "Max" never asks for more than the balance.
    setMarginText((Math.floor(balance * share * 100) / 100).toFixed(2));
  };

  return (
    <form className="panel order" aria-label={`Trade ${asset}`} onSubmit={handleSubmit} noValidate>
      <div className="side-toggle" role="group" aria-label="Direction">
        <button type="button" className="side-btn long" aria-pressed={side === "long"} onClick={() => setSide("long")}>
          Long
        </button>
        <button type="button" className="side-btn short" aria-pressed={side === "short"} onClick={() => setSide("short")}>
          Short
        </button>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="order-margin">
          Margin
          <span className="aside">Available {formatUsd(signedIn ? balance : null)}</span>
        </label>
        <div className="input-wrap">
          <input
            id="order-margin"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            value={marginText}
            onChange={(event) => setMarginText(cleanDecimal(event.target.value, 2))}
          />
          <span className="suffix">USDC</span>
        </div>
        <div className="chips">
          {MARGIN_SHARES.map(({ label, share }) => (
            <button
              key={label}
              type="button"
              className="chip"
              disabled={!signedIn || !balance}
              onClick={() => fillShare(share)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="order-leverage">
          Leverage
          <output htmlFor="order-leverage">{leverage}x</output>
        </label>
        <input
          id="order-leverage"
          className="range"
          type="range"
          min={LIMITS.minLeverage}
          max={LIMITS.maxLeverage}
          step={1}
          value={leverage}
          aria-valuetext={`${leverage}x`}
          onChange={(event) => setLeverage(Number(event.target.value))}
        />
        <div className="chips">
          {LEVERAGE_PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="chip"
              aria-pressed={leverage === preset}
              onClick={() => setLeverage(preset)}
            >
              {preset}x
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="order-slippage">
          Slippage tolerance
        </label>
        <div className="input-wrap">
          <input
            id="order-slippage"
            inputMode="decimal"
            autoComplete="off"
            value={slippageText}
            onChange={(event) => setSlippageText(cleanDecimal(event.target.value, 2))}
          />
          <span className="suffix">%</span>
        </div>
      </div>

      <dl className="order-summary">
        <div>
          <dt>Entry price (mark)</dt>
          <dd>{formatPrice(price, info.precision)}</dd>
        </div>
        <div>
          <dt>Position size</dt>
          <dd>{formatUsd(size)}</dd>
        </div>
        <div>
          <dt>Quantity</dt>
          <dd>{quantity === undefined ? "—" : `${formatAmount(quantity, 5)} ${asset}`}</dd>
        </div>
        <div>
          <dt>Est. liquidation price</dt>
          <dd>{formatPrice(liquidation, info.precision)}</dd>
        </div>
      </dl>

      {problem && (
        <p className="form-hint" role="alert">
          {problem}
        </p>
      )}

      <button
        type="submit"
        className={`btn btn-block ${side === "long" ? "btn-long" : "btn-short"}`}
        disabled={disabled}
      >
        {buttonLabel}
      </button>

      <p className="fineprint">
        Market order, filled at the live mid price. Paper trading: every account starts with demo funds.
      </p>
    </form>
  );
}
