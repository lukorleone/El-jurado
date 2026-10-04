export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { personaA, personaB } = req.body || {};
  if (!personaA || !personaB || personaA.trim().length < 15 || personaB.trim().length < 15) {
    return res.status(400).json({ error: 'Faltan las dos versiones del caso.' });
  }
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'La IA todavía no está configurada en el servidor.' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        store: false,
        instructions: `Eres El Jurado, un mediador imparcial para desacuerdos cotidianos entre parejas.
Analiza únicamente la información aportada. No premies a quien escriba más ni inventes hechos.
Valora coherencia, hechos concretos, responsabilidad asumida, acuerdos previos, proporcionalidad y empatía.
Los porcentajes representan cuánto respaldan los argumentos disponibles a cada postura y deben sumar 100.
Si faltan datos importantes o ambas partes tienen razones similares, usa un resultado cercano al 50/50.
No presentes el resultado como verdad absoluta. Evita diagnósticos psicológicos.
Si detectas indicios de violencia, amenazas, coacción o peligro, prioriza seguridad y recomienda buscar ayuda adecuada en vez de tratarlo como una competición.`,
        input: `PERSONA A:\n${personaA.slice(0, 4000)}\n\nPERSONA B:\n${personaB.slice(0, 4000)}`,
        text: {
          format: {
            type: 'json_schema',
            name: 'veredicto_el_jurado',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                veredicto: { type: 'string' },
                porcentajeA: { type: 'integer', minimum: 0, maximum: 100 },
                porcentajeB: { type: 'integer', minimum: 0, maximum: 100 },
                explicacion: { type: 'string' },
                consejo: { type: 'string' }
              },
              required: ['veredicto','porcentajeA','porcentajeB','explicacion','consejo'],
              additionalProperties: false
            }
          }
        }
      })
    });

    const data = await response.json();
    if (!response.ok) {
      console.error('OpenAI error', data);
      return res.status(502).json({ error: 'El Jurado no ha podido analizar el caso ahora mismo.' });
    }

    const item = (data.output || []).find(x => x.type === 'message');
    const part = item?.content?.find(x => x.type === 'output_text');
    if (!part?.text) return res.status(502).json({ error: 'Respuesta de IA incompleta.' });

    const verdict = JSON.parse(part.text);
    const a = Math.max(0, Math.min(100, Number(verdict.porcentajeA)));
    verdict.porcentajeA = a;
    verdict.porcentajeB = 100 - a;
    return res.status(200).json(verdict);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno al consultar El Jurado.' });
  }
}
