"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import type { Property } from "@/lib/data";
import { irr } from "@/lib/finance";
import { ZILLOW_MARKET_PULSE } from "@/lib/market";

type Comp = { id: number; address: string; soldPrice: number; saleDate: string; sqft: number; units: number };
type Reference = { address: string; value: number; yearBuilt: number | null; parcelId: string };
type Scenario = { name: string; down: number; rate: number; years: number; color: string };

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compactMoney = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
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
  return rate ? principal * Math.pow(1 + rate, paidMonths) - monthly * (Math.pow(1 + rate, paidMonths) - 1) / rate : principal - monthly * paidMonths;
}

function Num({ label, value, onChange, suffix }: { label: string; value: number; onChange: (value: number) => void; suffix?: string }) {
  return <label className="model-field"><span>{label}</span><div><input type="number" value={value} onChange={(event) => onChange(Number(event.target.value))}/>{suffix && <i>{suffix}</i>}</div></label>;
}

export default function AnalysisClient({ subject, references }: { subject: Property; references: Reference[] }) {
  const [price, setPrice] = useState(Math.round(subject.assessedValue));
  const [monthlyRent, setMonthlyRent] = useState(7200);
  const [taxes, setTaxes] = useState(Math.round(subject.assessedValue * 0.012));
  const [insurance, setInsurance] = useState(4800);
  const [utilities, setUtilities] = useState(7200);
  const [vacancy, setVacancy] = useState(5);
  const [maintenance, setMaintenance] = useState(5);
  const [management, setManagement] = useState(8);
  const [appreciation, setAppreciation] = useState(3);
  const [rentGrowth, setRentGrowth] = useState(3);
  const [active, setActive] = useState(0);
  const [comps, setComps] = useState<Comp[]>([]);
  const [nextCompId, setNextCompId] = useState(1);
  const scenario = scenarios[active];

  const model = useMemo(() => {
    const loan = price * (1 - scenario.down / 100);
    const monthlyPI = payment(loan, scenario.rate, scenario.years);
    const gross = monthlyRent * 12;
    const operating = taxes + insurance + utilities + gross * (vacancy + maintenance + management) / 100;
    const noi = gross - operating;
    const cashFlow = noi - monthlyPI * 12;
    const cashToClose = price * scenario.down / 100 + price * 0.02;
    const compValues = comps.filter((comp) => comp.soldPrice > 0).map((comp) => comp.soldPrice);
    const compMedian = compValues.length ? [...compValues].sort((a, b) => a - b)[Math.floor(compValues.length / 2)] : null;
    const years = Array.from({ length: 30 }, (_, index) => {
      const year = index + 1;
      const value = price * Math.pow(1 + appreciation / 100, year);
      const rent = gross * Math.pow(1 + rentGrowth / 100, index);
      const variable = gross * (vacancy + maintenance + management) / 100 * Math.pow(1 + rentGrowth / 100, index);
      const fixed = (taxes + insurance + utilities) * Math.pow(1.025, index);
      const annualCashFlow = rent - variable - fixed - monthlyPI * 12;
      const endingBalance = balance(loan, scenario.rate, scenario.years, year * 12);
      return { year, value, equity: value - Math.max(0, endingBalance), cashFlow: annualCashFlow };
    });
    const tenYearFlows = [-cashToClose, ...years.slice(0, 10).map((row, index) => index === 9 ? row.cashFlow + row.value * .92 - balance(loan, scenario.rate, scenario.years, 120) : row.cashFlow)];
    const tenYearIrr = irr(tenYearFlows);
    const debtYield = loan ? noi / loan * 100 : 0;
    const breakEvenOccupancy = gross ? (operating - gross * vacancy / 100 + monthlyPI * 12) / gross * 100 : 0;
    const firstPositiveYear = years.find((row) => row.cashFlow >= 0)?.year ?? null;
    const piti = monthlyPI + taxes / 12 + insurance / 12;
    const otherUnitRent = monthlyRent * .75;
    const ownerHousingCost = piti + utilities / 12 - otherUnitRent * (1 - vacancy / 100);
    const fhaSelfSufficiencyMargin = monthlyRent * .75 - piti;
    return { loan, monthlyPI, gross, operating, noi, cashFlow, cashToClose, compMedian, years, tenYearIrr, debtYield, breakEvenOccupancy, firstPositiveYear, piti, otherUnitRent, ownerHousingCost, fhaSelfSufficiencyMargin, capRate: price ? noi / price * 100 : 0, dscr: monthlyPI ? noi / (monthlyPI * 12) : 0 };
  }, [price, scenario, monthlyRent, taxes, insurance, utilities, vacancy, maintenance, management, appreciation, rentGrowth, comps]);

  const maxEquity = Math.max(...model.years.map((row) => row.equity), 1);
  const maxCashFlow = Math.max(...model.years.map((row) => Math.abs(row.cashFlow)), 1);
  const addComp = () => { setComps([...comps, { id: nextCompId, address: "", soldPrice: 0, saleDate: "", sqft: 0, units: 4 }]); setNextCompId(nextCompId + 1); };
  const updateComp = (id: number, field: keyof Comp, value: string | number) => setComps(comps.map((comp) => comp.id === id ? { ...comp, [field]: value } : comp));

  return <div className="app-shell model-app">
    <aside className="sidebar"><div><div className="logo"><span>PE</span><div>Property<br/>Extraction</div></div><nav><a href="/">← Prospects</a><a className="active" href={`/analyze?parcel=${subject.parcelId}`}>Buy Lab</a><a href="#comps">Comparable sales</a><a href="#returns">30-year outlook</a></nav></div><form action="/api/logout" method="post"><button className="logout">Sign out</button></form></aside>
    <main className="workspace model-workspace">
      <header><div><p className="eyebrow">INTERACTIVE ACQUISITION MODEL · PARCEL {subject.parcelId}</p><h1>{subject.address}</h1><p className="muted">Compare ways to buy, validate value with comps, and see the long-term financial tradeoffs.</p></div><a className="evidence top-evidence" target="_blank" rel="noreferrer" href={subject.evidenceUrl}>Municipal record ↗</a></header>
      <section className="subject-visual"><div className="subject-aerial">{subject.aerialUrl ? <img src={subject.aerialUrl} alt={`Aerial view of ${subject.address}`}/> : <div className="image-missing">Aerial imagery unavailable</div>}<span>Esri World Imagery · parcel vicinity</span></div><div className="location-card"><p className="eyebrow">HARSH LOCATION GRADE</p><strong className={`grade grade-${subject.locationGrade.toLowerCase()}`}>{subject.locationGrade}</strong><h2>{subject.locationScore}/100</h2><p>{subject.locationTier}</p><div className="location-badges">{subject.locationReasons.map((reason) => <span key={reason}>{reason}</span>)}</div><small>Strict access score only. It does not use demographics or make claims about neighborhood residents.</small></div></section>
      <section className="model-summary">
        <div><span>Municipal assessment</span><strong>{money.format(subject.assessedValue)}</strong><small>Screening reference, not a sale comp</small></div><div><span>Model purchase price</span><strong>{money.format(price)}</strong><small>Editable below</small></div><div><span>Monthly cash flow</span><strong className={model.cashFlow >= 0 ? "positive" : "negative"}>{money.format(model.cashFlow / 12)}</strong><small>Before income tax</small></div><div><span>Cash to close</span><strong>{money.format(model.cashToClose)}</strong><small>Down payment + 2% closing</small></div>
      </section>
      <section className={`decision-banner ${model.dscr >= 1.2 && model.tenYearIrr >= 12 ? "decision-go" : model.dscr < 1 || model.tenYearIrr < 7 ? "decision-stop" : "decision-review"}`}><div><p className="eyebrow">PLAIN-ENGLISH READ</p><h2>{model.dscr >= 1.2 && model.tenYearIrr >= 12 ? "Worth deeper due diligence" : model.dscr < 1 || model.tenYearIrr < 7 ? "Do not pursue at these assumptions" : "Negotiate or improve the income"}</h2></div><div className="decision-reasons"><span>{model.cashFlow >= 0 ? "✓" : "×"} {model.cashFlow >= 0 ? "Positive monthly cash flow" : "Negative monthly cash flow"}</span><span>{model.dscr >= 1.2 ? "✓" : "×"} DSCR {model.dscr.toFixed(2)}×</span><span>{model.tenYearIrr >= 12 ? "✓" : "×"} 10-year IRR {model.tenYearIrr.toFixed(1)}%</span><span>{model.breakEvenOccupancy <= 90 ? "✓" : "×"} Break-even occupancy {model.breakEvenOccupancy.toFixed(1)}%</span></div></section>

      <section className="owner-occupy panel"><div className="owner-copy"><p className="eyebrow">HOUSE-HACK / OWNER-OCCUPANT VIEW</p><h2>Live in one unit. Let three units offset the payment.</h2><p>The model treats 75% of scheduled building rent as the other three units and applies the vacancy assumption. Qualification rules and eligible rents must be confirmed by a lender and appraiser.</p><div className="owner-numbers"><div><span>Other 3 units</span><strong>{money.format(model.otherUnitRent)}<small>/mo</small></strong></div><div><span>Estimated PITI</span><strong>{money.format(model.piti)}<small>/mo</small></strong></div><div><span>Net housing cost</span><strong className={model.ownerHousingCost <= 2000 ? "positive" : "negative"}>{money.format(model.ownerHousingCost)}<small>/mo</small></strong></div><div><span>FHA-style self-sufficiency margin</span><strong className={model.fhaSelfSufficiencyMargin >= 0 ? "positive" : "negative"}>{money.format(model.fhaSelfSufficiencyMargin)}<small>/mo</small></strong></div></div></div><div className="break-even-graph"><h3>Occupancy break-even</h3><div className="occupancy-track"><div className="danger-zone" style={{ width: `${Math.min(100, model.breakEvenOccupancy)}%` }}/><i className="break-marker" style={{ left: `${Math.min(100, model.breakEvenOccupancy)}%` }}><b>Break even</b><span>{model.breakEvenOccupancy.toFixed(1)}%</span></i><i className="assumed-marker" style={{ left: `${100 - vacancy}%` }}><b>Assumed</b><span>{100 - vacancy}%</span></i></div><div className="occupancy-scale"><span>0% occupied</span><span>100% occupied</span></div><p>{model.breakEvenOccupancy > 95 ? "Very fragile: the deal needs near-perfect occupancy." : model.breakEvenOccupancy > 85 ? "Thin cushion: one vacancy can materially hurt cash flow." : "The model has a reasonable occupancy cushion."}</p></div></section>

      <section className="model-grid">
        <article className="panel model-controls"><div className="panel-head"><div><p className="eyebrow">YOUR ASSUMPTIONS</p><h2>Deal inputs</h2></div><span className="source-pill">Editable</span></div>
          <div className="input-grid"><Num label="Purchase price" value={price} onChange={setPrice}/><Num label="Total monthly rent" value={monthlyRent} onChange={setMonthlyRent}/><Num label="Annual property tax" value={taxes} onChange={setTaxes}/><Num label="Annual insurance" value={insurance} onChange={setInsurance}/><Num label="Annual utilities" value={utilities} onChange={setUtilities}/><Num label="Vacancy" value={vacancy} onChange={setVacancy} suffix="%"/><Num label="Maintenance" value={maintenance} onChange={setMaintenance} suffix="%"/><Num label="Management" value={management} onChange={setManagement} suffix="%"/><Num label="Annual appreciation" value={appreciation} onChange={setAppreciation} suffix="%"/><Num label="Annual rent growth" value={rentGrowth} onChange={setRentGrowth} suffix="%"/></div>
          <p className="assumption-note">Defaults are labeled planning assumptions. Replace them with lender quotes, actual leases, tax bills, insurance estimates, and inspection findings.</p>
        </article>
        <article className="panel financing"><div className="panel-head"><div><p className="eyebrow">FINANCING OPTIONS</p><h2>Ways to buy</h2></div></div>
          <div className="scenario-tabs">{scenarios.map((item, index) => <button key={item.name} className={active === index ? "active" : ""} onClick={() => setActive(index)}>{item.name}</button>)}</div>
          <div className="scenario-hero"><div><span>Estimated P&amp;I</span><strong>{money.format(model.monthlyPI)}<small>/mo</small></strong></div><div className="scenario-ring" style={{ background: `conic-gradient(${scenario.color} ${scenario.down}%, #e9edf5 0)` }}><span>{scenario.down}%<small>down</small></span></div></div>
          <dl className="model-dl"><dt>Loan amount</dt><dd>{money.format(model.loan)}</dd><dt>Interest rate</dt><dd>{scenario.rate}%</dd><dt>Term</dt><dd>{scenario.years} years</dd><dt>Estimated cash to close</dt><dd>{money.format(model.cashToClose)}</dd><dt>DSCR</dt><dd className={model.dscr >= 1.2 ? "positive" : "negative"}>{model.dscr.toFixed(2)}×</dd></dl>
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
  </div>;
}
