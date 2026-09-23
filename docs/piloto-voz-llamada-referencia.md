# Piloto de voz Deepgram + Claude + ElevenLabs — llamada de referencia

Fecha: 2026-09-23. Camino aislado del de producción (OpenAI Realtime, sin cambios):
`POST /api/voice/outbound-cartesia` (auth) → Twilio → `/api/voice/incoming-cartesia` →
WebSocket `/api/voice/stream-cartesia`. El nombre "Cartesia" es solo el codename original.

## Llamada de referencia (buena)

CallSid `CAfc96d2d17dad9843da1e58b4ef08180c`, cliente de prueba Brayan Vaz, deuda $5,000.
Resultado en base: `completed`, disposición "Payment scheduled", promesa de pago 5,000 para
2026-09-30 y recordatorio creados.

Latencias medidas (desde que Deepgram entrega la frase del cliente):

| Turno | Primer texto de Claude | Primer audio a Twilio |
|---|---|---|
| Saludo (texto fijo, sin Claude) | — | 457 ms |
| "Sí, soy yo" (camino rápido, sin Claude) | — | 168 ms |
| Turnos normales con Claude | 444–562 ms | 880–1051 ms |

Sin pausas de audio a media respuesta, sin barge-in falso, sin errores. Transcripción:

```
Agente: Hola, buenas tardes, soy Guadalupe Martínez, asistente virtual de HP Financial Services. ¿Tengo el gusto de hablar con Brayan Vaz?
Cliente: Sí, soy yo.
Agente: Perfecto, gracias. Me comunico para confirmar que cuente con las facturas correspondientes al mes y conocer la fecha estimada de pago. ¿Ya recibió sus facturas?
Cliente: Sí, sí la recibí.
Agente: Excelente. Mira, le comunico que tiene un saldo pendiente de cinco mil pesos. ¿Reconoce este adeudo?
Cliente: Sí, lo conozco.
Agente: Perfecto, gracias por confirmarlo. Le comento que su pago está próximo a vencer, así que me gustaría saber: ¿ya tiene contemplada una fecha para realizar el pago de los cinco mil pesos?
Cliente: Sí, pues el pago se hace el 30, si no me equivoco.
Agente: Muy bien, ¿entonces me confirma que el pago lo realizaría el treinta de septiembre?
Cliente: Sí.
Agente: Para confirmar, registraré el pago por cinco mil pesos para el treinta de septiembre. ¿Es correcta la información?
Cliente: Sí, es correcto.
Agente: Perfecto, para confirmar, he registrado el pago ... ¿Es correcta esta información?
Cliente: Sí.
Agente: Excelente, Brayan. Queda todo anotado entonces — el pago de cinco mil pesos para el treinta de septiembre. Fue un gusto atenderle, que tenga buen día.
```

Defecto que esa llamada dejó ver (corregido después en `executeTool`): `registrar_promesa_pago`
corrió dos veces y dejó 2 promesas + 2 recordatorios duplicados; `confirmar_identidad` corrió 5 veces.

## Valores de ajuste que funcionaron (no cambiarlos sin volver a probar con llamada real)

- Deepgram Nova-3, `language=es`, mulaw 8000, `endpointing=350`, `utterance_end_ms=1000`.
  Los fragmentos `is_final` se acumulan y se entregan al `speech_final` / `UtteranceEnd`.
- Claude `claude-haiku-4-5-20251001` en streaming; primera frase del turno a voz sin esperar
  el espacio siguiente; llamada de calentamiento (`warmUpClaude`) al iniciar la llamada.
- ElevenLabs `eleven_flash_v2_5`, `output_format=ulaw_8000`, un WebSocket por turno, texto por
  frases con `flush:true`. **La conexión tibia se renueva cada 3.5 s**: con más de ~10 s de
  espera ElevenLabs mete silencios de 1.5 s dentro del audio (medido: 3.9 s → 9.3 s).
- Barge-in solo con 2+ palabras reales en un interim de Deepgram (nunca por `SpeechStarted`,
  que se dispara con ruido) y nunca durante la despedida.
- Camino rápido: un "sí" inequívoco tras el saludo (cliente sin RFC) responde con el texto
  del guion sin pasar por Claude.
- Regla de formato añadida al prompt (`LIVE_FORMAT_RULES`): todo el texto del turno en un solo
  mensaje, sin acotaciones entre paréntesis.

## Límites conocidos del piloto (no tiene paridad completa con producción)

- No implementa `marcar_extension` (re-marcado a extensión tras conmutador).
- Buzón de voz: detección por frases del transcript (`VOICEMAIL_PATTERN`), no por audio.
- Un turno con RFC (`verificar_rfc`) ya compara en backend, pero no se ha probado en llamada real.
- Cada llamada mantiene 1–2 WebSockets de ElevenLabs abiertos: verificar el límite de
  conexiones simultáneas del plan antes de usarlo en lotes (el scheduler lanza 12 a la vez).
- Plan ElevenLabs Starter ($6/mes): 30k créditos; Flash cuesta 0.5 crédito por carácter.
- Para producción: `PUBLIC_URL` en `backend/.env` debe volver a `https://cobranza.rms-iqor-mexico.com`
  (hoy apunta al túnel ngrok de pruebas).
