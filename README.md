# Kusi Chat · MVP1

Extensionista agrícola digital para pequeños productores del Perú. MVP1 del equipo para **Despega CLEIN 2026**.

**Qué demuestra:** un consejo preventivo sale de una regla con fuente (etapa del cultivo + clima), mejora con las respuestas de los agricultores de la zona y se puede rastrear hasta su origen.

## Cómo probarlo

Abre `index.html` en el navegador (o el link de GitHub Pages). No necesita instalación ni servidor.

1. En la vista **Agricultor**, toca los botones: cultivo → hace cuánto sembraste → zona.
2. Recibes un consejo con su nivel de confianza y, en **¿De dónde sale?**, su trazabilidad. Con **Escuchar** lo oyes en voz sintética.
3. Responde la pregunta de seguimiento. Esa respuesta cuenta para tu zona.
4. En el **Panel del técnico**:
   - **Zonas:** nivel 1 (guía general), 2 (ajustada con respuestas) o 3 (validada). Usa *Simular 6 respuestas…* para ver cómo una zona sube de nivel y *Validar zona* para simular al técnico.
   - **Consejos y trazabilidad:** regla, fuente, datos usados, ajuste de zona, nivel y validación de cada consejo.
   - **Casos derivados:** lo que el sistema no debe resolver solo (manchas, plagas, otro cultivo, pedido de técnico). También se crean al escribir un texto libre en el chat.
   - **Reglas:** las 12 reglas del cultivo y su estado.
   - **Demostración:** elige un escenario de clima (helada, lluvia con humedad, lluvia fuerte, seco) para mostrar cada regla.

## Qué es real y qué es simulado

| Real | Simulado o ilustrativo [SU] |
|---|---|
| Motor de reglas y cálculo de la etapa | Agricultores y sus respuestas |
| Pronóstico de Open-Meteo (si hay conexión; si no, usa un ejemplo marcado) | Validación del técnico |
| Registro de trazabilidad por consejo | **Reglas agronómicas y umbrales: ilustrativas, por validar con fichas INIA/MIDAGRI** |
| Ajuste de zona al acumular respuestas | Número mínimo de respuestas (N = 5) y tamaño del ajuste (3 días) |
| Derivación de casos | Voz del audio (síntesis del navegador) |

No hay WhatsApp real: el chat es web con forma de WhatsApp. No hay machine learning: el ajuste por zona es una regla con muestra mínima.

## Estructura

- `engine.js`: etapas, reglas, ajuste por zona, niveles y escenarios de clima (funciones puras).
- `app.js`: chat del agricultor y panel del técnico.
- `styles.css`, `index.html`: interfaz.
- `tests/engine.test.js`: pruebas del motor (`node tests/engine.test.js`).

## Para un piloto real

Reglas validadas con fichas técnicas y un agrónomo, canal real de WhatsApp Business, base de datos central, consentimiento explícito para guardar ubicación y datos del cultivo (Ley 29733) y medición de adopción, cumplimiento de consejos y pérdidas evitadas.
