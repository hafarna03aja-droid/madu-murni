export default {
  async fetch(request, env, ctx) {
    // 1. Handling CORS (Sama seperti sebelumnya)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    if (request.method === "POST") {
      try {
        const body = await request.json();

        // --- TAMBAHAN KRUSIAL ---
        const eventName = body.eventName || body.event || "Contact";
        const eventId = body.eventId || body.event_id; // Diambil dari frontend
        const sourceUrl = body.sourceUrl || request.headers.get("Referer");
        // ------------------------

        const clientIpAddress = request.headers.get("CF-Connecting-IP");
        const clientUserAgent = request.headers.get("User-Agent");

        const pixelId = env.FB_PIXEL_ID;
        const accessToken = env.FB_ACCESS_TOKEN;

        const facebookApiUrl = `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`;

        const eventData = {
          data: [
            {
              event_name: eventName,
              event_time: Math.floor(Date.now() / 1000),
              action_source: "website",
              event_id: eventId,
              event_source_url: sourceUrl,
              user_data: {
                client_ip_address: clientIpAddress,
                client_user_agent: clientUserAgent,
              },
              custom_data: {
                content_name: "Madu SAE Murni",
                value: 150000,
                currency: "IDR"
              }
            }
          ]
        };

        // Jika ada test_event_code (untuk keperluan Uji Peristiwa real-time)
        if (body.testEventCode || body.test_event_code) {
          eventData.test_event_code = body.testEventCode || body.test_event_code;
        }

        const facebookResponse = await fetch(facebookApiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(eventData),
        });

        const facebookResult = await facebookResponse.json();

        return new Response(JSON.stringify({ success: true, fb_response: facebookResult }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        });

      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }
    }

    return new Response("Madu SAE CAPI Worker is Running 🔥", { status: 200 });
  },
};
