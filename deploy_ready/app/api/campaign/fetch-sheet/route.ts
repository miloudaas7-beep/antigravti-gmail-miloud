import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { google } from "googleapis";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { sheetUrl, startRow, endRow } = await req.json();

    if (!sheetUrl) {
      return NextResponse.json({ error: "Sheet URL is required" }, { status: 400 });
    }

    // Extract spreadsheet ID from URL
    // Formats: /spreadsheets/d/SHEET_ID/edit or /spreadsheets/d/SHEET_ID
    const match = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (!match) {
      return NextResponse.json({ error: "Invalid Google Sheets URL. Make sure to copy the full URL from your browser." }, { status: 400 });
    }
    const spreadsheetId = match[1];

    // Get user's stored tokens from Supabase
    const { data: tokenData, error: tokenError } = await supabase
      .from("user_tokens")
      .select("access_token, refresh_token, token_expiry")
      .eq("user_id", user.id)
      .single();

    if (tokenError || !tokenData?.refresh_token) {
      return NextResponse.json({
        error: "Google account not connected. Please go to Settings and connect your Google account first.",
        needsAuth: true
      }, { status: 401 });
    }

    // Initialize OAuth client with user's tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
    );

    oauth2Client.setCredentials({
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
    });

    // Auto-refresh token if expired and save new token
    oauth2Client.on("tokens", async (tokens) => {
      if (tokens.access_token) {
        await supabase.from("user_tokens").update({
          access_token: tokens.access_token,
          token_expiry: tokens.expiry_date ? new Date(tokens.expiry_date).toISOString() : null,
        }).eq("user_id", user.id);
      }
    });

    const sheets = google.sheets({ version: "v4", auth: oauth2Client });

    // Fetch spreadsheet metadata to get sheet names
    const metaRes = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetName = metaRes.data.sheets?.[0]?.properties?.title ?? "Sheet1";
    const spreadsheetTitle = metaRes.data.properties?.title ?? "Untitled";

    let range = sheetName;
    if (startRow && endRow) {
        range = `${sheetName}!A${Math.max(1, parseInt(startRow))}:Z${Math.max(1, parseInt(endRow))}`;
    }

    // Fetch all values from the specified range
    const valuesRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: range,
    });

    let rows = valuesRes.data.values;
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: "Sheet is empty or has no data rows in the specified range." }, { status: 400 });
    }

    // If starting from row 1 or grabbing the whole sheet, the first row is headers.
    // If starting from > 1, we don't have headers in this fetch, so we should fetch headers separately!
    let headers: string[] = [];
    let dataRows: Record<string, string>[] = [];
    
    if (startRow && parseInt(startRow) > 1) {
        // Fetch row 1 for headers
        const headerRes = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range: `${sheetName}!A1:Z1`,
        });
        headers = headerRes.data.values?.[0]?.map((h: string) => h.trim()) || [];
        dataRows = rows.map((row) => {
            const obj: Record<string, string> = {};
            headers.forEach((header: string, i: number) => {
                obj[header] = row[i] ?? "";
            });
            return obj;
        }).filter(row => Object.values(row).some(v => v !== ""));
    } else {
        // First row is headers
        headers = rows[0].map((h: string) => h.trim());
        dataRows = rows.slice(1).map((row) => {
          const obj: Record<string, string> = {};
          headers.forEach((header: string, i: number) => {
            obj[header] = row[i] ?? "";
          });
          return obj;
        }).filter(row => Object.values(row).some(v => v !== "")); // Remove fully empty rows
    }

    return NextResponse.json({
      success: true,
      spreadsheetTitle,
      sheetName,
      spreadsheetId,
      headers,
      rows: dataRows,
      count: dataRows.length,
    });

  } catch (error: any) {
    console.error("Sheet fetch error:", error);
    const msg = error?.message || "Failed to fetch sheet data";
    if (msg.includes("PERMISSION_DENIED") || msg.includes("403")) {
      return NextResponse.json({
        error: "Permission denied. Make sure the Google Sheet is shared with your Google account or is accessible.",
      }, { status: 403 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
