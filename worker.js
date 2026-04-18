export default {
  async fetch(request, env, ctx) {

    // ============================================================
    // FUNGSI HASH SHA-256 (Wajib oleh Meta untuk data pelanggan)
    // ============================================================
    async function hashData(value) {
      if (!value) return null;
      // Bersihkan: lowercase, hapus spasi di awal/akhir
      const cleaned = value.toString().toLowerCase().trim();
      const msgBuffer = new TextEncoder().encode(cleaned);
      const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    }

    // Bersihkan nomor HP ke format E.164 (contoh: 628xxx)
    function cleanPhone(phone) {
      if (!phone) return null;
      // Hapus semua karakter selain angka
      let cleaned = phone.toString().replace(/[^0-9]/g, "");
      // Ganti awalan 0 dengan 62 (Indonesia)
      if (cleaned.startsWith("0")) {
        cleaned = "62" + cleaned.slice(1);
      }
      return cleaned;
    }

    // ============================================================
    // 1. HANDLING CORS
    // ============================================================
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    // ============================================================
    // 2. HANDLING POST REQUEST (dari Landing Page & n8n)
    // ============================================================
    if (request.method === "POST") {
      try {
        const body = await request.json();

        // --- Data Umum (dari semua sumber) ---
        const eventName  = body.eventName || body.event || "Contact";
        const eventId    = body.eventId   || body.event_id;
        const sourceUrl  = body.sourceUrl || request.headers.get("Referer");
        const buttonName = body.buttonName || eventName;

        const clientIpAddress  = request.headers.get("CF-Connecting-IP");
        const clientUserAgent  = request.headers.get("User-Agent");

        const pixelId     = env.FB_PIXEL_ID;
        const accessToken = env.FB_ACCESS_TOKEN;
        const facebookApiUrl = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;

        // --------------------------------------------------------
        // 3. BANGUN user_data
        //    - Contact event: hanya IP & User Agent (dari browser)
        //    - Purchase event: tambah nomor HP ter-hash (dari n8n)
        // --------------------------------------------------------
        const userData = {
          client_ip_address: clientIpAddress,
          client_user_agent: clientUserAgent,
        };

        if (eventName === "Purchase" && body.phone) {
          const cleanedPhone = cleanPhone(body.phone);
          const hashedPhone  = await hashData(cleanedPhone);
          if (hashedPhone) {
            userData.ph = [hashedPhone]; // ph = phone, format array, sudah hash
          }
        }

        // --------------------------------------------------------
        // 4. BANGUN custom_data
        //    - Contact event: nilai default (estimasi)
        //    - Purchase event: nilai nyata dari n8n
        // --------------------------------------------------------
        const customData = {
          content_name: `Madu S4E - ${buttonName}`,
          currency: body.currency || "IDR",
        };

        if (eventName === "Purchase") {
          // Nilai transaksi nyata dari n8n
          customData.value    = Number(body.value) || 275000;
          customData.num_items = 1;
          customData.content_type = "product";
          customData.content_ids  = ["madu-s4e-murni"];
        } else {
          // Contact: nilai estimasi (tidak berubah dari sebelumnya)
          customData.value = 150000;
        }

        // --------------------------------------------------------
        // 5. SUSUN PAYLOAD FINAL KE META
        // --------------------------------------------------------
        const eventData = {
          data: [
            {
              event_name:       eventName,
              event_time:       Math.floor(Date.now() / 1000),
              action_source:    "website",
              event_id:         eventId,
              event_source_url: sourceUrl,
              user_data:        userData,
              custom_data:      customData,
            },
          ],
        };

        // --------------------------------------------------------
        // 6. KIRIM KE META GRAPH API
        // --------------------------------------------------------
        const facebookResponse = await fetch(facebookApiUrl, {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify(eventData),
        });

        const facebookResult = await facebookResponse.json();

        return new Response(
          JSON.stringify({
            success:     true,
            event_type:  eventName,   // info: event apa yang dikirim
            event_id:    eventId,
            fb_response: facebookResult,
          }),
          {
            status:  200,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );

      } catch (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          {
            status:  400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          }
        );
      }
    }

    // ============================================================
    // 7. STATUS CHECK (GET request — untuk cek worker aktif)
    // ============================================================
    return new Response("Madu S4E CAPI Worker is Running 🔥 | Contact & Purchase Ready ✅", {
      status: 200,
      headers: corsHeaders,
    });
  },
};
