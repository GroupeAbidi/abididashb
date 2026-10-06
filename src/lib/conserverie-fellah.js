import * as XLSX from "xlsx";

const clean = (value) =>
  String(value ?? "")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const numeric = (value) => {
  const text = clean(value).replace(/,/g, "").replace(/−/g, "-");
  if (!text || text === "-" || text === "—") return 0;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

export async function parseConserverieFellah(file) {
  const workbook = XLSX.read(await file.arrayBuffer(), {
    type: "array",
    cellFormula: true,
    raw: false,
  });
  const sourceName = workbook.SheetNames.find(
    (name) => clean(name).toUpperCase() === "RECAP",
  );
  if (!sourceName)
    throw new Error(
      "La feuille officielle « RECAP » est introuvable dans ce fichier.",
    );
  const sheet = workbook.Sheets[sourceName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  const walidName = workbook.SheetNames.find((name) =>
    /RECAP\s+POUR\s+WALID/i.test(clean(name)),
  );
  const walidMatrix = walidName
    ? XLSX.utils.sheet_to_json(workbook.Sheets[walidName], {
        header: 1,
        defval: "",
        raw: false,
      })
    : [];
  const headerRow = matrix.findIndex((row) =>
    /N°\s*D['’]?ORDRE/i.test(clean(row[0])),
  );
  if (headerRow < 0)
    throw new Error(
      "Les colonnes du récapitulatif FELLAH ne sont pas reconnues.",
    );
  const farmers = [];
  for (let index = headerRow + 1; index < matrix.length; index += 1) {
    const row = matrix[index];
    const order = clean(row[0]);
    if (!/^\d{1,3}$/.test(order)) continue;
    const actualGap = numeric(row[8]) - numeric(row[10]);
    const varianceFormula = sheet[`L${index + 1}`]?.f || "";
    farmers.push({
      order,
      name: clean(row[1]),
      contract: clean(row[2]),
      wilaya: clean(row[3]) || "Sans wilaya",
      commune: clean(row[4]) || "Sans commune",
      area: numeric(row[5]),
      yield: numeric(row[6]),
      newYield: numeric(row[7]),
      expected: numeric(row[8]),
      declared: numeric(row[10]),
      sourceGap: numeric(row[11]),
      actualGap,
      tomatoValue: numeric(row[12]),
      advance: numeric(row[13]),
      balance: numeric(row[14]),
      formulaUsesNewYield: /J\d+\s*-\s*K\d+/i.test(varianceFormula),
      missingExpected:
        numeric(row[5]) > 0 && numeric(row[8]) === 0 && numeric(row[10]) > 0,
    });
  }
  if (!farmers.length)
    throw new Error("Aucun fellah actif reconnu dans la feuille RECAP.");
  const sum = (rows, field) =>
    rows.reduce((total, row) => total + (Number(row[field]) || 0), 0);
  const positive = farmers.filter((row) => row.balance > 0);
  const negative = farmers.filter((row) => row.balance < 0);
  const settled = farmers.filter((row) => row.balance === 0);
  const recapTotals = matrix.filter(
    (row) => clean(row[0]).toUpperCase() === "TOTAL",
  );
  const walidTotals = walidMatrix.filter(
    (row) => clean(row[0]).toUpperCase() === "TOTAL",
  );
  const officialFinal = recapTotals.at(-1);
  const walidFinal = walidTotals.at(-1);
  return {
    farmers,
    totals: {
      farmers: farmers.length,
      area: sum(farmers, "area"),
      expected: sum(farmers, "expected"),
      declared: sum(farmers, "declared"),
      actualGap: sum(farmers, "actualGap"),
      tomatoValue: sum(farmers, "tomatoValue"),
      advance: sum(farmers, "advance"),
      balance: sum(farmers, "balance"),
      positiveBalance: sum(positive, "balance"),
      negativeBalance: Math.abs(sum(negative, "balance")),
      positiveFarmers: positive.length,
      negativeFarmers: negative.length,
      settledFarmers: settled.length,
      controls: farmers.filter(
        (row) => row.formulaUsesNewYield || row.missingExpected,
      ).length,
    },
    meta: {
      fileName: file.name,
      sheetName: sourceName,
      period: "2025",
      importedAt: new Date().toISOString(),
      externalAdvanceLinks: farmers.some((_, index) =>
        /!/.test(sheet[`N${headerRow + 2 + index}`]?.f || ""),
      ),
    },
    control: {
      recapFinalAdvance: numeric(officialFinal?.[13]),
      recapFinalBalance: numeric(officialFinal?.[14]),
      walidFinalAdvance: numeric(walidFinal?.[13]),
      walidAdvanceDifference:
        numeric(walidFinal?.[13]) - numeric(officialFinal?.[13]),
      walidAvailable: Boolean(walidName),
    },
  };
}
