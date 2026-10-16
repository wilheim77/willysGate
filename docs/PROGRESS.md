# Progreso

## Estado actual

**Fase 0, Historia: completada y aprobada (2026-10-16).**
**Fase 1, Esqueleto técnico: plan propuesto y pendiente del visto bueno.**

## Hecho

- [x] Tres premisas propuestas. Elegida: «Intereses».
- [x] Historia desarrollada y aprobada en [`docs/STORY.md`](STORY.md).
- [x] Se añade el **Elfo** a las razas jugables, con la enemistad entre elfos y enanos integrada en la trama.
- [x] Encargo original guardado en [`docs/BRIEF.md`](BRIEF.md) para retomar sin el historial del chat.

## Decisiones abiertas

- ¿Un cuarto compañero **mago**, opcional, de modo que el jugador recluta 3 de 4? Por ahora no: se mantienen Dorotea, Garrán y Anselmo.
- La composición del grupo cambia en mitad del acto: Garrán puede irse en D2 o D3, y Dorotea puede volverse enemiga en D4. El modelo de entidades tiene que permitir cambiar `controllerId` y facción en tiempo de ejecución. Encaja con la arquitectura, pero hay que tenerlo en cuenta desde la Fase 1.

## Siguiente paso

Aprobar el plan de la Fase 1 y montar el esqueleto técnico (Vite, Phaser, Vitest, `core/` y despliegue en Pages).
