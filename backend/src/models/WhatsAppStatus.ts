import mongoose from "mongoose"

const WhatsAppStatusSchema =
new mongoose.Schema(

{

messageId:{

type:mongoose.Schema.Types.ObjectId,

ref:"Message",

default:null

},

metaMessageId:{

type:String,

required:true

},

status:{

type:String,

enum:[

"sent",

"delivered",

"read",

"failed"

],

required:true

},

rawData:{

type:Object,

default:null

}

},

{

timestamps:true

}

)

export default mongoose.model(
"WhatsAppStatus",
WhatsAppStatusSchema
)