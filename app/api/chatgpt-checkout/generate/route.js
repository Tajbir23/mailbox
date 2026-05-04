import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function POST(request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || (session.user.role !== "admin" && !session.user.canAccessCheckout)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const body = await request.json();
    const { accessToken } = body;

    if (!accessToken) {
      return NextResponse.json({ error: "Access token is required" }, { status: 400 });
    }

    const response = await fetch("https://chatgpt.com/backend-api/payments/checkout", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" // Sometimes helps to avoid basic bot blocks
      },
      body: JSON.stringify({
        entry_point: "all_plans_pricing_modal",
        plan_name: "chatgptplusplan",
        billing_details: {
          country: "ID",
          currency: "IDR"
        },
        promo_campaign: {
          promo_campaign_id: "plus-1-month-free",
          is_coupon_from_query_param: false
        },
        checkout_ui_mode: "custom"
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ChatGPT API Error:", errorText);
      
      let errorMessage = `Failed to generate checkout session. Status: ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson?.detail === "User is already paid") {
          errorMessage = "User is already paid";
        } else if (errorJson?.detail) {
          errorMessage = errorJson.detail;
        }
      } catch (e) {
        // Not a JSON response
      }

      return NextResponse.json({ 
        error: errorMessage,
        details: errorText
      }, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("Checkout Generation Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}