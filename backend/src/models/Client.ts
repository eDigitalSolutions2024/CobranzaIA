import {
  Schema,
  model,
} from "mongoose"

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

debt:{
type:Number,
default:0
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
}

},

{

timestamps:true

}

)

export default model(
"Client",
ClientSchema
)