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
}

},

{

timestamps:true

}

)

ClientSchema.index({ phone: 1 })
ClientSchema.index({ status: 1 })

export default model(
"Client",
ClientSchema
)