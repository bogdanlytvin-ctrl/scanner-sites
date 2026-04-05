import { NextRequest, NextResponse } from "next/server";
import { LeadBusiness } from "@/lib/scoring";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { leads, format = "excel" } = body as {
      leads: LeadBusiness[];
      format: "excel" | "csv";
    };

    if (!leads || !Array.isArray(leads) || leads.length === 0) {
      return NextResponse.json(
        { error: "No leads data provided" },
        { status: 400 }
      );
    }

    if (format === "csv") {
      return generateCSV(leads);
    }

    return generateExcel(leads);
  } catch (error) {
    console.error("Export API error:", error);
    return NextResponse.json(
      { error: "Export failed" },
      { status: 500 }
    );
  }
}

async function generateExcel(leads: LeadBusiness[]) {
  // Dynamic import for exceljs (only on server)
  const ExcelJS = await import("exceljs");

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Leads");

  const headers = [
    "#",
    "Name",
    "Phone",
    "Email",
    "Website",
    "Facebook",
    "Instagram",
    "Telegram",
    "Address",
    "Opening Hours",
    "Site Year",
    "Mobile Friendly",
    "Score",
  ];

  // Header row
  const headerRow = worksheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: "FFFFFF" }, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "333333" },
  };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: "thin" },
      left: { style: "thin" },
      bottom: { style: "thin" },
      right: { style: "thin" },
    };
  });

  // Data rows
  leads.forEach((lead, idx) => {
    const score = lead.score;
    let fill: ExcelJS.FillPattern;

    if (score === "HOT") {
      fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF0000" },
      };
    } else if (score === "WARM") {
      fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFF00" },
      };
    } else {
      fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "00B050" },
      };
    }

    const row = worksheet.addRow([
      idx + 1,
      lead.name,
      lead.phone,
      lead.email || "",
      lead.website,
      lead.facebook || "",
      lead.instagram || "",
      lead.telegram || "",
      lead.address,
      lead.openingHours || "",
      lead.copyrightYear ?? "N/A",
      lead.isMobileFriendly ? "Yes" : "No",
      lead.score,
    ]);

    const fontColor =
      score === "HOT" || score === "COLD"
        ? { argb: "FFFFFF" }
        : { argb: "000000" };

    row.eachCell((cell) => {
      cell.fill = fill;
      cell.font = { bold: true, color: fontColor, size: 11 };
      cell.border = {
        top: { style: "thin" },
        left: { style: "thin" },
        bottom: { style: "thin" },
        right: { style: "thin" },
      };
    });
  });

  // Column widths
  worksheet.columns = [
    { width: 5 },
    { width: 28 },
    { width: 18 },
    { width: 28 },
    { width: 32 },
    { width: 32 },
    { width: 28 },
    { width: 28 },
    { width: 30 },
    { width: 22 },
    { width: 10 },
    { width: 14 },
    { width: 8 },
  ];

  // Generate buffer
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(Buffer.from(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="leads_output.xlsx"',
    },
  });
}

async function generateCSV(leads: LeadBusiness[]) {
  const headers = [
    "Name", "Phone", "Email", "Website", "Facebook", "Instagram", "Telegram",
    "Address", "Opening Hours", "Site Year", "Mobile Friendly", "Score",
  ];

  const rows = leads.map((lead) => [
    lead.name, lead.phone, lead.email || "", lead.website,
    lead.facebook || "", lead.instagram || "", lead.telegram || "",
    lead.address, lead.openingHours || "",
    lead.copyrightYear ?? "", lead.isMobileFriendly ? "Yes" : "No", lead.score,
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  return new NextResponse(csvContent, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8-sig",
      "Content-Disposition": 'attachment; filename="leads_output.csv"',
    },
  });
}
