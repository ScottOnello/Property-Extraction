import type { Property } from "./data";

export const DEFAULTS = {
  monthlyRent: 7200,
  downPaymentPct: 20,
  interestRatePct: 6.75,
  amortizationYears: 30,
  vacancyPct: 5,
  managementPct: 8,
  maintenancePct: 5,
  capexPct: 5,
  taxesPct: 1.2,
  insuranceAnnual: 4800,
  utilitiesAnnual: 7200,
  closingCostPct: 2,
  sellingCostPct: 8,
  appreciationPct: 3,
  rentGrowthPct: 3,
  expenseGrowthPct: 2.5,
};

const clamp = (value: number, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, value));

export function mortgagePayment(principal: number, annualRatePct: number, years: number) {
  const rate = annualRatePct / 1200;
  const months = years * 12;
  return rate ? principal * rate * Math.pow(1 + rate, months) / (Math.pow(1 + rate, months) - 1) : principal / months;
}

export function mortgageBalance(principal: number, annualRatePct: number, years: number, paidMonths: number) {
  const rate = annualRatePct / 1200;
  const payment = mortgagePayment(principal, annualRatePct, years);
  return rate ? principal * Math.pow(1 + rate, paidMonths) - payment * (Math.pow(1 + rate, paidMonths) - 1) / rate : Math.max(0, principal - payment * paidMonths);
}

export function irr(cashFlows: number[]) {
  const flows = cashFlows.map((value) => Number.isFinite(value) ? value : 0);
  if (!flows.some((value) => value < 0) || !flows.some((value) => value > 0)) return 0;

  const npv = (rate: number) => flows.reduce((sum, cashFlow, index) => sum + cashFlow / Math.pow(1 + rate, index), 0);
  let low = -0.9999;
  let high = 1;
  let lowNpv = npv(low);
  let highNpv = npv(high);

  // Expand the upper bound until the cash-flow series brackets a result. A
  // fixed upper bound can return an implausibly high IRR when no root exists.
  while (lowNpv * highNpv > 0 && high < 1024) {
    high *= 2;
    highNpv = npv(high);
  }
  if (lowNpv * highNpv > 0) return 0;

  for (let iteration = 0; iteration < 160; iteration++) {
    const rate = (low + high) / 2;
    const value = npv(rate);
    if (value === 0) return rate * 100;
    if (lowNpv * value > 0) {
      low = rate;
      lowNpv = value;
    } else {
      high = rate;
      highNpv = value;
    }
  }
  return (low + high) / 2 * 100;
}

export type DealAnalysis = {
  property: Property; rank: number; dealScore: number; financialScore: number;
  price: number; monthlyRent: number; noi: number; capRate: number; dscr: number;
  cashFlow: number; cashOnCash: number; debtYield: number; breakEvenOccupancy: number;
  tenYearIrr: number; equityMultiple: number; cashToClose: number; risk: string; thesis: string;
  preferenceScore: number;
};

export function analyzeProperty(property: Property): DealAnalysis {
  const price = property.assessedValue;
  const monthlyRent = DEFAULTS.monthlyRent;
  const gross = monthlyRent * 12;
  const loan = price * (1 - DEFAULTS.downPaymentPct / 100);
  const payment = mortgagePayment(loan, DEFAULTS.interestRatePct, DEFAULTS.amortizationYears);
  const variableExpenses = gross * (DEFAULTS.vacancyPct + DEFAULTS.managementPct + DEFAULTS.maintenancePct + DEFAULTS.capexPct) / 100;
  const fixedExpenses = price * DEFAULTS.taxesPct / 100 + DEFAULTS.insuranceAnnual + DEFAULTS.utilitiesAnnual;
  const noi = gross - variableExpenses - fixedExpenses;
  const annualDebtService = payment * 12;
  const cashFlow = noi - annualDebtService;
  const cashToClose = price * (DEFAULTS.downPaymentPct + DEFAULTS.closingCostPct) / 100;
  const capRate = price ? noi / price * 100 : 0;
  const dscr = annualDebtService ? noi / annualDebtService : 0;
  const cashOnCash = cashToClose ? cashFlow / cashToClose * 100 : 0;
  const debtYield = loan ? noi / loan * 100 : 0;
  const breakEvenOccupancy = gross ? (variableExpenses - gross * DEFAULTS.vacancyPct / 100 + fixedExpenses + annualDebtService) / gross * 100 : 100;
  const cashFlows = [-cashToClose];
  let totalDistributions = 0;
  for (let year = 1; year <= 10; year++) {
    const yearGross = gross * Math.pow(1 + DEFAULTS.rentGrowthPct / 100, year - 1);
    const yearVariable = variableExpenses * Math.pow(1 + DEFAULTS.rentGrowthPct / 100, year - 1);
    const yearFixed = fixedExpenses * Math.pow(1 + DEFAULTS.expenseGrowthPct / 100, year - 1);
    let distribution = yearGross - yearVariable - yearFixed - annualDebtService;
    if (year === 10) {
      const resale = price * Math.pow(1 + DEFAULTS.appreciationPct / 100, 10) * (1 - DEFAULTS.sellingCostPct / 100);
      distribution += resale - mortgageBalance(loan, DEFAULTS.interestRatePct, DEFAULTS.amortizationYears, 120);
    }
    totalDistributions += distribution;
    cashFlows.push(distribution);
  }
  const tenYearIrr = irr(cashFlows);
  const equityMultiple = cashToClose ? totalDistributions / cashToClose : 0;
  const capScore = clamp((capRate - 3.5) / 4.5 * 100);
  const dscrScore = clamp((dscr - 0.85) / 0.75 * 100);
  const cocScore = clamp((cashOnCash + 5) / 20 * 100);
  const irrScore = clamp((tenYearIrr - 4) / 16 * 100);
  const financialScore = Math.round(capScore * .25 + dscrScore * .25 + cocScore * .2 + irrScore * .3);
  const ageScore = property.yearBuilt ? clamp((property.yearBuilt - 1950) / 75 * 100) : 45;
  const yardScore = property.yardPotential === "Strong" ? 100 : property.yardPotential === "Possible" ? 60 : property.yardPotential === "Limited" ? 20 : 0;
  const preferenceScore = Math.round(yardScore * .35 + (property.inTransitCorridor ? 0 : 100) * .65);
  const corridorPenalty = property.inTransitCorridor ? 30 : 0;
  const dealScore = Math.max(0, Math.round(financialScore * .5 + property.locationScore * .18 + property.score * .12 + ageScore * .05 + preferenceScore * .15 - corridorPenalty));
  const risk = property.inTransitCorridor ? "Transit corridor" : dscr < 1 ? "Negative leverage" : property.yearBuilt && property.yearBuilt < 1980 ? "Older asset" : capRate < 5 ? "Thin yield" : "Moderate";
  const thesis = financialScore >= 70 ? "Best modeled return profile" : property.locationScore >= 70 ? "Location-led opportunity" : property.score >= 70 ? "Strong sourcing signal" : "Requires price or income improvement";
  return { property, rank: 0, dealScore, financialScore, preferenceScore, price, monthlyRent, noi, capRate, dscr, cashFlow, cashOnCash, debtYield, breakEvenOccupancy, tenYearIrr, equityMultiple, cashToClose, risk, thesis };
}

export function rankProperties(properties: Property[]) {
  return properties.map(analyzeProperty).sort((a, b) => b.dealScore - a.dealScore || b.tenYearIrr - a.tenYearIrr).map((deal, index) => ({ ...deal, rank: index + 1 }));
}
