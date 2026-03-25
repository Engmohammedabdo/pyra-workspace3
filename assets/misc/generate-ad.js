const fs = require('fs');

async function generateAd() {
  const apiKey = process.env.GOOGLE_API_KEY;
  
  const prompt = `Create a professional Instagram square ad (1080x1080) for "Pyra AI" - an AI assistant for medical clinics.

Design requirements:
- Modern, clean healthcare marketing aesthetic
- Main headline in Arabic: "عيادتك مشغولة؟ خلي Pyra AI يساعدك"
- Subheadline: "المساعد الذكي للعيادات"
- Use medical/healthcare colors (blues, whites, soft greens)
- Include a simple AI/robot icon or healthcare symbol
- Bottom text: "pyramedia.info"
- Professional, trustworthy look
- Arabic text should be right-to-left`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp-image-generation:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          responseModalities: ["image", "text"]
        }
      })
    }
  );

  const data = await response.json();
  console.log('Response status:', response.status);
  
  if (data.candidates && data.candidates[0]?.content?.parts) {
    for (const part of data.candidates[0].content.parts) {
      if (part.inlineData) {
        const imageData = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'image/png';
        const ext = mimeType.includes('jpeg') ? 'jpg' : 'png';
        fs.writeFileSync(`pyra-ad-gemini.${ext}`, Buffer.from(imageData, 'base64'));
        console.log(`✅ Image saved: pyra-ad-gemini.${ext}`);
        console.log(`Size: ${Buffer.from(imageData, 'base64').length} bytes`);
        return;
      }
      if (part.text) {
        console.log('Text response:', part.text);
      }
    }
  } else {
    console.log('Full response:', JSON.stringify(data, null, 2));
  }
}

generateAd().catch(console.error);
