import {
  Schema,
  model,
} from "mongoose"
import { isValidRFC, normalizeRFC } from "../utils/rfc"

const ClientSchema =
new Schema(

{

name:{
type:String,
required:true
},

phone:{
type:String,
required:true,
unique:true
},

// Números adicionales del cliente — si no contesta el número principal en
// outreachTimeoutMinutes, se intenta automáticamente con el siguiente
// (ver phoneFallback.service.ts).
alternatePhones:{
type:[String],
default:[]
},

// Índice del número que se probó más recientemente (0 = phone, 1 = alternatePhones[0], ...)
outreachPhoneIndex:{
type:Number,
default:0
},

// Cuándo se mandó el mensaje al número actual — se limpia (null) en cuanto
// el cliente responde, lo que cancela el fallback automático.
outreachSentAt:{
type:Date,
default:null
},

// true una vez que se agotaron todos los números sin respuesta.
outreachExhausted:{
type:Boolean,
default:false
},

// RFC (identificador fiscal, opcional) — se usa como segundo factor de
// verificación de identidad en la llamada de voz (últimos 4 caracteres).
rfc:{
type:String,
default:null,
set:(v: string | null) => (v ? normalizeRFC(v) : null),
validate:{
validator:(v: string | null) => v === null || v === "" || isValidRFC(v),
message:"RFC inválido — verifica el formato (4 letras + 6 dígitos + 3 caracteres para persona física, o 3 letras + 6 dígitos + 3 caracteres para persona moral)",
},
},

debt:{
type:Number,
default:0
},

// El cliente quedó marcado como REQUIERE_HUMANO en una llamada de voz — se resalta
// en la tabla de clientes hasta que alguien lance el aviso al agente humano.
requiresHuman:{
type:Boolean,
default:false
},

// Motivo que dio el modelo al marcar requerir_humano (opcional, se lee en el aviso).
requiresHumanReason:{
type:String,
default:null
},

// Extensión del conmutador de este cliente, una vez detectada (ver marcar_extension en
// voiceStream.controller.ts) — las llamadas futuras la marcan directo (ver
// placeOutboundCall en voice.controller.ts), sin tener que redetectarla cada vez.
knownExtension:{
type:String,
default:null
},

risk:{
type:String,
enum:[
"low",
"medium",
"high"
],
default:"medium"
},

channel:{
type:String,
default:"whatsapp"
},

// STATUS CLIENTE
status:{
type:String,
enum:[
"pending",
"contacted",
"negotiating",
"promised",
"paid",
"no_response"
],
default:"pending"
},

// SCORE INTERNO
score:{
type:Number,
default:50
},

// ETIQUETAS
tags:{
type:[String],
default:[]
},

// ULTIMA RESPUESTA
lastReply:{
type:String,
default:null
},

// FECHA ULTIMA RESPUESTA
lastReplyAt:{
type:Date,
default:null
},

// ULTIMO CONTACTO
lastContactAt:{
type:Date,
default:null
},

// INTENCION DETECTADA
lastIntent:{
type:String,
default:null
},

// TOTAL MENSAJES
totalMessages:{
type:Number,
default:0
},

// TOTAL RESPUESTAS
totalReplies:{
type:Number,
default:0
},

// OBSERVACIONES
notes:{
type:String,
default:null
},

// PAIS
country:{
type:String,
default:"Mexico"
},

// ID CLIENTE (SISTEMA EXTERNO)
customerId:{
type:Number,
default:null
},

// ID COBRADOR
collectorId:{
type:Number,
default:null
},

// EQUIPO
team:{
type:String,
default:null
},

// LIDER DE EQUIPO
teamLeader:{
type:String,
default:null
},

// COBRADOR
collector:{
type:String,
default:null
},

// NUMERO DE FACTURA
invoiceNumber:{
type:String,
default:null
},

// BUCKET DE MORA (texto crudo, ej. "A. Current", "C. 31-60") — se sincroniza
// desde la factura más reciente del cliente cada vez que sus facturas cambian
// (ver invoiceController.ts, syncClientFromInvoices). Distinto de agingDays,
// que es un conteo numérico de días.
agingTarget:{
type:String,
default:null
},

// FECHA DE CREACION (DEL CREDITO/FACTURA)
createDate:{
type:Date,
default:null
},

// FECHA DE VENCIMIENTO
dueDate:{
type:Date,
default:null
},

// DIAS DE MORA
agingDays:{
type:Number,
default:null
},

// PRESTAMO O ARRENDAMIENTO
loanLease:{
type:String,
enum:[
"Loan",
"Lease",
null
],
default:null
},

// MONTO EN DOLARES
usdAmount:{
type:Number,
default:null
},

// CONTACTO
contact:{
type:String,
default:null
},

// PROXIMA ACCION
nextAction:{
type:String,
default:null
},

// MONTO DE LA PROMESA DE PAGO
paymentPromiseAmount:{
type:Number,
default:null
},

// FECHA DE LA PROMESA DE PAGO
datePromise:{
type:Date,
default:null
},

// --- Ciclo de cobranza automática (ver services/autoCallScheduler.service.ts) ---
// Paso ya hecho en el ciclo semanal actual: 0=nada, 1=1era llamada, 2=2da llamada,
// 3=mensaje WhatsApp, 4=WhatsApp final — es lo que se muestra como "contador" en la
// tabla de Clients.
autoCallAttempt:{
type:Number,
default:0
},

// Cuándo arrancó el ciclo actual (1er intento) — un ciclo dura 7 días; pasado ese
// tiempo, el cliente vuelve a ser elegible para un ciclo nuevo desde 0.
autoCallCycleStartAt:{
type:Date,
default:null
},

// Cuándo toca el siguiente paso del ciclo — null si no hay ninguno programado.
autoCallNextAttemptAt:{
type:Date,
default:null
},

// true cuando ya se disparó el paso 4 (WhatsApp final) sin que el cliente respondiera —
// se agotó todo el ciclo automático de la semana, solo informativo en la UI.
autoCycleExhausted:{
type:Boolean,
default:false
},

// --- Blacklist de clientes morosos con negativa de pago (ver tarjeta "Implementar
// Blacklist de Clientes Morosos en el Dashboard") ---
// 'none': nunca se ha marcado. 'candidate': la IA detectó una negativa de pago (voz o
// WhatsApp) y lo sugiere para revisión. 'confirmed': un administrador lo confirmó (o lo
// agregó a mano) — este es el que realmente cuenta como "en la Blacklist".
blacklistStatus:{
type:String,
enum:["none","candidate","confirmed"],
default:"none"
},

// Motivo de la negativa, en las palabras que dio el cliente (lo llena la IA al marcar,
// o el administrador al agregar/editar a mano).
blacklistReason:{
type:String,
default:null
},

// Cuándo se marcó por última vez (como candidato o al confirmarlo) — se usa como
// "fecha del último contacto" relacionado a la negativa en el listado.
blacklistMarkedAt:{
type:Date,
default:null
},

// Persona de cobranza asignada para dar seguimiento al caso — texto libre, mismo
// patrón que `collector`/`teamLeader` (no hay cuentas de usuario por cobrador todavía).
blacklistAssignedTo:{
type:String,
default:null
},

// --- Exclusión temporal del ciclo automático de cobranza (ver tarjeta "Exclusión
// automática de clientes del ciclo mensual de cobranza") ---
// Mientras esta fecha sea futura, autoCallScheduler.service.ts y
// reminderScheduler.service.ts NO lo eligen para llamadas/mensajes automáticos — normalmente
// se fija a fin del mes en curso. No borra ni marca el pago como confirmado: solo pausa el
// ciclo mientras alguien verifica de verdad (ver Ticket asociado). Si al mes siguiente la
// deuda sigue abierta (el pago nunca se concretó), esta fecha ya pasó y el cliente vuelve a
// ser elegible normalmente — no hace falta reincorporarlo a mano.
collectionExcludedUntil:{
type:Date,
default:null
},

// Motivo en texto legible (ej. "Pago reportado", "Pago en proceso — tesorería", "Pago
// domiciliado") — se muestra en la ficha del cliente.
collectionExclusionReason:{
type:String,
default:null
},

// Cuándo el cliente dio la información que disparó la exclusión.
collectionExcludedAt:{
type:Date,
default:null
}

},

{

timestamps:true

}

)

ClientSchema.index({ status: 1 })
// sparse: permite muchos clientes con customerId null (los dados de alta a
// mano, sin sistema externo), pero exige que sea único entre los que sí lo
// tienen — sin esto, dos clientes con el mismo Customer ID hacen que el
// import de facturas no sepa a cuál asignárselas (ver invoiceController.ts).
ClientSchema.index({ customerId: 1 }, { unique: true, sparse: true })

export default model(
"Client",
ClientSchema
)