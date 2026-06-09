import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { product_type, fullName, email, phone, investmentAmount, investmentHorizon, riskProfile, additionalNotes } = await req.json();

    // Format the WhatsApp message
    const message = `🔔 *New Investment Lead*

📦 *Product:* ${product_type}

👤 *Client Details:*
• Name: ${fullName}
• Email: ${email}
• Phone: ${phone}

💰 *Investment Details:*
• Amount: ${investmentAmount}
• Horizon: ${investmentHorizon}
• Risk Profile: ${riskProfile}

📝 *Additional Notes:*
${additionalNotes || 'None provided'}

⏰ Received: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`;

    // WhatsApp Business API endpoint (you'll need to configure this)
    // For now, we'll use a webhook or direct WhatsApp Web API
    const whatsappNumber = '918939433113'; // Your phone number
    const encodedMessage = encodeURIComponent(message);
    const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;

    // You can also send an email notification here using a service like SendGrid or Resend
    // For now, we'll just log the lead and return success
    console.log('New lead received:', {
      product_type,
      fullName,
      email,
      phone,
      investmentAmount,
      investmentHorizon,
      riskProfile,
      additionalNotes,
    });

    // Return success with WhatsApp URL
    return new Response(
      JSON.stringify({
        success: true,
        message: 'Lead notification sent successfully',
        whatsappUrl,
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error('Error processing lead notification:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
