"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useState } from "react";
import type { Property } from "@/lib/data";
import type { SparkListingMedia } from "@/lib/spark";
import { irr } from "@/lib/finance";
import { PUBLIC_PHOTO_SOURCES, ZILLOW_MARKET_PULSE } from "@/lib/market";
import { DEAL_FEEDBACK_STORAGE_KEY, personalDealFit, rateDeal, readDealFeedback, type DealFeedback, type DealRating, type DealSignals } from "@/lib/deal-feedback";
import GoogleStreetView from "./GoogleStreetView";
import GoogleLocationMap from "./GoogleLocationMap";

type Comp = { id: number; address: string; soldPrice: number; saleDate: string; sqft: number; units: number };
type Reference = { address: string; value: number; yearBuilt: number | null; parcelId: string };
type Scenario = { name: string; down: number; rate: number; years: number; color: string };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const EXIT_COST_PCT = 8;
const scenarios: Scenario[] = [
  { name: "Conventional", down: 20, rate: 6.75, years: 30, color: "#3767e8" },
  { name: "Low down", down: 3.5, rate: 6.5, years: 30, color: "#0c9a78" },
  { name: "Owner finance", down: 10, rate: 5.5, years: 30, color: "#d17a22" },
];

function payment(principal: number, annualRate: number, years: number) {
  const rate = annualRate / 1200;
  const months = years * 12;
  return rate ? principal * rate * Math.pow(1 + rate, months) / (Math.pow(1 + rate, months) - 1) : principal / months;
}

function balance(principal: number, annualRate: number, years: number, paidMonths: number) {
  const rate = annualRate / 1200;
  const monthly = payment(principal, annualRate, years);
  const monthsPaid = Math.max(0, Math.min(years * 12, paidMonths));
  return rate ? principal * Math.pow(1 + rate, monthsPaid) - monthly * (Math.pow(1 + rate, monthsPaid) - 1) / rate : principal - monthly * monthsPaid;
}

function Num({ label, value, onChange, suffix }: { label: string; value: number; onChange: (value: number) => void; suffix?: string }) {
  return <label className="model-field"><span>{label}</span><div><input type="number" value={value} onChange={(event) => { const nextValue = Number(event.target.value); onChange(Number.isFinite(nextValue) ? nextValue : 0); }}/>{suffix && <i>{suffix}</i>}</div></label>;
}

export default function AnalysisClient({ subject, references, listingMedia, streetViewApiKey }: { subject: Property; references: Reference[]; listingMedia: SparkListingMedia; streetViewApiKey: string }) {
  const units = subject.units || 4;
  const otherUnits = Math.max(0, units - 1);
  const propertyLabel = units === 4 ? "Fourplex" : units === 6 ? "Sixplex" : `${units}-unit property`;
  const isSixplex = subject.parcelId.startsWith("sixplex-");
  const isMlsRecord = isSixplex || subject.parcelId.startsWith("mls-");
  const recordLabel = isSixplex ? "Matched MLS / assessor record" : isMlsRecord ? "MLS record" : "Municipal record";
  const valueLabel = isSixplex ? "Matched record value" : isMlsRecord ? "MLS price reference" : "Municipal assessment";
  const [price, setPrice] = useState(Math.round(subject.assessedValue));
  const [monthlyRent, setMonthlyRent] = useState(units * 1800);
  const [taxes, setTaxes] = useState(Math.round(subject.assessedValue * 0.012));
  const [insurance, setInsurance] = useState(4800);
  const [utilities, setUtilities] = useState(7200);
  const [vacancy, setVacancy] = useState(5);
  const [maintenance, setMaintenance] = useState(5);
  const [management, setManagement] = useState(8);
  const [capex, setCapex] = useState(5);
  const [otherExpenses, setOtherExpenses] = useState(0);
  const [appreciation, setAppreciation] = useState(3);
  const [rentGrowth, setRentGrowth] = useState(3);
  const [expenseGrowth, setExpenseGrowth] = useState(2.5);
  const [active, setActive] = useState(0);
  const [downPayment, setDownPayment] = useState(scenarios[0].down);
  const [interestRate, setInterestRate] = useState(scenarios[0].rate);
  const [amortizationYears, setAmortizationYears] = useState(scenarios[0].years);
  const [closingCostPct, setClosingCostPct] = useState(2);
  const [loanPointsPct, setLoanPointsPct] = useState(0);
  const [furnishedUnits, setFurnishedUnits] = useState(0);
  const [furnishingPerUnit, setFurnishingPerUnit] = useState(6500);
  const [repairReserve, setRepairReserve] = useState(25000);
  const [comps, setComps] = useState<Comp[]>([]);
  const [nextCompId, setNextCompId] = useState(1);
  const [activePhoto, setActivePhoto] = useState(0);
  const [feedback, setFeedback] = useState<DealFeedback[]>([]);
  const [feedbackReady, setFeedbackReady] = useState(false);
  const [feedbackError, setFeedbackError] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () => {
      if (!active) return;
      try { setFeedback(readDealFeedback(window.localStorage.getItem(DEAL_FEEDBACK_STORAGE_KEY))); }
      catch { setFeedbackError(true); }
      setFeedbackReady(true);
    };
    queueMicrotask(load);
    window.addEventListener("storage", load);
    return () => { active = false; window.removeEventListener("storage", load); };
  }, []);
  const scenario = scenarios[active];
  const photoSource = PUBLIC_PHOTO_SOURCES.find((source) => subject.address.toUpperCase().startsWith(source.address));
  const searchAddress = subject.address.includes(",") ? subject.address : `${subject.address} Anchorage AK`;
  const zillowSearch = `https://www.zillow.com/homes/${encodeURIComponent(searchAddress)}_rb/`;
  const mapQuery = encodeURIComponent(searchAddress);
  const streetViewUrl = subject.latitude !== null && subject.longitude !== null
    ? `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${subject.latitude},${subject.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
  const activeMlsPhoto = listingMedia.photos[activePhoto] ?? null;
  const primaryImage = activeMlsPhoto?.imageUrl || subject.aerialUrl;
  const canUseInteractiveStreetView = Boolean(streetViewApiKey && subject.latitude !== null && subject.longitude !== null);
  const buildingArea = listingMedia.facts.buildingArea ?? subject.buildingArea;
  const garageSpaces = listingMedia.facts.garageSpaces ?? subject.garageSpaces;
  const neighborhoodName = listingMedia.facts.subdivision || subject.subdivision || subject.locationTier;
  const propertyFacts = [
    ["Home type", propertyLabel],
    ["Building area", buildingArea ? `${buildingArea.toLocaleString()} sq ft · MLS reported` : "Not reported"],
    ["Garage spaces", garageSpaces !== null ? `${garageSpaces} · MLS reported` : "Not reported"],
    ["Neighborhood / subdivision", neighborhoodName || "Not reported"],
    ["Beds / baths", listingMedia.facts.bedrooms !== null || listingMedia.facts.bathrooms !== null ? `${listingMedia.facts.bedrooms ?? "—"} beds · ${listingMedia.facts.bathrooms ?? "—"} baths` : "Not reported"],
    ["Year built", subject.yearBuilt ? String(subject.yearBuilt) : "Unknown"],
    ["Lot size", subject.lotSize ? `${subject.lotSize.toLocaleString()} sq ft` : "Unknown"],
    ["Zoning", subject.zoning || "Unknown"],
    ["Ownership", subject.yearsOwned ? `${subject.yearsOwned} years` : "Verify deed"],
    ["Owner profile", subject.ownerType],
  ];

  const model = useMemo(() => {
    const termYears = Math.max(1, Math.min(30, Math.round(amortizationYears || 30)));
    const safePrice = Math.max(0, price);
    const safeMonthlyRent = Math.max(0, monthlyRent);
    const safeDownPayment = Math.max(0, Math.min(100, downPayment));
    const loan = safePrice * (1 - safeDownPayment / 100);
    const safeInterestRate = Math.max(0, interestRate);
    const monthlyPI = payment(loan, safeInterestRate, termYears);
    const gross = safeMonthlyRent * 12;
    const fixedExpenses = Math.max(0, taxes) + Math.max(0, insurance) + Math.max(0, utilities) + Math.max(0, otherExpenses);
    const operating = fixedExpenses + gross * (vacancy + maintenance + management + capex) / 100;
    const noi = gross - operating;
    const cashFlow = noi - monthlyPI * 12;
    const downPaymentCash = safePrice * safeDownPayment / 100;
    const closingCosts = safePrice * Math.max(0, closingCostPct) / 100;
    const loanPoints = loan * Math.max(0, loanPointsPct) / 100;
    const furnishingCost = Math.max(0, Math.min(units, furnishedUnits)) * Math.max(0, furnishingPerUnit);
    const safeRepairReserve = Math.max(0, repairReserve);
    const cashToClose = downPaymentCash + closingCosts + loanPoints + furnishingCost + safeRepairReserve;
    const compValues = comps.filter((comp) => comp.soldPrice > 0).map((comp) => comp.soldPrice);
    const compMedian = compValues.length ? [...compValues].sort((a, b) => a - b)[Math.floor(compValues.length / 2)] : null;
    const monthlySchedule = Array.from({ length: termYears * 12 }, (_, index) => {
      const beginningBalance = Math.max(0, balance(loan, safeInterestRate, termYears, index));
      const monthlyInterest = beginningBalance * safeInterestRate / 1200;
      const principalPaid = Math.min(beginningBalance, Math.max(0, monthlyPI - monthlyInterest));
      const actualPayment = monthlyInterest + principalPaid;
      return { month: index + 1, year: Math.floor(index / 12) + 1, beginningBalance, payment: actualPayment, principalPaid, interest: monthlyInterest, endingBalance: Math.max(0, beginningBalance - principalPaid) };
    });
    let cumulativeCashFlow = 0;
    const years = Array.from({ length: 30 }, (_, index) => {
      const year = index + 1;
      const value = safePrice * Math.pow(1 + appreciation / 100, year);
      const rent = gross * Math.pow(1 + rentGrowth / 100, index);
      const variable = gross * (vacancy + maintenance + management + capex) / 100 * Math.pow(1 + rentGrowth / 100, index);
      const fixed = fixedExpenses * Math.pow(1 + expenseGrowth / 100, index);
      const debtMonths = monthlySchedule.filter((row) => row.year === year);
      const annualDebtService = debtMonths.reduce((sum, row) => sum + row.payment, 0);
      const annualCashFlow = rent - variable - fixed - annualDebtService;
      cumulativeCashFlow += annualCashFlow;
      const beginningBalance = debtMonths[0]?.beginningBalance ?? 0;
      const endingBalance = debtMonths.at(-1)?.endingBalance ?? 0;
      const principalPaid = debtMonths.reduce((sum, row) => sum + row.principalPaid, 0);
      const annualInterest = debtMonths.reduce((sum, row) => sum + row.interest, 0);
      const totalPrincipalPaid = loan - endingBalance;
      const capitalPosition = -cashToClose + cumulativeCashFlow + totalPrincipalPaid;
      return { year, value, equity: value - endingBalance, cashFlow: annualCashFlow, beginningBalance, endingBalance, principalPaid, annualInterest, annualDebtService, capitalPosition };
    });
    const tenYearFlows = [-cashToClose, ...years.slice(0, 10).map((row, index) => index === 9 ? row.cashFlow + row.value * (1 - EXIT_COST_PCT / 100) - row.endingBalance : row.cashFlow)];
    const tenYearIrr = irr(tenYearFlows);
    const debtYield = loan ? noi / loan * 100 : 0;
    const breakEvenOccupancy = gross ? (operating - gross * vacancy / 100 + monthlyPI * 12) / gross * 100 : 0;
    const capitalBreakEvenYear = years.find((row) => row.capitalPosition >= 0)?.year ?? null;
    const piti = monthlyPI + taxes / 12 + insurance / 12;
    const otherUnitRent = monthlyRent * (otherUnits / units);
    const ownerHousingCost = piti + utilities / 12 - otherUnitRent * (1 - vacancy / 100);
    const fhaSelfSufficiencyMargin = otherUnitRent - piti;
    const yearTenExitProceeds = years[9].value * (1 - EXIT_COST_PCT / 100) - years[9].endingBalance;
    return { loan, monthlyPI, gross, operating, noi, cashFlow, cashToClose, downPaymentCash, closingCosts, loanPoints, furnishingCost, repairReserve: safeRepairReserve, compMedian, monthlySchedule, years, tenYearIrr, debtYield, breakEvenOccupancy, capitalBreakEvenYear, termYears, piti, otherUnitRent, ownerHousingCost, fhaSelfSufficiencyMargin, yearTenExitProceeds, capRate: safePrice ? noi / safePrice * 100 : 0, cashOnCash: cashToClose ? cashFlow / cashToClose * 100 : 0, dscr: monthlyPI ? noi / (monthlyPI * 12) : 0 };
  }, [price, downPayment, interestRate, amortizationYears, closingCostPct, loanPointsPct, furnishedUnits, furnishingPerUnit, repairReserve, monthlyRent, taxes, insurance, utilities, otherExpenses, vacancy, maintenance, management, capex, appreciation, rentGrowth, expenseGrowth, comps, units, otherUnits]);

  const maxEquity = Math.max(...model.years.map((row) => row.equity), 1);
  const maxCashFlow = Math.max(...model.years.map((row) => Math.abs(row.cashFlow)), 1);
  const capitalMin = Math.min(...model.years.map((row) => row.capitalPosition), 0);
  const capitalMax = Math.max(...model.years.map((row) => row.capitalPosition), 0);
  const capitalRange = Math.max(1, capitalMax - capitalMin);
  const capitalY = (value: number) => 205 - (value - capitalMin) / capitalRange * 170;
  const valueLow = Math.round(subject.assessedValue * 0.92 / 1000) * 1000;
  const valueHigh = Math.round(subject.assessedValue * 1.08 / 1000) * 1000;
  const verifiedCompCount = comps.filter((comp) => comp.soldPrice > 0).length;
  const monthlyCashFlow = model.cashFlow / 12;
  const dealSignals: DealSignals = {
    units, garageSpaces,
    locationScore: subject.locationGrade === "Unrated" ? null : subject.locationScore,
    transitCorridor: subject.locationGrade === "Unrated" ? null : subject.inTransitCorridor,
    yearBuilt: subject.yearBuilt || null,
    price, monthlyCashFlow, dscr: model.dscr, tenYearIrr: model.tenYearIrr,
  };
  const ownRating = feedback.find((row) => row.id === subject.parcelId)?.rating;
  const personalFit = personalDealFit(subject.parcelId, dealSignals, feedback);
  function saveRating(rating: DealRating) {
    const next = rateDeal(feedback, { id: subject.parcelId, address: subject.address, rating, signals: dealSignals, ratedAt: new Date().toISOString() });
    try {
      window.localStorage.setItem(DEAL_FEEDBACK_STORAGE_KEY, JSON.stringify(next));
      setFeedback(next);
      setFeedbackError(false);
    } catch { setFeedbackError(true); }
  }
  const decision = (() => {
    const hasCoreInputs = price > 0 && monthlyRent > 0;
    const isDown = !hasCoreInputs || monthlyCashFlow < 0 || model.dscr < 1 || model.tenYearIrr < 7 || model.breakEvenOccupancy > 100;
    const isUp = !isDown && model.cashFlow >= 0 && model.dscr >= 1.2 && model.tenYearIrr >= 12 && model.breakEvenOccupancy <= 90 && model.capRate >= 5;
    const verdict = isUp ? "up" : isDown ? "down" : "maybe";
    const title = isUp ? "Thumbs up — advance to due diligence" : isDown ? "Thumbs down — do not proceed on these inputs" : "Maybe — improve the deal before moving forward";
    const headline = isUp
      ? "The modeled income covers the debt with a cushion and the projected 10-year return clears the Buy Lab screen."
      : isDown
        ? "The current price, income, or financing does not support a resilient rental investment case."
        : "The deal is close enough to investigate, but it needs a better price, more verified income, or stronger financing terms.";
    const nextStep = !hasCoreInputs
      ? "Enter a purchase price and total monthly rent before trusting the recommendation."
      : verifiedCompCount < 3
        ? "Add at least three verified closed-sale comps before treating the price as supported."
        : monthlyCashFlow < 0
          ? "Lower the offer, verify higher rent, or restructure financing until year-one cash flow is positive."
          : model.dscr < 1.2
            ? "Improve NOI or lower debt: a 1.20× DSCR is the next lender-style screen to clear."
            : model.breakEvenOccupancy > 90
              ? "Reduce fixed costs or debt; the property needs too much occupancy to stay whole."
              : model.tenYearIrr < 12
                ? "Negotiate the price or confirm a better rent/exit case to improve the projected return."
                : "Verify leases, operating statements, insurance, taxes, title, and building condition before an offer.";
    const story = `Putting ${money.format(model.cashToClose)} into this purchase is projected to ${monthlyCashFlow >= 0 ? `produce ${money.format(monthlyCashFlow)} per month before income tax` : `use ${money.format(Math.abs(monthlyCashFlow))} per month before income tax`}. The ${model.dscr.toFixed(2)}× DSCR means operating income ${model.dscr >= 1.2 ? "covers the mortgage with a cushion" : model.dscr >= 1 ? "covers the mortgage, but with a thin cushion" : "does not fully cover the mortgage"}. If rent, expenses, financing, ${appreciation}% annual value growth, and an ${EXIT_COST_PCT}% sale cost hold through year 10, the model estimates a ${model.tenYearIrr.toFixed(1)}% levered IRR.`;
    return { verdict, title, headline, nextStep, story };
  })();
  const addComp = () => { setComps([...comps, { id: nextCompId, address: "", soldPrice: 0, saleDate: "", sqft: 0, units }]); setNextCompId(nextCompId + 1); };
  const updateComp = (id: number, field: keyof Comp, value: string | number) => setComps(comps.map((comp) => comp.id === id ? { ...comp, [field]: value } : comp));
  const selectScenario = (index: number) => {
    const selected = scenarios[index];
    setActive(index); setDownPayment(selected.down); setInterestRate(selected.rate); setAmortizationYears(selected.years);
  };

  return <div className="app-shell model-app">
    <aside className="sidebar"><div><div className="logo"><span>PE</span><div>Property<br/>Extraction</div></div><nav><a href="/browse">Browse deals</a><a href="/">← Prospects</a><a href="/off-market">Off-market candidates</a><a href="/garages">Garage deals</a><a href="/flexmls">Flexmls</a><a className="active" href="#decision">Decision Bot</a><a href="#overview">Property overview</a><a href="#location-map">Anchorage map</a><a href="#deal-analysis">Deal analysis</a><a href="#comps">Comparable sales</a><a href="#returns">30-year outlook</a></nav></div><form action="/api/logout" method="post"><button className="logout">Sign out</button></form></aside>
    <main className="workspace model-workspace">
      <header className="portal-header"><div><p className="eyebrow">PROPERTY DETAIL · {isSixplex ? `MLS ${subject.parcelId.slice("sixplex-".length)}` : isMlsRecord ? `MLS ${subject.parcelId.slice("mls-".length)}` : `PARCEL ${subject.parcelId}`}</p><p className="portal-breadcrumb">Alaska multifamily / Buy Lab</p></div><div className="portal-actions"><a href={streetViewUrl} target="_blank" rel="noreferrer">Street View ↗</a><a className="evidence top-evidence" target="_blank" rel="noreferrer" href={subject.evidenceUrl}>{recordLabel} ↗</a></div></header>
      <nav className="listing-tabs" aria-label="Property sections"><span className="section-label">Jump to</span><a href="#decision">Decision</a><a href="#overview">Overview</a><a href="#location-map">Map</a><a href="#facts">Facts &amp; features</a><a href="#deal-analysis">Deal analysis</a><a href="#comps">Comparable sales</a><a href="#returns">Long-term returns</a><a className="tabs-top" href="#decision">↑ Top</a></nav>
      <section id="decision" className={`deal-decision deal-decision-${decision.verdict}`} aria-live="polite">
        <div className="deal-decision-top">
          <div className="deal-decision-verdict"><span className="deal-decision-thumb" aria-hidden="true">{decision.verdict === "up" ? "👍" : decision.verdict === "maybe" ? "🤔" : "👎"}</span><div><p className="eyebrow">BUY LAB DECISION BOT · LIVE MODEL</p><h1>{decision.title}</h1><p>{decision.headline}</p></div></div>
          <div className="deal-decision-irr"><span>10-year levered IRR</span><strong>{model.tenYearIrr.toFixed(1)}%</strong><small>Calculated from cash invested, annual cash flow, mortgage payoff, projected exit, and {EXIT_COST_PCT}% selling costs.</small></div>
        </div>
        <p className="deal-decision-story"><b>In English:</b> {decision.story}</p>
        <div className="deal-feedback">
          <div><b>Your rating</b><span>Would you pursue this deal? Your answer helps judge similar deals for you.</span></div>
          <div className="deal-feedback-buttons"><button type="button" className={ownRating === "good" ? "selected good" : ""} aria-pressed={ownRating === "good"} onClick={() => saveRating("good")}>👍 Good deal</button><button type="button" className={ownRating === "bad" ? "selected bad" : ""} aria-pressed={ownRating === "bad"} onClick={() => saveRating("bad")}>👎 Bad deal</button></div>
          <div className={`deal-personal-fit fit-${personalFit.kind}`}><b>Your fit: {feedbackReady ? personalFit.label : "Loading ratings"}</b><span>{feedbackReady ? personalFit.detail : "Checking saved ratings…"}</span></div>
          <small>{feedbackError ? "Your rating could not be saved in this browser." : "Ratings are saved on this browser only. They do not change the financial calculation."}</small>
        </div>
        <div className="deal-decision-checks"><div><span>Year-one cash flow</span><strong className={monthlyCashFlow >= 0 ? "positive" : "negative"}>{money.format(monthlyCashFlow)}/mo</strong><small>{monthlyCashFlow >= 0 ? "Income remains after expenses and debt." : "The model needs additional cash each month."}</small></div><div><span>Debt coverage</span><strong className={model.dscr >= 1.2 ? "positive" : model.dscr < 1 ? "negative" : ""}>{model.dscr.toFixed(2)}× DSCR</strong><small>{model.dscr >= 1.2 ? "Clears the 1.20× screening cushion." : "1.20× is the next lender-style screen."}</small></div><div><span>Break-even occupancy</span><strong className={model.breakEvenOccupancy <= 90 ? "positive" : "negative"}>{model.breakEvenOccupancy.toFixed(1)}%</strong><small>{model.breakEvenOccupancy <= 90 ? "Leaves room for normal vacancy." : "Needs a tighter occupancy cushion."}</small></div><div><span>Cash-on-cash</span><strong className={model.cashOnCash >= 0 ? "positive" : "negative"}>{model.cashOnCash.toFixed(1)}%</strong><small>Year-one cash flow ÷ cash to close.</small></div></div>
        <div className="deal-decision-footer"><p><b>Next move:</b> {decision.nextStep}</p><div className="deal-decision-evidence"><span><b>Source</b> {recordLabel}</span><span><b>Assumptions</b> price, rents, costs, loan &amp; exit</span><span><b>Calculated</b> cash flow, DSCR, IRR</span></div><a href="#deal-analysis">Adjust assumptions ↓</a></div>
      </section>
      <section id="deal-analysis" className="panel capital-overview">
        <div className="panel-head"><div><p className="eyebrow">START HERE · EDITABLE FINANCING</p><h2>Cash needed and amortization break-even</h2><p>Change the loan, furnishing, and reserve assumptions. The graph includes projected cash flow plus principal paid down through the amortization schedule.</p></div><span className="source-pill">Live model</span></div>
        <div className="capital-layout">
          <div className="capital-inputs"><h3>Acquisition inputs</h3><div className="input-grid"><Num label="Purchase price" value={price} onChange={setPrice}/><Num label="Down payment" value={downPayment} onChange={setDownPayment} suffix="%"/><Num label="Interest rate" value={interestRate} onChange={setInterestRate} suffix="%"/><Num label="Amortization" value={amortizationYears} onChange={setAmortizationYears} suffix="years"/><Num label="Buy closing costs" value={closingCostPct} onChange={setClosingCostPct} suffix="%"/><Num label="Loan points" value={loanPointsPct} onChange={setLoanPointsPct} suffix="%"/><Num label="Units to furnish" value={furnishedUnits} onChange={setFurnishedUnits}/><Num label="Furnishing per unit" value={furnishingPerUnit} onChange={setFurnishingPerUnit}/><Num label="Immediate repair reserve" value={repairReserve} onChange={setRepairReserve}/></div></div>
          <aside className="cash-scope"><p className="eyebrow">ESTIMATED CASH SCOPE</p><h3>{money.format(model.cashToClose)}</h3><dl><dt>Down payment</dt><dd>{money.format(model.downPaymentCash)}</dd><dt>Closing costs</dt><dd>{money.format(model.closingCosts)}</dd><dt>Loan points</dt><dd>{money.format(model.loanPoints)}</dd><dt>Furnishings</dt><dd>{money.format(model.furnishingCost)}</dd><dt>Repair reserve</dt><dd>{money.format(model.repairReserve)}</dd></dl><p>Excludes inspection, appraisal, lender escrows, and any rehab beyond the reserve.</p></aside>
        </div>
        <div className="capital-kpis"><div><span>Monthly P&amp;I</span><strong>{money.format(model.monthlyPI)}</strong></div><div><span>Loan amount</span><strong>{money.format(model.loan)}</strong></div><div><span>Capital break-even</span><strong>{model.capitalBreakEvenYear ? `Year ${model.capitalBreakEvenYear}` : "Beyond 30 years"}</strong></div><div><span>Year-10 loan balance</span><strong>{money.format(model.years[9].endingBalance)}</strong></div></div>
        <div className="capital-chart"><div className="chart-label">Capital recovery <small>cumulative cash flow + principal paydown − initial cash required</small></div><svg viewBox="0 0 900 240" role="img" aria-label="Capital recovery and amortization break-even by year"><line x1="35" y1={capitalY(0)} x2="880" y2={capitalY(0)} className="zero"/><polyline points={model.years.map((row, index) => `${35 + index * 29},${capitalY(row.capitalPosition)}`).join(" ")} className="capital-line" fill="none"/>{model.capitalBreakEvenYear && <circle cx={35 + (model.capitalBreakEvenYear - 1) * 29} cy={capitalY(model.years[model.capitalBreakEvenYear - 1].capitalPosition)} r="7" className="break-even-dot"/>}</svg><div className="chart-ticks"><span>Year 1</span><span>Year 10</span><span>Year 20</span><span>Year 30 · {compactMoney.format(model.years[29].capitalPosition)}</span></div></div>
        <details className="amortization-table"><summary>View annual amortization summary</summary><div><table><thead><tr><th>Year</th><th>Beginning</th><th>Payments</th><th>Principal</th><th>Interest</th><th>Ending</th></tr></thead><tbody>{model.years.slice(0, model.termYears).map((row) => <tr key={row.year}><td>{row.year}</td><td>{money.format(row.beginningBalance)}</td><td>{money.format(row.annualDebtService)}</td><td>{money.format(row.principalPaid)}</td><td>{money.format(row.annualInterest)}</td><td>{money.format(row.endingBalance)}</td></tr>)}</tbody></table></div></details>
        <details className="amortization-table"><summary>View full monthly amortization schedule ({model.monthlySchedule.length} payments)</summary><div><table><thead><tr><th>Month</th><th>Year</th><th>Beginning</th><th>Payment</th><th>Principal</th><th>Interest</th><th>Ending</th></tr></thead><tbody>{model.monthlySchedule.map((row) => <tr key={row.month}><td>{row.month}</td><td>{row.year}</td><td>{money.format(row.beginningBalance)}</td><td>{money.format(row.payment)}</td><td>{money.format(row.principalPaid)}</td><td>{money.format(row.interest)}</td><td>{money.format(row.endingBalance)}</td></tr>)}</tbody></table></div></details>
      </section>
      <section id="overview" className="listing-hero">
        <div className="listing-gallery">
          {canUseInteractiveStreetView
            ? <GoogleStreetView apiKey={streetViewApiKey} latitude={subject.latitude!} longitude={subject.longitude!} address={subject.address} streetViewUrl={streetViewUrl} fallbackImage={primaryImage} fallbackLabel={activeMlsPhoto && listingMedia.addressVerified ? `Address-verified MLS listing ${listingMedia.listingNumber || "photo"}` : "Aerial parcel view"}/>
            : <a className="listing-primary-image" href={streetViewUrl} target="_blank" rel="noreferrer">{primaryImage ? <img src={primaryImage} alt={activeMlsPhoto?.caption || `Property view of ${subject.address}`}/> : <div className="image-missing">Property imagery unavailable</div>}<span>{activeMlsPhoto && listingMedia.addressVerified ? `Address-verified MLS listing ${listingMedia.listingNumber || "photo"}` : "Aerial parcel view"}</span><strong className="street-view-badge">{subject.latitude !== null ? "Open Google Street View ↗" : "Find Street View on Google ↗"}</strong></a>}
          {listingMedia.photos.length > 1 && <div className="listing-photo-rail" aria-label="MLS listing photos"><a className="street-view-tile" href={streetViewUrl} target="_blank" rel="noreferrer"><span>360°</span><b>Street View</b></a>{listingMedia.photos.slice(0, 7).map((photo, index) => <button type="button" className={index === activePhoto ? "selected" : ""} onClick={() => setActivePhoto(index)} aria-label={`Show listing photo ${index + 1}`} key={photo.id}><img src={photo.thumbnailUrl || photo.imageUrl} alt=""/></button>)}</div>}
          {!activeMlsPhoto && <div className="listing-gallery-empty"><strong>Historical MLS photos</strong><span>No address-verified MLS photo is available. Similar-address listings are intentionally excluded.</span><a href={photoSource?.url ?? zillowSearch} target="_blank" rel="noreferrer">Search public photo history ↗</a></div>}
        </div>
        <article className="listing-summary-card"><p className="eyebrow">INVESTMENT PROPERTY</p><h1>{subject.address}</h1><p className="listing-location">{propertyLabel}</p><div className="listing-facts"><span>{units} units</span><span>{buildingArea ? `${buildingArea.toLocaleString()} sq ft building` : "Building area unknown"}</span><span>{garageSpaces !== null ? `${garageSpaces} garage spaces` : "Garage unknown"}</span><span>{subject.yearBuilt ? `Built ${subject.yearBuilt}` : "Year unknown"}</span><span>Neighborhood / access {subject.locationScore}/100 · {subject.locationGrade}</span></div><div className="listing-value"><div><span>{valueLabel}</span><strong>{money.format(subject.assessedValue)}</strong><small>Screening reference, not a market price</small></div><div><span>Planning range</span><b>{money.format(valueLow)}–{money.format(valueHigh)}</b><small>±8% planning sensitivity</small></div></div><div className="listing-cta"><a className="primary" href="#deal-analysis">Run deal analysis</a><a href={mapsUrl} target="_blank" rel="noreferrer">Map &amp; directions ↗</a></div></article>
      </section>
      {canUseInteractiveStreetView && <GoogleLocationMap apiKey={streetViewApiKey} latitude={subject.latitude!} longitude={subject.longitude!} address={subject.address} directionsUrl={mapsUrl}/>}
      <section id="facts" className="portal-detail-grid">
        <article className="portal-card"><div className="portal-card-heading"><div><p className="eyebrow">HOME DETAILS</p><h2>Facts and features</h2></div><span className="data-label">{recordLabel} + MLS</span></div><dl className="portal-fact-list">{propertyFacts.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><div className="detail-callouts"><div><span>Backyard potential</span><strong className={subject.yardPotential === "Strong" ? "positive" : ""}>{subject.yardPotential}</strong></div><div><span>Transit screen</span><strong className={subject.inTransitCorridor ? "negative" : "positive"}>{subject.inTransitCorridor ? "Near corridor" : "Outside corridor"}</strong></div><div><span>Neighborhood / access score</span><strong>{subject.locationScore}/100 · {subject.locationGrade}</strong><small>{subject.locationReasons.join(" · ")}</small><small className="score-caveat">Access screen only—not a school, crime, or appraisal rating.</small></div></div></article>
        <article className="portal-card ownership-card"><div className="portal-card-heading"><div><p className="eyebrow">OWNERSHIP &amp; VALUE</p><h2>What to verify next</h2></div></div><ol className="property-timeline"><li><span>Acquired</span><strong>{subject.deedDate || "Deed date unavailable"}</strong><small>{subject.yearsOwned ? `${subject.yearsOwned} years of recorded ownership` : "Confirm through JOC / recorder"}</small></li><li><span>Current assessment</span><strong>{money.format(subject.assessedValue)}</strong><small>Use as a triage reference, not a comp</small></li><li><span>Due diligence</span><strong>Verify leases, condition, and title</strong><small>Owner motivation is never inferred from a public record</small></li></ol></article>
      </section>
      <section className="model-summary">
        <div><span>{valueLabel}</span><strong>{money.format(subject.assessedValue)}</strong><small>Screening reference, not a sale comp</small></div><div><span>Model purchase price</span><strong>{money.format(price)}</strong><small>Editable above</small></div><div><span>Monthly cash flow</span><strong className={model.cashFlow >= 0 ? "positive" : "negative"}>{money.format(monthlyCashFlow)}</strong><small>Before income tax</small></div><div><span>Cash to close</span><strong>{money.format(model.cashToClose)}</strong><small>Acquisition + furnishings + reserve</small></div><div><span>10-year IRR</span><strong>{model.tenYearIrr.toFixed(1)}%</strong><small>Levered, before income tax</small></div>
      </section>

      <section className="owner-occupy panel"><div className="owner-copy"><p className="eyebrow">HOUSE-HACK / OWNER-OCCUPANT VIEW</p><h2>Live in one unit. Let {otherUnits} units offset the payment.</h2><p>The model applies the vacancy assumption to scheduled rent from the other {otherUnits} units. {units <= 4 ? "Qualification rules and eligible rents must be confirmed by a lender and appraiser." : "Properties with more than four units require commercial lending review; this is not an FHA qualification test."}</p><div className="owner-numbers"><div><span>Other {otherUnits} units</span><strong>{money.format(model.otherUnitRent)}<small>/mo</small></strong></div><div><span>Estimated PITI</span><strong>{money.format(model.piti)}<small>/mo</small></strong></div><div><span>Net housing cost</span><strong className={model.ownerHousingCost <= 2000 ? "positive" : "negative"}>{money.format(model.ownerHousingCost)}<small>/mo</small></strong></div><div><span>{units <= 4 ? "FHA-style self-sufficiency margin" : "Other-unit rent less PITI"}</span><strong className={model.fhaSelfSufficiencyMargin >= 0 ? "positive" : "negative"}>{money.format(model.fhaSelfSufficiencyMargin)}<small>/mo</small></strong></div></div></div><div className="break-even-graph"><h3>Occupancy break-even</h3><div className="occupancy-track"><div className="danger-zone" style={{ width: `${Math.min(100, model.breakEvenOccupancy)}%` }}/><i className="break-marker" style={{ left: `${Math.min(100, model.breakEvenOccupancy)}%` }}><b>Break even</b><span>{model.breakEvenOccupancy.toFixed(1)}%</span></i><i className="assumed-marker" style={{ left: `${100 - vacancy}%` }}><b>Assumed</b><span>{100 - vacancy}%</span></i></div><div className="occupancy-scale"><span>0% occupied</span><span>100% occupied</span></div><p>{model.breakEvenOccupancy > 95 ? "Very fragile: the deal needs near-perfect occupancy." : model.breakEvenOccupancy > 85 ? "Thin cushion: one vacancy can materially hurt cash flow." : "The model has a reasonable occupancy cushion."}</p></div></section>

      <section className="model-grid">
        <article className="panel model-controls"><div className="panel-head"><div><p className="eyebrow">YOUR OPERATING ASSUMPTIONS</p><h2>Income and expenses</h2></div><span className="source-pill">Editable</span></div>
          <div className="input-grid"><Num label="Total monthly rent" value={monthlyRent} onChange={setMonthlyRent}/><Num label="Annual property tax" value={taxes} onChange={setTaxes}/><Num label="Annual insurance" value={insurance} onChange={setInsurance}/><Num label="Annual utilities" value={utilities} onChange={setUtilities}/><Num label="Other annual expenses" value={otherExpenses} onChange={setOtherExpenses}/><Num label="Vacancy" value={vacancy} onChange={setVacancy} suffix="%"/><Num label="Maintenance" value={maintenance} onChange={setMaintenance} suffix="%"/><Num label="Capital expenditures" value={capex} onChange={setCapex} suffix="%"/><Num label="Management" value={management} onChange={setManagement} suffix="%"/><Num label="Annual appreciation" value={appreciation} onChange={setAppreciation} suffix="%"/><Num label="Annual rent growth" value={rentGrowth} onChange={setRentGrowth} suffix="%"/><Num label="Annual expense growth" value={expenseGrowth} onChange={setExpenseGrowth} suffix="%"/></div>
          <p className="assumption-note">Defaults are labeled planning assumptions. Replace them with lender quotes, actual leases, tax bills, insurance estimates, and inspection findings.</p>
        </article>
        <article className="panel financing"><div className="panel-head"><div><p className="eyebrow">FINANCING OPTIONS</p><h2>Ways to buy</h2></div></div>
          <div className="scenario-tabs">{scenarios.map((item, index) => <button key={item.name} className={active === index ? "active" : ""} onClick={() => selectScenario(index)}>{item.name}</button>)}</div>
          <div className="scenario-hero"><div><span>Estimated P&amp;I</span><strong>{money.format(model.monthlyPI)}<small>/mo</small></strong></div><div className="scenario-ring" style={{ background: `conic-gradient(${scenario.color} ${Math.min(100, downPayment)}%, #e9edf5 0)` }}><span>{downPayment}%<small>down</small></span></div></div>
          <dl className="model-dl"><dt>Loan amount</dt><dd>{money.format(model.loan)}</dd><dt>Interest rate</dt><dd>{interestRate}%</dd><dt>Amortization</dt><dd>{model.termYears} years</dd><dt>Estimated total cash</dt><dd>{money.format(model.cashToClose)}</dd><dt>DSCR</dt><dd className={model.dscr >= 1.2 ? "positive" : "negative"}>{model.dscr.toFixed(2)}×</dd></dl>
          <small className="fine">Low-down and seller-financing terms are illustrative—not a loan approval or quoted product. Mortgage insurance is not included.</small>
        </article>
      </section>

      <section id="returns" className="panel outlook"><div className="panel-head"><div><p className="eyebrow">30-YEAR FINANCIAL MODEL</p><h2>Equity and annual cash flow</h2></div><div className="legend"><span><i className="blue"/>Equity</span><span><i className="green"/>Cash flow</span></div></div>
        <div className="chart-pair"><div className="chart"><div className="chart-label">Projected equity</div><svg viewBox="0 0 900 240" role="img" aria-label="Projected equity by year"><line x1="35" y1="210" x2="880" y2="210" className="axis"/><polyline points={model.years.map((row, index) => `${35 + index * 29},${210 - row.equity / maxEquity * 180}`).join(" ")} className="equity-line" fill="none"/><path d={`M35 210 L${model.years.map((row, index) => `${35 + index * 29} ${210 - row.equity / maxEquity * 180}`).join(" L")} L876 210 Z`} className="equity-fill"/></svg><div className="chart-ticks"><span>Year 1</span><span>Year 10</span><span>Year 20</span><span>Year 30 · {compactMoney.format(model.years[29].equity)}</span></div></div>
          <div className="chart"><div className="chart-label">Annual cash flow <small>zero line shown</small></div><svg viewBox="0 0 900 240" role="img" aria-label="Annual cash flow by year"><line x1="35" y1="120" x2="880" y2="120" className="zero"/>{model.years.map((row, index) => { const height = Math.abs(row.cashFlow) / maxCashFlow * 95; const y = row.cashFlow >= 0 ? 120 - height : 120; return <rect key={row.year} x={35 + index * 28} y={y} width="16" height={height} className={row.cashFlow >= 0 ? "bar-positive" : "bar-negative"}/>; })}</svg><div className="chart-ticks"><span>Year 1</span><span>Year 10</span><span>Year 20</span><span>Year 30 · {compactMoney.format(model.years[29].cashFlow)}</span></div></div></div>
        <div className="return-kpis"><div><span>Year-one NOI</span><strong>{money.format(model.noi)}</strong></div><div><span>Cap rate</span><strong>{model.capRate.toFixed(2)}%</strong></div><div><span>Year-one DSCR</span><strong>{model.dscr.toFixed(2)}×</strong></div><div><span>10-year levered IRR</span><strong>{model.tenYearIrr.toFixed(1)}%</strong></div><div><span>Debt yield</span><strong>{model.debtYield.toFixed(2)}%</strong></div><div><span>Break-even occupancy</span><strong>{model.breakEvenOccupancy.toFixed(1)}%</strong></div><div><span>Year-10 equity</span><strong>{money.format(model.years[9].equity)}</strong></div></div>
      </section>

      <section className="panel market-pulse"><div className="panel-head"><div><p className="eyebrow">ZILLOW MARKET PULSE · CHECKED {ZILLOW_MARKET_PULSE.checkedAt}</p><h2>Current competition and disclosed rents</h2><p>These are active/public listing anchors, not verified closed sales. Open each source before using it.</p></div></div><div className="pulse-grid"><div><h3>Fourplex asking-price anchors</h3>{ZILLOW_MARKET_PULSE.saleListings.map((listing) => <a href={listing.url} target="_blank" rel="noreferrer" key={listing.address}><span>{listing.address}<small>{listing.sqft.toLocaleString()} sf · {listing.units} units{listing.rent ? ` · ${money.format(listing.rent)}/mo disclosed rent` : ""}</small></span><b>{money.format(listing.price)}<small>{money.format(listing.price / listing.units)}/unit</small></b></a>)}</div><div><h3>Unit rent anchors</h3>{ZILLOW_MARKET_PULSE.rentListings.map((listing) => <a href={listing.url} target="_blank" rel="noreferrer" key={listing.address}><span>{listing.address}<small>{listing.beds} bedroom unit</small></span><b>{money.format(listing.rent)}<small>/month</small></b></a>)}</div></div><p className="market-warning">Zillow listing prices, rent advertisements, and Zestimate values are not closed-sale comps or appraisals. Verified MLS/recorder sales should still be entered below.</p></section>

      <section id="comps" className="panel comps-panel"><div className="panel-head"><div><p className="eyebrow">VALUE VALIDATION</p><h2>Verified comparable-sales workspace</h2><p>Enter closed sales from MLS, a broker, or recorded documents. The model uses their median—not municipal assessments or Zillow asking prices—as the comp indication.</p></div><button className="primary" onClick={addComp}>+ Add sold comp</button></div>
        {comps.length > 0 && <div className="comp-table"><div className="comp-row comp-head"><span>Address</span><span>Sale price</span><span>Sale date</span><span>Sq. ft.</span><span>Units</span><span>$/unit</span><span/></div>{comps.map((comp) => <div className="comp-row" key={comp.id}><input placeholder="Comp address" value={comp.address} onChange={(e) => updateComp(comp.id, "address", e.target.value)}/><input type="number" placeholder="$" value={comp.soldPrice || ""} onChange={(e) => updateComp(comp.id, "soldPrice", Number(e.target.value))}/><input type="date" value={comp.saleDate} onChange={(e) => updateComp(comp.id, "saleDate", e.target.value)}/><input type="number" value={comp.sqft || ""} onChange={(e) => updateComp(comp.id, "sqft", Number(e.target.value))}/><input type="number" value={comp.units} onChange={(e) => updateComp(comp.id, "units", Number(e.target.value))}/><b>{comp.soldPrice && comp.units ? money.format(comp.soldPrice / comp.units) : "—"}</b><button aria-label="Remove comp" onClick={() => setComps(comps.filter((item) => item.id !== comp.id))}>×</button></div>)}</div>}
        <div className="comp-result"><div><span>Verified comp indication</span><strong>{model.compMedian ? money.format(model.compMedian) : "Add sold comps"}</strong><small>Median of entered closed-sale prices</small></div><div><span>Offer vs. comp median</span><strong>{model.compMedian ? `${((price / model.compMedian - 1) * 100).toFixed(1)}%` : "—"}</strong><small>Negative means below the median</small></div></div>
        <div className="assessment-references"><div><h3>Nearby-value assessment references</h3><p>Useful for triage only. These are not sold comps and do not establish market value.</p></div>{references.map((reference) => <a key={reference.parcelId} href={`/analyze?parcel=${reference.parcelId}`}><span>{reference.address}</span><b>{money.format(reference.value)}</b><small>Built {reference.yearBuilt ?? "—"} · assessment</small></a>)}</div>
      </section>

      <section className="model-grid flip-grid"><article className="panel"><div className="panel-head"><div><p className="eyebrow">REQUIRED FLIP TIERS</p><h2>Construction sensitivity</h2></div></div><div className="flip-tiers">{[{ name: "Worst case", rehab: 200000 }, { name: "Mid case", rehab: 125000 }, { name: "Best case", rehab: 50000 }].map((tier) => { const arv = model.compMedian ?? subject.assessedValue; const profit = arv * .92 - price * 1.02 - tier.rehab; return <div key={tier.name}><span>{tier.name}</span><strong>{money.format(tier.rehab)} rehab</strong><em className={profit >= 0 ? "positive" : "negative"}>{money.format(profit)} estimated profit</em></div>; })}</div><p className="assumption-note">Uses the verified comp median when available; otherwise the municipal assessment is shown as a provisional valuation reference. Includes 2% buy and 8% selling costs, excluding holding and financing costs.</p></article>
        <article className="panel decision"><p className="eyebrow">DECISION CHECK</p><h2>{model.dscr >= 1.2 && model.cashFlow > 0 ? "The rental case clears its first screen." : "The current assumptions need work."}</h2><p>{model.dscr >= 1.2 ? `DSCR is ${model.dscr.toFixed(2)}×, above a common 1.20× screening threshold.` : `DSCR is ${model.dscr.toFixed(2)}×. Increase verified rent, lower the price, or improve the financing structure.`} Validate comps and all operating costs before making an offer.</p><a className="primary link-button" href={subject.evidenceUrl} target="_blank" rel="noreferrer">Review source record</a></article>
      </section>
    </main>
    <a className="scroll-top" href="#overview" aria-label="Return to property overview"><span>↑</span><b>Top</b></a>
  </div>;
}
